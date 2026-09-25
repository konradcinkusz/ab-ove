import { cookies } from 'next/headers';

import { READER_ID_COOKIE } from '@/lib/reader-cookie';
import { ACCESS_TOKEN_COOKIE } from '@/lib/session-cookies';

import type { ReaderIdentity } from './content.ts';

/**
 * Who is asking, as `lib/server/content.ts` sends it to `AbOvo.Api` — read from this origin's
 * own two cookies: a signed-in reader's bearer, and an anonymous reader's opaque cursor cookie
 * (ADR-0061). Either may be absent; a reader with neither is at step 1 everywhere, which is
 * the API's answer to a caller it cannot place, not this function's.
 *
 * Its own module rather than a line in `content.ts`: that module is framework-free so the
 * unit tier can drive it with a fake `fetch`, and this one needs `next/headers`. The contents
 * page and the summary read it, through `program.ts` and for the summary's gated call (issue
 * #158); the frame page and the reveal action still read the same two cookies inline, as
 * they did before it existed.
 */
export async function readerIdentity(): Promise<ReaderIdentity> {
  const store = await cookies();
  return {
    bearer: store.get(ACCESS_TOKEN_COOKIE)?.value,
    readerId: store.get(READER_ID_COOKIE)?.value,
  };
}
