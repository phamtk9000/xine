import Link from "next/link";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { currentSession } from "@/lib/rec/session";
import { dealDeck } from "@/lib/rec/deck";
import { clustersFor } from "@/lib/rec/clusters";
import { WEIGHTS } from "@/lib/rec/weights";
import { DIMENSIONS } from "@/lib/rec/dimensions";

export const metadata: Metadata = { title: "Why these", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The recommender, with its working shown.
 *
 * Every ranking system eventually produces a result somebody wants to argue
 * with, and the argument is unwinnable without this page: which factors
 * contributed, how much, and what the film was understood to be. It reads the
 * reader's own session and nobody else's, so it needs no permissions — and it
 * is the same numbers the ranker used, not a reconstruction, because a
 * debugger that recomputes is a debugger that can disagree with production.
 */
export default async function WhyPage() {
  const session = await currentSession();

  if (!session) {
    return (
      <Container className="py-20">
        <p className="label">Nothing to explain yet</p>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted">
          Answer something on{" "}
          <Link href="/watch" className="text-gold underline underline-offset-4">
            what to watch
          </Link>{" "}
          and this page will show how the deck was ranked.
        </p>
      </Container>
    );
  }

  const deck = await dealDeck(session, { take: 10 });

  const asked = Object.entries(session.intent.soft)
    .map(([key, value]) => {
      const dimension = DIMENSIONS.find((d) => d.key === key);
      if (!dimension || value === undefined) return null;
      return `${dimension.low} ⟶ ${dimension.high}: ${value.toFixed(2)}`;
    })
    .filter(Boolean);

  return (
    <>
      <PageHeader
        label="Debug"
        title="Why these films."
        lede="Your current session, the intent it was read as, and what every factor contributed to the ranking. This page is yours alone — it reads the session cookie in your browser and nothing else."
      />

      <Container className="py-14">
        <div className="grid gap-10 lg:grid-cols-[20rem_1fr]">
          <div className="space-y-8 text-sm">
            <div>
              <p className="label">Session</p>
              <dl className="mt-3 space-y-1.5 text-xs text-muted">
                <Row k="Confidence" v={deck.confidence.toFixed(2)} />
                <Row k="Pool" v={deck.pool.toLocaleString()} />
                <Row k="Weights" v={WEIGHTS.version} />
                <Row k="Query" v={session.query ?? "—"} />
              </dl>
            </div>

            <div>
              <p className="label">Asked for</p>
              <ul className="mt-3 space-y-1 text-xs text-muted">
                {asked.length === 0 && <li>Nothing narrowed yet.</li>}
                {asked.map((line) => (
                  <li key={line as string}>{line}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="label">Hard constraints</p>
              <pre className="mt-3 overflow-x-auto rounded-[3px] border border-line bg-ink-raised p-3 font-mono text-[0.6875rem] text-muted">
                {JSON.stringify(session.intent.hard, null, 2)}
              </pre>
            </div>

            <div>
              <p className="label">Drift since the start</p>
              <pre className="mt-3 overflow-x-auto rounded-[3px] border border-line bg-ink-raised p-3 font-mono text-[0.6875rem] text-muted">
                {JSON.stringify(session.drift, null, 2)}
              </pre>
            </div>
          </div>

          <div className="min-w-0">
            <ol className="space-y-5">
              {deck.cards.map((card, index) => {
                const clusters = clustersFor(card.profile).slice(0, 3);
                const parts = Object.entries(card.contributions).sort(
                  (a, b) => Math.abs(b[1]) - Math.abs(a[1]),
                );

                return (
                  <li
                    key={card.id}
                    className="rounded-[4px] border border-line bg-ink-raised p-5"
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="font-display text-xl">
                        <span className="readout mr-3 text-xs text-faint">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <Link
                          href={`/films/${card.slug}`}
                          className="transition-colors hover:text-gold"
                        >
                          {card.title}
                        </Link>
                      </p>
                      <p className="readout shrink-0 text-sm text-gold">
                        {card.score.toFixed(3)}
                      </p>
                    </div>

                    <p className="mt-1 text-xs text-faint">
                      {card.director} · {card.year} · {card.why}
                    </p>

                    {/* Contributions as bars, because the shape of a ranking
                        is easier to read than eight decimals. */}
                    <ul className="mt-4 space-y-1">
                      {parts.map(([key, value]) => (
                        <li key={key} className="flex items-center gap-3">
                          <span className="w-24 shrink-0 font-sans text-[0.625rem] tracking-[0.12em] text-faint uppercase">
                            {key}
                          </span>
                          <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                            <span
                              className={`block h-full ${value < 0 ? "bg-accent" : "bg-gold"}`}
                              style={{
                                width: `${Math.min(100, Math.abs(value) * 320)}%`,
                              }}
                            />
                          </span>
                          <span className="readout w-14 shrink-0 text-right text-[0.6875rem] text-muted">
                            {value.toFixed(3)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {clusters.length > 0 && (
                      <p className="mt-4 flex flex-wrap gap-2">
                        {clusters.map((cluster) => (
                          <span
                            key={cluster.cluster}
                            className="label rounded-full border border-line px-2.5 py-1 !text-[0.5rem]"
                          >
                            {cluster.label} {Math.round(cluster.weight * 100)}%
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </Container>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{k}</dt>
      <dd className="truncate text-paper">{v}</dd>
    </div>
  );
}
