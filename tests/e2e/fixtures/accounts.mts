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

export const ACCOUNTS: readonly FixtureAccount[] = [READER, AUTHOR];
