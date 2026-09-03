/**
 * The wrapper that makes a navigation feel like one.
 *
 * A template, not a layout, and that difference is the entire mechanism:
 * Next remounts a template on every navigation while a layout persists, so
 * the animation below re-runs on each route change without a single line of
 * JavaScript watching the pathname.
 *
 * The header and footer live in the layout on purpose — they stay put while
 * the page under them changes, which is what tells the reader they are still
 * in the same place. Animating the whole window instead would read as a
 * reload.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
