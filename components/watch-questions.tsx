"use client";

import { QUESTIONS } from "@/lib/watch-shape";

/**
 * The chips.
 *
 * Every answer is optional, and leaving one out is not the same as answering
 * "anything" — it simply does not narrow. Moods combine, because "dark and
 * beautiful" is a real request and forcing a choice between them would be the
 * interface arguing with the evening.
 *
 * State lives with the page rather than the URL now. It has to: the deck is
 * ranked from a server-side session that also holds a typed sentence and a
 * running drift, and a URL that carried only half of that would be a link
 * promising an evening it cannot reproduce.
 */

export type Answers = {
  mood?: string[];
  party?: string;
  length?: string;
  era?: string;
  place?: string;
  /** Direct positions from the fine-tune sliders. */
  fine?: Record<string, number>;
  /** How they want it to end, read as a mood. */
  ending?: string;
};

export function WatchQuestions({
  answers,
  onChange,
  disabled = false,
}: {
  answers: Answers;
  onChange: (next: Answers) => void;
  disabled?: boolean;
}) {
  function toggle(key: keyof Answers, value: string, multiple?: boolean) {
    if (multiple) {
      const current = (answers.mood ?? []) as string[];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      onChange({ ...answers, mood: next.length > 0 ? next : undefined });
      return;
    }

    // Pressing the answer that is already on takes it back.
    const current = answers[key];
    onChange({ ...answers, [key]: current === value ? undefined : value });
  }

  return (
    <div className="space-y-8">
      {QUESTIONS.map((question) => (
        <fieldset key={question.key} disabled={disabled}>
          <legend className="label">{question.prompt}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {question.options.map((option) => {
              const on = question.multiple
                ? (answers.mood ?? []).includes(option.value)
                : answers[question.key] === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(question.key, option.value, question.multiple)}
                  className={`rounded-full border px-4 py-2 text-left transition-colors disabled:opacity-50 ${
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
