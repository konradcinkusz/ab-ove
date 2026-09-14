'use client';

import { Fragment } from 'react';

import styles from './lab-pane.module.css';

/**
 * The runner's stdout, line for line, unaltered.
 *
 * `check.py` prints five forms and aligns them itself — two spaces before `todo` and
 * `FAIL`, two before `ok` and four after it, so the names line up:
 *
 *     "  todo  {name}: not implemented yet ({exc})"
 *     "  FAIL  {name}: {exc or 'assertion failed'}"
 *     "  FAIL  {name}: {type(exc).__name__}: {exc}"
 *     "  ok    {name}"
 *     "SUMMARY ok={ok} fail={fail} todo={todo}"
 *
 * This component colours a line by looking at its prefix and CHANGES NO CHARACTER OF IT.
 * The temptation is to parse each line into a name and a message and lay them out in a
 * grid, and the cost of doing that is a second rendering of the runner's output which is
 * free to disagree with the first — including, silently, when the book changes a message.
 * The reader must be able to compare what this pane shows with what `python3 lab/check.py
 * p01` shows on their own machine and find them identical.
 *
 * Reconstructing the text exactly is the point of the Fragment and the explicit newline:
 * the <pre>'s textContent is `output`, character for character.
 */
function classOf(line: string): string | undefined {
  if (line.startsWith('  ok')) return styles.ok;
  if (line.startsWith('  FAIL')) return styles.fail;
  if (line.startsWith('  todo')) return styles.todo;
  if (line.startsWith('SUMMARY ')) return styles.summaryLine;
  return undefined;
}

export function Transcript({ output }: { readonly output: string }): React.JSX.Element {
  const lines = output.split('\n');
  return (
    <pre className={styles.transcript} data-testid="lab-output" tabIndex={0}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? '\n' : null}
          <span className={classOf(line)}>{line}</span>
        </Fragment>
      ))}
    </pre>
  );
}
