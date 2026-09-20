/**
 * Account deletion, at the layer with the logic.
 *
 * P13 / TESTING-STRATEGY.md §3 — what is worth asserting here is a translation table and
 * an ORDER, and neither is reachable from a browser: CI runs no identity service, so a
 * spec could only ever exercise the unconfigured path.
 *
 * The translation table was written against authservice's source rather than against this
 * module's behaviour — the statuses, the `{ error }` bodies and the three-way 400 are
 * `AuthController.DeleteAccount`'s, read at the pinned image's tag. What these tests do
 * NOT prove is that authservice still behaves that way; only a real one can say that, and
 * the pinned image cannot be pulled in the sandbox this was written in. ADR-0021 records
 * what was measured and against what.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  deleteReaderAccount,
  type DeletionSteps,
  type ProgressOutcome,
} from './account-deletion.ts';
import { classifyDeleteResponse, type DeleteAccountOutcome } from './delete-account.ts';

// ── The contract with authservice ───────────────────────────────────────────────────────

test('a 200 is a deletion', () => {
  assert.deepEqual(classifyDeleteResponse(200, { message: 'Account deleted successfully' }), {
    kind: 'deleted',
  });
});

test('a 200 whose body could not be read is still a deletion', () => {
  // `DeleteAccount` has already committed by the time it serialises anything, so a body
  // this application could not parse says nothing about whether the deletion happened.
  assert.deepEqual(classifyDeleteResponse(200, null), { kind: 'deleted' });
});

test('a missing password and a wrong one are different answers', () => {
  // Same status, same body shape, different instruction to the reader. Collapsing them
  // tells somebody who left the field empty that what they typed was wrong.
  assert.deepEqual(classifyDeleteResponse(400, { error: 'Password is required' }), {
    kind: 'password-required',
  });
  assert.deepEqual(classifyDeleteResponse(400, { error: 'Invalid password' }), {
    kind: 'password-rejected',
  });
});

test('a rejected confirmation is a deployment fault, not a reader fault', () => {
  // This application sends the literal, so a reader cannot produce this. If authservice
  // reports one, the constant has drifted from its contract — which belongs in a log and
  // must never be shown to a reader as "what you typed was wrong".
  const outcome = classifyDeleteResponse(400, { error: "Confirmation text must be 'DELETE'" });
  assert.equal(outcome.kind, 'unavailable');
});

test('a 400 this application does not recognise is not guessed at', () => {
  // The three 400s are separated ONLY by English prose in another repository, which is not
  // a contract anybody promised to keep. Guessing wrong makes a reader retype a password
  // that was right, for ever, with no way to discover the real fault.
  const outcome = classifyDeleteResponse(400, { errors: ['Concurrency failure'] });
  assert.equal(outcome.kind, 'unavailable');
});

test('401 and 404 carry through as themselves', () => {
  assert.deepEqual(classifyDeleteResponse(401, null), { kind: 'unauthenticated' });
  assert.deepEqual(classifyDeleteResponse(404, null), { kind: 'no-such-account' });
});

test('a status this application does not translate names the status', () => {
  const outcome = classifyDeleteResponse(503, null);
  assert.equal(outcome.kind, 'unavailable');
  assert.match(outcome.kind === 'unavailable' ? outcome.reason : '', /503/);
});

// ── The order, which is the decision ────────────────────────────────────────────────────

/** Records what was called, in the order it was called. */
function spy(
  progress: ProgressOutcome,
  account: DeleteAccountOutcome,
  preference: ProgressOutcome = { kind: 'forgotten' },
): { readonly calls: string[]; readonly steps: DeletionSteps } {
  const calls: string[] = [];
  return {
    calls,
    steps: {
      forgetProgress: async () => {
        calls.push('progress');
        return progress;
      },
      forgetPreference: async () => {
        calls.push('preference');
        return preference;
      },
      deleteAccount: async () => {
        calls.push('account');
        return account;
      },
    },
  };
}

test('every row this service holds is removed before the account is asked for', async () => {
  const { calls, steps } = spy({ kind: 'forgotten' }, { kind: 'deleted' });

  assert.deepEqual(await deleteReaderAccount('token', 'pw', steps), { kind: 'deleted' });
  // The chosen edition is in this list for the same reason the place is: once authservice
  // has marked the account deleted, nobody can sign in as that subject again, so a row left
  // behind under it is unreachable by any reader for ever (ADR-0049).
  assert.deepEqual(calls, ['progress', 'preference', 'account']);
});

test('a failed progress removal leaves the account untouched', async () => {
  // The whole point of the ordering. The other order's worst case is an account that is
  // gone and rows in `apidb` under a subject that can never sign in again — unreachable by
  // any reader, produced by the feature whose purpose is removing rows.
  const { calls, steps } = spy({ kind: 'unavailable', reason: 'api answered 500' }, { kind: 'deleted' });

  const outcome = await deleteReaderAccount('token', 'pw', steps);

  assert.equal(outcome.kind, 'progress-not-removed');
  assert.deepEqual(calls, ['progress'], 'authservice must not have been asked');
});

test('a failed preference removal leaves the account untouched too', async () => {
  // The same argument one table over, and it is the one a new reader-scoped table would
  // break silently: a deletion that cleared the place, skipped the edition and went on to
  // close the account leaves a row nobody can ever reach.
  const { calls, steps } = spy({ kind: 'forgotten' }, { kind: 'deleted' }, {
    kind: 'unavailable',
    reason: 'api answered 500',
  });

  const outcome = await deleteReaderAccount('token', 'pw', steps);

  assert.equal(outcome.kind, 'progress-not-removed');
  assert.deepEqual(calls, ['progress', 'preference'], 'authservice must not have been asked');
});

test('a wrong password costs the synced copy and nothing else', async () => {
  // It is recoverable BECAUSE local progress survives losing a session (ADR-0019): the
  // browser still holds every position, and the next sync finds an empty remote and pushes
  // the lot back. Reverse that decision and this ordering becomes the wrong one.
  const { calls, steps } = spy({ kind: 'forgotten' }, { kind: 'password-rejected' });

  assert.deepEqual(await deleteReaderAccount('token', 'wrong', steps), {
    kind: 'password-rejected',
  });
  assert.deepEqual(calls, ['progress', 'preference', 'account']);
});

test('an account authservice has never heard of is a completed deletion', async () => {
  // The progress is gone and there is no account. The reader's stated goal is met, and
  // reporting a failure would ask them to retry an operation with nothing left to do.
  const { steps } = spy({ kind: 'forgotten' }, { kind: 'no-such-account' });

  assert.deepEqual(await deleteReaderAccount('token', null, steps), { kind: 'deleted' });
});

test('an expired session stops before anything is removed', async () => {
  const { calls, steps } = spy({ kind: 'unauthenticated' }, { kind: 'deleted' });

  assert.deepEqual(await deleteReaderAccount('token', 'pw', steps), { kind: 'unauthenticated' });
  assert.deepEqual(calls, ['progress']);
});
