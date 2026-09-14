import type { Metadata } from 'next';
import Link from 'next/link';

import styles from '@/components/lab/lab-pane.module.css';
import { LABS } from '@/lib/lab/protocol';

/**
 * The lab index.
 *
 * It lists the labs that EXIST, from the one manifest both this page and the worker read,
 * rather than the labs the book has. The book has forty-seven programs and a handful of
 * them have computer exercises; content arrives here by moving the pin in
 * content/book.lock.json, so a page that listed the book's ambitions would be a page that
 * offers a reader links to nothing. When Lab P2 is fetched, it appears here because it is
 * in `LABS`, not because somebody remembered this file.
 */
export const metadata: Metadata = {
  title: 'Lab — ab-ovo',
  description:
    "The computer exercises from 'Mathematics from Zero for the AI Engineer', worked in the " +
    'browser. Python runs on your own machine under WebAssembly; your code is never sent ' +
    'anywhere, and the lab needs no account.',
};

export default function LabIndexPage(): React.JSX.Element {
  return (
    <main className={styles.page}>
      <p className={styles.crumb}>
        <Link href="/">ab-ovo</Link> / lab
      </p>
      <h1 className={styles.title}>The lab</h1>
      <p className={styles.subtitle}>
        The book&rsquo;s computer exercises, worked in the browser. Every expected value a
        check compares against is one the book prints, read out of the same file the
        program&rsquo;s own pages are set from — so a check cannot drift from the book, and
        the book cannot move without the lab noticing.
      </p>

      <div className={styles.privacy}>
        <p>
          <strong>Your code runs in your browser and is never sent anywhere.</strong> Python
          is compiled to WebAssembly and served from this site along with everything else
          here. There is no account, because there is nothing to sign in to.
        </p>
      </div>

      <ol className={styles.labList}>
        {LABS.map((lab) => (
          <li key={lab.id} className={styles.labCard}>
            <Link href={`/lab/${lab.id}`}>
              {lab.program} — {lab.title}
            </Link>
            <p>
              One file, <code>{lab.stem}.py</code>, and a check for each thing it asks you
              to work out. The pane counts them from the book&rsquo;s own test file when it
              opens; no number is written down here.
            </p>
          </li>
        ))}
      </ol>
    </main>
  );
}
