"use client";

import { useEffect } from "react";

/**
 * Take the page's ambient wash from the artwork on it.
 *
 * The three background gradients were fixed — cyan, violet, vermilion —
 * which gave every page the same weather regardless of what was printed on
 * it. A film page for In the Mood for Love and one for The Lighthouse are
 * two of the most differently-coloured objects in cinema and the light
 * behind them was identical.
 *
 * So this samples the image that is already on screen and hands its colour
 * to the CSS as `--shade`. Everything that reads that variable — the body
 * washes, `shaded`, `lifted` — picks it up at once, and pages with no
 * artwork keep the house colours through the fallback in each `var()`.
 *
 * Sampling is done in the browser, on a canvas, for two reasons. There is no
 * image pipeline here to precompute a palette at import time, and the images
 * are served from our own origin through Next's optimiser, so the canvas is
 * not tainted and `getImageData` is allowed. It costs one 24×24 draw.
 *
 * The average pixel of a film still is mud — every frame averages to brown —
 * so this weights by saturation and drops the near-black and near-white
 * pixels first. That is the difference between "the colour of this image"
 * and "the colour of every image".
 */

const SAMPLE = 24;

/** Ignore pixels this dark or this bright: they carry no usable hue. */
const MIN_LUMA = 0.06;
const MAX_LUMA = 0.96;

type Rgb = [number, number, number];

function toHsl([r, g, b]: Rgb) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: h * 360, s, l };
}

function dominant(image: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
    const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);

    // Weighted mean in hue space, so opposite hues cancel rather than
    // averaging into grey the way a straight RGB mean does.
    let x = 0;
    let y = 0;
    let sat = 0;
    let lum = 0;
    let weight = 0;

    for (let i = 0; i < data.length; i += 4) {
      const rgb: Rgb = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
      const { h, s, l } = toHsl(rgb);
      if (l < MIN_LUMA || l > MAX_LUMA) continue;

      // Saturation squared: one vivid coat matters more than a wall of beige.
      const w = s * s + 0.02;
      const radians = (h * Math.PI) / 180;
      x += Math.cos(radians) * w;
      y += Math.sin(radians) * w;
      sat += s * w;
      lum += l * w;
      weight += w;
    }

    if (weight === 0) return null;

    const hue = ((Math.atan2(y / weight, x / weight) * 180) / Math.PI + 360) % 360;
    // Floors, because the wash has to be visible on a near-black ground: a
    // desaturated sample would resolve to another grey and the whole point
    // of reading the artwork would be lost.
    const saturation = Math.min(0.9, Math.max(0.45, sat / weight * 1.6));
    const lightness = Math.min(0.68, Math.max(0.45, lum / weight * 1.5));

    return `hsl(${hue.toFixed(0)} ${(saturation * 100).toFixed(0)}% ${(lightness * 100).toFixed(0)}%)`;
  } catch {
    // A cross-origin image taints the canvas. Nothing to do but leave the
    // house colours in place.
    return null;
  }
}

export function ImageShade({
  selector,
  scope = "root",
}: {
  /** The image to read, as a CSS selector inside the scope. */
  selector: string;
  /**
   * Where the variable is set. "root" shades the whole page, which is right
   * when the image *is* the page (a film, an article); "self" shades only
   * the section the image belongs to.
   */
  scope?: "root" | "self";
}) {
  useEffect(() => {
    let cancelled = false;
    // What was last sampled. The observer below fires on every class change
    // in the page — a card hover, a menu opening — and a canvas read on each
    // of those would be a real cost for no new information.
    let last = "";

    const apply = () => {
      if (cancelled) return;

      const image = document.querySelector<HTMLImageElement>(selector);
      if (!image) return;

      const signature = image.currentSrc || image.src;
      if (signature && signature === last) return;
      last = signature;

      const target =
        scope === "root"
          ? document.documentElement
          : (image.closest("section") ?? document.documentElement);

      const paint = () => {
        const colour = dominant(image);
        if (colour && !cancelled) target.style.setProperty("--shade", colour);
        // A plate that had not loaded when it was activated gets its real
        // source here, so the guard above tracks what was actually read.
        last = image.currentSrc || image.src;
      };

      if (image.complete && image.naturalWidth > 0) paint();
      else image.addEventListener("load", paint, { once: true });
    };

    // The masthead crossfades between plates and film pages stream their
    // art in, so the sample is re-taken when the image is swapped rather
    // than once on mount.
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "class"],
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      if (scope === "root") {
        document.documentElement.style.removeProperty("--shade");
      }
    };
  }, [selector, scope]);

  return null;
}

/**
 * The same variable, set from a colour that is already known.
 *
 * Journal articles declare an `accent` in their frontmatter — a colour a
 * person chose for that piece — which is better than anything sampling could
 * infer, so those pages hand it over directly instead of reading pixels.
 */
export function Shade({ color }: { color: string }) {
  useEffect(() => {
    document.documentElement.style.setProperty("--shade", color);
    return () => {
      document.documentElement.style.removeProperty("--shade");
    };
  }, [color]);

  return null;
}
