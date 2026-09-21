/**
 * The accounts the identity fixture knows, and the only thing the specs import from it.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE FILE FROM THE SERVER, AND IT IS NOT TIDINESS.
 *
 * `authservice-stub.mts` has a side effect at its top level: it listens. A spec that
 * imported the accounts from there would start a SECOND fixture inside the Playwright
 * worker, on a port the first one already holds, and the run would die on EADDRINUSE with
 * an error naming a port rather than a cause. Measured while writing this file — it is the
 * reason for the split, and the reason this module has nothing in it but data.
 * ──────────────────────────────────────────────────────────────────────────────────────
 *
 * THESE ARE NOT CREDENTIALS. No deployment of ab-ovo has ever accepted them, the fixture
 * that does accept them exists only inside the acceptance suite, and the value is in the
 * tree on purpose: a test's inputs must not depend on a deployment, and the spec and the
 * fixture have to agree on them exactly. P5 governs configuration that varies by
 * environment; this varies by nothing.
 */

export interface FixtureAccount {
  /** Becomes `sub` in the token. */
  readonly id: string;
  readonly email: string;
  readonly password: string;
  /**
   * Becomes the role claim. **The length matters**: authservice emits one claim per role
   * and the serialiser collapses a single one to a bare string and two or more to an array,
   * so the two accounts below exist to cover both shapes. See `roleClaim` in the server.
   */
  readonly roles: readonly string[];
  /**
   * Present iff the account has a second factor. Its presence is what makes the fixture
   * answer a correct password with a challenge instead of tokens.
   */
  readonly secondFactor?: {
    readonly code: string;
    readonly recoveryCode: string;
  };
}

/** One role, so the token carries the role claim as a BARE STRING. */
export const READER: FixtureAccount = {
  id: 'fixture-reader-1',
  email: 'reader@example.test',
  password: 'fixture-password-not-a-secret',
  roles: ['Reader'],
};

/** Two roles, so the token carries the role claim as an ARRAY. */
export const AUTHOR: FixtureAccount = {
  id: 'fixture-author-1',
  email: 'author@example.test',
  password: 'fixture-password-not-a-secret',
  roles: ['Reader', 'Author'],
};

/**
 * An account with a second factor (issue #30).
 *
 * The correct password gets a CHALLENGE rather than tokens, which is authservice answering
 * 200 with a different body — the sharp edge of the contract `classifyLoginResponse` exists
 * for. The code and the recovery code below are what the fixture's `/api/v1/auth/2fa/login`
 * accepts.
 *
 * NOT A REAL TOTP. The fixture checks a fixed string rather than computing a time-based
 * code, and that is deliberate: a real one would make every assertion depend on the clock,
 * and what the acceptance suite is testing is this application's handling of the exchange,
 * not an implementation of RFC 6238. The unit tests pin the contract; see ADR-0029.
 */
export const TWO_FACTOR: FixtureAccount = {
  id: 'fixture-2fa-1',
  email: 'twofactor@example.test',
  password: 'fixture-password-not-a-secret',
  roles: ['Reader'],
  secondFactor: {
    code: '424242',
    /** Single use, exactly as a real one is — the fixture spends it. */
    recoveryCode: 'FIXTURE-RECOVERY-1',
  },
};

/**
 * The one account with the `Admin` role, ADR-0060's ingestion endpoint requires
 * (`MapContentAdminEndpoints`, `Program.cs`'s `RequireRole("Admin", "SuperAdmin")`). Not a
 * reader fixture — nothing in a spec signs in as this account — it exists so
 * `fixtures/ingest-content.mts` can mint a bearer the same way every other token in this
 * file is minted, rather than a second, parallel way of producing one.
 */
export const ADMIN: FixtureAccount = {
  id: 'fixture-admin-1',
  email: 'admin@example.test',
  password: 'fixture-password-not-a-secret',
  roles: ['Admin'],
};

export const ACCOUNTS: readonly FixtureAccount[] = [READER, AUTHOR, TWO_FACTOR, ADMIN];
