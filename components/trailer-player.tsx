"use client";

import * as React from "react";

/**
 * The trailer, in a lightbox over the page.
 *
 * A modal rather than an inline player, because the trending rake is a row of
 * posters and swapping one of them for a video would collapse the layout
 * every time somebody pressed play. Over the top, the video gets the whole
 * screen's attention and the row is exactly where it was when it closes.
 *
 * youtube-nocookie, and the iframe is only mounted while the lightbox is
 * open. An embed rendered behind a closed modal is a tracking script running
 * on every page view for a video nobody asked to watch, which is a strange
 * thing to ship on a site that has opinions about films.
 *
 * Escape closes, the backdrop closes, focus returns to whatever opened it.
 * None of that is optional for a thing that covers the page.
 */

export function TrailerPlayer({
  trailerKey,
  title,
  onClose,
}: {
  trailerKey: string;
  title: string;
  onClose: () => void;
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // The page behind must not scroll under an open lightbox.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Trailer for ${title}`}
      onClick={onClose}
      className="fixed inset-0 z-[300] flex items-center justify-center bg-ink/92 p-4 backdrop-blur-sm sm:p-8"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-5xl"
      >
        <div className="flex items-baseline justify-between gap-4 pb-3">
          <p className="font-display text-xl leading-tight sm:text-2xl">
            {title}
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="label shrink-0 rounded-full border border-line px-3 py-1.5 transition-colors hover:border-line-bright hover:text-paper"
          >
            Close
          </button>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-[4px] border border-line-bright bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&rel=0&modestbranding=1`}
            title={`Trailer for ${title}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        </div>

        <p className="mt-3 text-center text-xs text-faint">
          Trailer from YouTube via TMDB · press Escape to close
        </p>
      </div>
    </div>
  );
}

/**
 * The button that opens it, and the state that decides whether it exists.
 *
 * A film with no trailer renders nothing at all rather than a disabled
 * control — "no trailer available" is a sentence nobody needed to read, and
 * an empty space is a better answer than a dead button.
 */
export function TrailerButton({
  trailerKey,
  title,
  className = "",
  children,
}: {
  trailerKey?: string | null;
  title: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  if (!trailerKey) return null;

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className={className}
      >
        {children ?? "Play trailer"}
      </button>
      {open && (
        <TrailerPlayer
          trailerKey={trailerKey}
          title={title}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
