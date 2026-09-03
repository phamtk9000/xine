import "dotenv/config";
import { db } from "../lib/db";

/**
 * Turn the event log into rows a model could learn from.
 *
 *   npm run rec:training
 *   npm run rec:training -- --rebuild
 *
 * A training set is a view of history, so this is a derivation rather than a
 * side effect: every row is rebuildable from the events, and rebuilding is
 * the normal way to run it after the labelling rules change.
 *
 * The labels are not symmetric, because the events are not. Being chosen at
 * the end of an evening is much stronger evidence than being kept mid-deck,
 * and being ignored is not evidence against anything — a film shown once and
 * never judged usually means the reader answered a different card and moved
 * on. Treating exposure as preference is the single most common way a
 * recommender teaches itself nonsense.
 *
 * Nothing reads this table yet. It exists so that when there is enough data
 * to justify a learned ranker, the data is already there and already clean —
 * rather than being reconstructed afterwards from whatever the log happened
 * to contain.
 */

const LABELS: Record<string, number> = {
  pick_for_me: 2,
  finalist_selected: 2,
  save: 1.4,
  interested: 1,
  open: 0.6,
  not_tonight: -1,
  never: -2,
  // Seen it is not a judgement of the suggestion at all, and is skipped.
};

async function main() {
  const rebuild = process.argv.includes("--rebuild");
  if (rebuild) await db.recTrainingExample.deleteMany({});

  const events = await db.recEvent.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      sessionId: true,
      filmId: true,
      type: true,
      rank: true,
      score: true,
      payload: true,
      modelVersion: true,
      createdAt: true,
    },
  });

  // What was shown, with the features it was shown under.
  type Shown = { rank: number; score: number; features: string; modelVersion: string };
  const shown = new Map<string, Shown>();
  const outcomes = new Map<string, { label: number; outcome: string }>();

  for (const event of events) {
    if (!event.filmId) continue;
    const key = `${event.sessionId}:${event.filmId}`;

    if (event.type === "impression") {
      if (!shown.has(key)) {
        shown.set(key, {
          rank: event.rank ?? 0,
          score: event.score ?? 0,
          features: event.payload ?? "{}",
          modelVersion: event.modelVersion ?? "unknown",
        });
      }
      continue;
    }

    const label = LABELS[event.type];
    if (label === undefined) continue;

    // The strongest thing said about a film wins: a reader who keeps a film
    // and later picks it has said one thing twice, not two things.
    const existing = outcomes.get(key);
    if (!existing || Math.abs(label) > Math.abs(existing.label)) {
      outcomes.set(key, { label, outcome: event.type });
    }
  }

  const rows: {
    sessionId: string;
    filmId: string;
    features: string;
    rank: number;
    score: number;
    label: number;
    outcome: string;
    modelVersion: string;
  }[] = [];

  for (const [key, impression] of shown) {
    const [sessionId, filmId] = key.split(":");
    const outcome = outcomes.get(key);
    rows.push({
      sessionId,
      filmId,
      features: impression.features,
      rank: impression.rank,
      score: impression.score,
      label: outcome?.label ?? 0,
      outcome: outcome?.outcome ?? "ignored",
      modelVersion: impression.modelVersion,
    });
  }

  if (rows.length === 0) {
    console.log("No impressions to label yet.");
    return;
  }

  let written = 0;
  for (let start = 0; start < rows.length; start += 200) {
    const slice = rows.slice(start, start + 200);
    await db.$transaction(
      slice.map((row) =>
        db.recTrainingExample.upsert({
          where: { sessionId_filmId: { sessionId: row.sessionId, filmId: row.filmId } },
          create: row,
          update: row,
        }),
      ),
    );
    written += slice.length;
  }

  const tally = await db.recTrainingExample.groupBy({
    by: ["outcome"],
    _count: { _all: true },
  });

  console.log(`${written} examples.\n`);
  for (const row of tally.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${String(row._count._all).padStart(6)}  ${row.outcome}`);
  }

  const judged = rows.filter((row) => row.label !== 0).length;
  console.log(
    `\n  ${judged} of ${rows.length} carry a verdict. A learned ranker wants\n` +
      "  thousands; below that the deterministic weights are the better bet,\n" +
      "  and this table is a record rather than a resource.",
  );
}

main();
