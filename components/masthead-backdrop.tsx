"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * A slow crossfade of key art behind the masthead.
 *
 * The masthead's own text and buttons render in normal flow on top of this —
 * it is `absolute`, not a background-image on the section, so if the images
 * fail to load the masthead is exactly the plain dark band it was before. A
 * heavy scrim sits between the art and the text for the same reason a film
 * poster puts its title on the darkest part of the frame: legibility first,
 * art second.
 *
 * The crossfade duration lives in CSS (`.masthead-plate`), not here, so the
 * app's one global `prefers-reduced-motion` rule is what disarms it — the
 * same rule that already zeroes every other transition on the site. The only
 * thing this component gates in JS is the interval that changes `active`:
 * under reduced motion it never fires, so the first plate stays up and the
 * transition it would have used never has a reason to run.
 */

const HOLD_MS = 6500;

export function MastheadBackdrop({
  images,
}: {
  images: { src: string; alt: string }[];
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(
      () => setActive((i) => (i + 1) % images.length),
      HOLD_MS,
    );
    return () => window.clearInterval(timer);
  }, [images.length]);

  if (images.length === 0) return null;

  return (
    <div className="masthead-backdrop" aria-hidden="true">
      {images.map((image, i) => (
        <Image
          key={image.src}
          src={image.src}
          alt=""
          fill
          sizes="100vw"
          priority={i === 0}
          className={`masthead-plate${i === active ? " is-active" : ""}`}
        />
      ))}
      <div className="masthead-scrim" />
    </div>
  );
}
