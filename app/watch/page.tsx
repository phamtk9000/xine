import type { Metadata } from "next";
import { WatchQuestions } from "@/components/watch-questions";
import { WatchDeck } from "@/components/watch-deck";
import { Container, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { QUESTIONS, watchDeck, type Answers } from "@/lib/watch";

export const metadata: Metadata = {
  title: "What to watch",
  description:
    "Four questions about the evening you want, then one film at a time until something sticks.",
};

/**
 * The page for nine o'clock on a Tuesday.
 *
 * Everything else on this site is for readers who arrived with a question —
 * a film they mean to look up, a list they want to argue with. This is for
 * the other state, which is more common and much worse served: an hour and a
 * half free and no idea, in front of a catalogue that answers every question
 * with sixty posters.
 *
 * So: four questions in the language people use about an evening rather than
 * about cinema, and then a deck. One card, one decision, next card. Nothing
 * is compared with anything, because comparison is the thing that keeps
 * people scrolling past the film they would have enjoyed.
 *
 * The answers narrow the pool and are then forgotten. What is kept is what
 * the reader said about the films themselves, which is the same table the
 * For You page reads — an evening spent here makes that page better even if
 * it ends with nothing watched.
 */
export default async function WatchPage({
  searchParams,
}: PageProps<"/watch">) {
  const params = await searchParams;
  const user = await getCurrentUser();

  const answers: Answers = {};
  for (const question of QUESTIONS) {
    const value = params[question.key];
    const picked = typeof value === "string" ? value : undefined;
    // Only values the question actually offers, so a hand-typed URL cannot
    // produce a filter nobody designed.
    if (picked && question.options.some((option) => option.value === picked)) {
      answers[question.key] = picked;
    }
  }

  const answered = Object.values(answers).filter(Boolean).length;
  const { cards, pool } = await watchDeck(answers, { userId: user?.id });

  return (
    <>
      <PageHeader
        label="What to watch"
        title="Answer four questions. Then one film at a time."
        lede="Nothing here is a filter and nothing is a ranking. Say roughly what kind of evening it is, and the deck deals films one by one — keep the ones you want, wave off the rest, and both answers teach the page that suggests films to you."
        action={
          <p className="readout shrink-0 text-xs text-faint">
            {pool.toLocaleString()} films match
            {answered > 0 ? ` · ${answered} of 4 answered` : ""}
          </p>
        }
      />

      <Container className="py-14">
        <div className="grid gap-14 lg:grid-cols-[22rem_1fr] lg:gap-20">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <WatchQuestions answers={answers} />

            <p className="mt-10 border-t border-line pt-5 text-xs leading-relaxed text-faint">
              Every answer is optional, and leaving one out is not the same as
              answering “anything” — it simply does not narrow. Change one and
              the deck is re-dealt.
            </p>
          </div>

          <div>
            {cards.length > 0 ? (
              <WatchDeck cards={cards} signedIn={!!user} />
            ) : (
              <div className="rounded-[4px] border border-line bg-ink-raised px-6 py-16 text-center">
                <p className="label">Nothing left</p>
                <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">
                  {pool === 0
                    ? "No film in the catalogue fits all four answers. Take one away and it will."
                    : "You have already judged everything that fits. Change an answer for a different deck."}
                </p>
              </div>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
