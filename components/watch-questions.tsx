"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { QUESTIONS } from "@/lib/watch-shape";

/**
 * Four questions, none of them required.
 *
 * The answers live in the URL rather than in state, which is doing three
 * jobs at once: the deck below is a server component and reads them without
 * a round trip, the back button walks the reader's own narrowing, and an
 * evening someone liked the shape of is a link they can send to somebody.
 *
 * Pressing a chip that is already on turns it off. There is no Clear button
 * for a single answer and no submit for the set — every press re-draws the
 * deck, because the whole promise is that narrowing is instant and costless.
 */

export function WatchQuestions({
  answers,
}: {
  answers: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function choose(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);

    const query = next.toString();
    // No scroll, or every press throws the reader back to the top of a page
    // whose interesting half is below them.
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-8">
      {QUESTIONS.map((question) => (
        <fieldset key={question.key}>
          <legend className="label">{question.prompt}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {question.options.map((option) => {
              const on = answers[question.key] === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(question.key, option.value)}
                  className={`rounded-full border px-4 py-2 text-left transition-colors ${
                    on
                      ? "border-gold bg-gold/10 text-gold"
                      : "border-line text-muted hover:border-line-bright hover:text-paper"
                  }`}
                >
                  <span className="block text-sm leading-none">{option.label}</span>
                  {option.note && (
                    <span className="mt-1 block font-sans text-[0.625rem] tracking-[0.1em] text-faint uppercase">
                      {option.note}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
