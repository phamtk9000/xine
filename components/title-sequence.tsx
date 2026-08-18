"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * The title sequence: a run of posters cut fast, then the wordmark.
 *
 * A splash screen that plays on every navigation is an obstacle, so this runs
 * once per session and is skippable with a click or any key. It is also
 * skipped outright under `prefers-reduced-motion` — a hard cut every 90ms is
 * exactly what that setting exists to prevent.
 *
 * The page underneath is already rendered the whole time. If the script never
 * runs, or the images never load, nothing appears and nothing is blocked.
 */

type Phase = "idle" | "cuts" | "mark" | "out" | "done";

const KEY = "xine:title-sequence";

/** Frames per second of the poster run, and how long the wordmark holds. */
const CUT_MS = 95;
const WORDMARK_MS = 900;
const FADE_MS = 320;

export function TitleSequence({ posters }: { posters: string[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (posters.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (sessionStorage.getItem(KEY)) return;
    // A background tab throttles timers to one tick a second, which would
    // turn a 1.1s run of cuts into a twelve-second title card sitting there
    // when the reader finally switches over. Leave it unplayed instead; it
    // gets its chance the next time they arrive at the home page in view.
    if (document.hidden) return;

    // A tick later, so the page behind has painted before it is covered.
    // Deliberately a timer rather than a frame: a tab loaded in the
    // background never gets a frame, so a rAF here would hold the sequence
    // and spring it on the reader when they finally switch to the tab.
    //
    // The session flag is written when the sequence actually starts, not
    // when the effect decides to start it. An effect that runs twice — which
    // is exactly what StrictMode does — would otherwise mark the sequence
    // seen on the first pass, cancel its own timer on cleanup, and bail on
    // the second pass, so it would never play at all.
    const id = window.setTimeout(() => {
      sessionStorage.setItem(KEY, "1");
      setPhase("cuts");
    }, 0);
    return () => window.clearTimeout(id);
  }, [posters.length]);

  useEffect(() => {
    if (phase !== "cuts") return;

    const timer = window.setInterval(() => {
      setFrame((i) => {
        if (i + 1 >= posters.length) {
          window.clearInterval(timer);
          setPhase("mark");
          return i;
        }
        return i + 1;
      });
    }, CUT_MS);

    return () => window.clearInterval(timer);
  }, [phase, posters.length]);

  useEffect(() => {
    if (phase !== "mark") return;
    const timer = window.setTimeout(() => setPhase("out"), WORDMARK_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "out") return;
    const timer = window.setTimeout(() => setPhase("done"), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Any key or click cuts straight to the page — and so does switching away,
  // for the same throttling reason as above.
  useEffect(() => {
    if (phase === "idle" || phase === "done") return;
    const skip = () => setPhase("out");
    const onHide = () => {
      if (document.hidden) setPhase("done");
    };
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [phase]);

  if (phase === "idle" || phase === "done") return null;

  return (
    <div
      className={`title-sequence${phase === "out" ? " is-out" : ""}`}
      role="presentation"
    >
      {phase === "cuts" && (
        <div className="title-cuts">
          {posters.map((src, i) => (
            <Image
              key={src}
              src={src}
              alt=""
              fill
              sizes="(max-width: 640px) 70vw, 30rem"
              priority={i < 4}
              className={i === frame ? "title-cut is-on" : "title-cut"}
            />
          ))}
        </div>
      )}

      {(phase === "mark" || phase === "out") && (
        <p className="title-wordmark">xine</p>
      )}
    </div>
  );
}
