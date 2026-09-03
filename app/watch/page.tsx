import type { Metadata } from "next";
import { WatchSession } from "@/components/watch-session";
import { Container, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { previewDeck } from "@/lib/rec/deck";
import { chipsFor, intentFromAnswers } from "@/lib/rec/intent";

export const metadata: Metadata = {
  title: "What to watch",
  description:
    "Say what kind of evening it is — in chips or in your own words — and xine deals films one at a time until one of them is the one.",
};

/**
 * The page for nine o'clock on a Tuesday.
 *
 * Everything else on this site is for readers who arrived with a question: a
 * film they mean to look up, a list they want to argue with. This is for the
 * other state, which is more common and much worse served — an hour and a
 * half free and no idea, in front of a catalogue that answers every question
 * with sixty posters.
 *
 * The whole page is one client component over a server-held session, which is
 * unusual here and deliberate: every press has to re-rank rather than
 * re-render, and a route that rebuilt itself on each verdict would take the
 * card out from under the hand that just answered it.
 *
 * Nothing is dealt on the server for the first paint. A session is created by
 * an action, because only an action may set the cookie that addresses one,
 * and a page that pretended otherwise would deal a deck to a session it could
 * not then write to.
 */
export default async function WatchPage() {
  const user = await getCurrentUser();

  // Ranked on the server for the first paint, from an intent nobody has
  // narrowed yet: it is the catalogue at its widest, ordered by what this
  // reader has liked before.
  const intent = intentFromAnswers({});
  const preview = await previewDeck(intent, user?.id ?? null);

  const initial = {
    sessionId: "",
    cards: preview.cards.map((card) => ({
      id: card.id,
      slug: card.slug,
      title: card.title,
      year: card.year,
      director: card.director,
      runtime: card.runtime,
      country: card.country,
      synopsis: card.synopsis,
      posterUrl: card.posterUrl,
      why: card.why,
    })),
    chips: chipsFor(intent),
    confidence: preview.confidence,
    pool: preview.pool,
    verdicts: 0,
    askReason: false,
    finalists: null,
  };

  return (
    <>
      <PageHeader
        label="What to watch"
        title="Say what kind of evening it is."
        lede="Chips if you know roughly what you want, your own words if it is more specific than that. Then one film at a time — keep it, wave it off, or say never — and the next card is ranked from what you just said."
      />

      <Container className="py-14">
        <WatchSession initial={initial} initialAnswers={{}} signedIn={!!user} />
      </Container>
    </>
  );
}
