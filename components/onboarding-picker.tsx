"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { searchCatalogue, type FilmPick } from "@/app/actions/lists";
import { submitOnboarding } from "@/app/actions/onboard";

const LOVE_TARGET = 5;
const SKIP_TARGET = 3;

type Step = "love" | "skip";

/**
 * Two taps' worth of taste, in place of a blank recommender.
 *
 * A new account has no ratings, so every surface that reads taste — the
 * deck's session score, For You, the taste inspector — starts from nothing
 * and falls back to editorial quality alone. That fallback is honest and it
 * is also generic: the first thing everybody sees is the same thing. Five
 * films picked here, three ruled out, and the recommender has something to
 * read outward from on the very first visit.
 *
 * Search is available but not required — the opening shelf from
 * searchCatalogue("") is recognisable titles by vote count, which is enough
 * for most people to find five things they have an opinion about without
 * typing anything.
 */
export function OnboardingPicker() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("love");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FilmPick[]>([]);
  const [loved, setLoved] = useState<FilmPick[]>([]);
  const [disliked, setDisliked] = useState<FilmPick[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const ticket = useRef(0);

  useEffect(() => {
    const mine = ++ticket.current;
    searchCatalogue(query).then((rows) => {
      if (mine === ticket.current) setResults(rows);
    });
  }, [query]);

  const pickedIds = new Set([...loved, ...disliked].map((f) => f.id));
  const target = step === "love" ? LOVE_TARGET : SKIP_TARGET;
  const chosen = step === "love" ? loved : disliked;
  const done = chosen.length >= target;

  function toggle(film: FilmPick) {
    const setter = step === "love" ? setLoved : setDisliked;
    setter((prev) =>
      prev.some((f) => f.id === film.id)
        ? prev.filter((f) => f.id !== film.id)
        : prev.length < target
          ? [...prev, film]
          : prev,
    );
  }

  async function finish(skip = false) {
    setSubmitting(true);
    await submitOnboarding(
      loved.map((f) => f.id),
      skip ? [] : disliked.map((f) => f.id),
    );
    router.push("/watch");
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="label !text-gold">
          {step === "love" ? "Step 1 of 2" : "Step 2 of 2"}
        </p>
        <p className="text-sm text-muted">
          {step === "love"
            ? `Pick ${LOVE_TARGET} films you love (${loved.length}/${LOVE_TARGET})`
            : `Pick up to ${SKIP_TARGET} you didn't connect with (${disliked.length}/${SKIP_TARGET}) — or skip this step`}
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a title…"
        className="mt-4 w-full rounded-[3px] border border-line bg-ink-raised px-4 py-2.5 text-sm placeholder:text-faint focus:border-line-bright focus:outline-none"
      />

      <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">
        {results.map((film) => {
          const picked = chosen.some((f) => f.id === film.id);
          const disabledOther = pickedIds.has(film.id) && !picked;
          return (
            <li key={film.id}>
              <button
                type="button"
                onClick={() => toggle(film)}
                disabled={disabledOther}
                aria-pressed={picked}
                className={`group relative block w-full overflow-hidden rounded-[3px] border-2 transition-colors disabled:opacity-30 ${
                  picked
                    ? step === "love"
                      ? "border-gold"
                      : "border-accent"
                    : "border-transparent"
                }`}
              >
                <div className="relative aspect-2/3 bg-ink-raised">
                  {film.posterUrl && (
                    <Image
                      src={film.posterUrl}
                      alt=""
                      fill
                      sizes="140px"
                      className="object-cover"
                    />
                  )}
                </div>
                {picked && (
                  <span
                    className={`absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[0.6875rem] font-bold text-ink ${
                      step === "love" ? "bg-gold" : "bg-accent"
                    }`}
                  >
                    {step === "love" ? "♥" : "✕"}
                  </span>
                )}
                <p className="mt-1 truncate text-left text-[0.6875rem] text-faint">
                  {film.title}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex items-center gap-3">
        {step === "love" ? (
          <button
            type="button"
            disabled={!done}
            onClick={() => setStep("skip")}
            className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={submitting}
              onClick={() => finish(false)}
              className="label rounded-full border border-gold bg-gold/10 px-5 py-2.5 !text-gold transition-colors hover:bg-gold/20 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Finish"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => finish(true)}
              className="label px-2 py-2.5 text-faint underline underline-offset-2 hover:text-paper"
            >
              Skip this step
            </button>
          </>
        )}
      </div>
    </div>
  );
}
