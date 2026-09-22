/**
 * The reading screens' icons, drawn here as inline SVG — ADR-0063.
 *
 * FRONTEND-BFF.md §1: the browser talks to this origin and to nothing else, so there is no
 * icon font, no sprite on a CDN and no icon package among the dependencies (the app's budget
 * is published and deliberately tiny — `web/app/package.json`). Each of these is a few path
 * commands on a 20-unit grid, stroked in `currentColor` so it takes the colour of the button
 * it sits in, in either theme.
 *
 * Every one is `aria-hidden` and none is ever a control's only label: the button beside it
 * says the word, which is the whole of what the owner asked for.
 */

interface IconProps {
  readonly className?: string;
}

function Svg({ className, children }: IconProps & { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.75}
      viewBox="0 0 20 20"
    >
      {children}
    </svg>
  );
}

export function ArrowLeft({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <path d="M16 10H4M9 5l-5 5 5 5" />
    </Svg>
  );
}

export function ArrowRight({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <path d="M4 10h12M11 5l5 5-5 5" />
    </Svg>
  );
}

export function ChevronDown({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <path d="M5.5 8 10 12.5 14.5 8" />
    </Svg>
  );
}

export function ChevronUp({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <path d="M5.5 12 10 7.5l4.5 4.5" />
    </Svg>
  );
}

/** The contents page — frame 1's way back, where there is no previous frame. */
export function List({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <path d="M8 5.5h8M8 10h8M8 14.5h8M4 5.5h.01M4 10h.01M4 14.5h.01" />
    </Svg>
  );
}

/** `Work it out` — the pad that does arithmetic. */
export function Calculator({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <rect height="15" rx="2" width="12" x="4" y="2.5" />
      <path d="M7 6.5h6M7.5 10.5h.01M10 10.5h.01M12.5 10.5h.01M7.5 13.5h.01M10 13.5h.01M12.5 13.5h.01" />
    </Svg>
  );
}

/** `Draw it` — the sketch pane. */
export function Pencil({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <path d="M13.5 3.5l3 3L7 16H4v-3z" />
      <path d="M11.5 5.5l3 3" />
    </Svg>
  );
}

/** `Reading settings` — the theme and the key map. */
export function Sliders({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <path d="M3.5 6h7M15.5 6h1M3.5 14h1.5M9 14h7.5" />
      <circle cx="13" cy="6" r="2" />
      <circle cx="7" cy="14" r="2" />
    </Svg>
  );
}

/** A section the gate would refuse — said beside the words, never instead of them. */
export function Lock({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <rect height="8" rx="1.5" width="10" x="5" y="9" />
      <path d="M7.5 9V6.5a2.5 2.5 0 0 1 5 0V9" />
    </Svg>
  );
}

export function Close({ className }: IconProps): React.JSX.Element {
  return (
    <Svg className={className}>
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </Svg>
  );
}
