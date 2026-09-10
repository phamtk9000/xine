"use client";

import { useEffect, type RefObject } from "react";

/**
 * Escape closes it, and so does a press anywhere outside it.
 *
 * One hook rather than the same twenty lines in every component, because the
 * failure mode here is not that a panel is hard to close — it is that *some*
 * panels are. A reader who learns that Escape shuts the search dropdown and
 * then finds it does nothing to the navigation sheet has not learned a
 * shortcut; they have learned that this site's panels are unpredictable, and
 * they go back to hunting for the close button every time.
 *
 * `pointerdown` rather than `click`, so the panel is gone by the time the
 * press lands. A `click` listener fires after the target has already been
 * activated, which means dismissing one panel by pressing a button behind it
 * both closes the panel and presses the button — the second of which nobody
 * intended.
 *
 * Capture phase on the key listener so it still works when focus is inside
 * an input that stops propagation on its own keydowns.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };

    const onDown = (event: PointerEvent) => {
      const node = ref.current;
      if (!node) return;
      const target = event.target;
      if (target instanceof Node && node.contains(target)) return;
      onDismiss();
    };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [ref, active, onDismiss]);
}
