import "dotenv/config";
import { db } from "../lib/db";
import { fromCsv } from "../lib/serialize";
import { enough, evaluate, type EventRow, type FilmFacts } from "../lib/rec/metrics";

/**
 * How the recommender is actually doing.
 *
 *   npm run rec:evaluate                 everything
 *   npm run rec:evaluate -- --days 7
 *
 * Reads the event log and nothing else. The point of running it is not the
 * numbers on any single day — it is having a baseline before a ranking change
 * and the same numbers after, so a weight adjustment becomes a measurement
 * rather than a matter of taste.
 *
 * It refuses to sound confident about thin data. Below thirty sessions the
 * figures are printed with a warning, because the most dangerous output of an
 * evaluation harness is a decisive number computed from nine events.
 */

async function main() {
  const daysArg = process.argv.indexOf("--days");
  const days = daysArg === -1 ? null : Number(process.argv[daysArg + 1]);
  const since = days ? new Date(Date.now() - days * 86400000) : undefined;

  const [sessions, rawEvents, catalogueSize] = await Promise.all([
    db.recSession.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      select: { id: true, createdAt: true, confidence: true, modelVersion: true },
    }),
    db.recEvent.findMany({
      where: since ? { createdAt: { gte: since } } : {},
      select: {
        sessionId: true,
        type: true,
        filmId: true,
        rank: true,
        score: true,
        reason: true,
        createdAt: true,
      },
    }),
    db.film.count(),
  ]);

  const events = rawEvents as EventRow[];

  const filmIds = [...new Set(events.map((e) => e.filmId).filter(Boolean))] as string[];
  const films = new Map<string, FilmFacts>(
    (
      await db.film.findMany({
        where: { id: { in: filmIds } },
        select: { id: true, director: true, country: true, year: true, genres: true },
      })
    ).map((film) => [film.id, { ...film, genres: fromCsv(film.genres) }]),
  );

  const report = evaluate(sessions, events, films, catalogueSize);

  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  console.log(`\nxine recommender — ${days ? `last ${days} days` : "all time"}\n`);
  console.log(`  sessions              ${report.sessions}`);
  console.log(`  events                ${report.events}`);
  console.log("");
  console.log(`  decision rate         ${pct(report.decisionRate)}  (${report.decided} evenings ended in a pick)`);
  console.log(
    `  cards to decision     ${report.cardsToDecision === null ? "—" : report.cardsToDecision.toFixed(1)}`,
  );
  console.log(`  interest rate         ${pct(report.interestRate)}`);
  console.log(`  never-recommend rate  ${pct(report.neverRate)}`);
  console.log(`  reasons given         ${report.reasonsGiven}`);
  console.log("");
  console.log(`  catalogue coverage    ${pct(report.coverage)}`);
  console.log(`  repeat impressions    ${pct(report.repeatRate)}`);
  if (report.diversity) {
    console.log(
      `  per session           ${report.diversity.directors.toFixed(1)} directors · ` +
        `${report.diversity.countries.toFixed(1)} countries · ` +
        `${report.diversity.decades.toFixed(1)} decades`,
    );
  }

  if (report.topReasons.length > 0) {
    console.log("\n  why films were refused");
    for (const row of report.topReasons) {
      console.log(`    ${String(row.count).padStart(4)}  ${row.reason}`);
    }
  }

  if (!enough(report)) {
    console.log(
      "\n  Not enough data to conclude anything. These are the shape of the\n" +
        "  report rather than a result: thirty sessions and three hundred\n" +
        "  events is the floor at which any of it starts meaning something.",
    );
  }

  console.log("");
}

main();
