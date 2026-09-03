import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../lib/db";
import { DIMENSIONS } from "../lib/rec/dimensions";
import { deriveProfile, PROFILE_SELECT } from "../lib/rec/derive";

/**
 * Read films properly, where reading them properly is worth paying for.
 *
 *   npm run films:tag                 200 most-seen films without a real profile
 *   npm run films:tag -- --take 1000
 *   npm run films:tag -- --dry-run
 *
 * The derived profiles are arithmetic over genre, runtime and year, and they
 * are honest about their limits: they cannot tell that a Western is
 * beautiful, that a comedy is bleak, or that a horror film is comforting.
 * This asks a model that has read about the film, and writes the answer with
 * a confidence attached.
 *
 * Three rules, and they are what keep this from being a liability.
 *
 * It never invents a film. The id and the title come from the database and
 * are passed in; the model is asked to describe a film it is given, never to
 * choose one.
 *
 * It never overwrites better data. Editorial profiles win over AI, AI wins
 * over derived, and a low-confidence answer is discarded rather than stored —
 * a guess with a number on it is still a guess.
 *
 * It is not on any critical path. Ranking reads whatever profile exists; this
 * improves them in the background, in batches, and can stop at any point
 * without leaving anything half-written.
 */

const MODEL = "claude-sonnet-5";
const PROMPT_VERSION = "tagger-v1";
const MIN_CONFIDENCE = 0.55;
const PAUSE_MS = 350;

const SYSTEM = `You describe films on fixed dimensions for a film recommender. You are given one film's verified metadata. Never mention or invent any other film.

For each dimension return a number from 0 to 1. Only include dimensions you can genuinely judge from the film's reputation and the metadata given — omit the rest rather than guessing at 0.5, and set confidence honestly.

Judge the film as it is, not as its genre implies. A comedy can be bleak; a horror film can be comforting; a Western can be one of the most beautiful things ever shot. That difference is the entire reason this exists — genre-derived guesses are already in the database and they are what you are improving on.`;

function schema() {
  return {
    type: "object" as const,
    properties: {
      ...Object.fromEntries(
        DIMENSIONS.map((d) => [
          d.key,
          { type: "number" as const, description: `0 = ${d.low}, 1 = ${d.high}` },
        ]),
      ),
      confidence: {
        type: "number" as const,
        description: "How well you know this film, 0 to 1.",
      },
      note: {
        type: "string" as const,
        description: "One short sentence of justification. Under 20 words.",
      },
    },
    required: ["confidence"],
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Nothing to do — the derived profiles\n" +
        "already in the database remain in use, which is the designed fallback.",
    );
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");
  const takeArg = process.argv.indexOf("--take");
  const take = takeArg === -1 ? 200 : Number(process.argv[takeArg + 1]);

  // The most-seen films first: a better profile for Heat changes more decks
  // than a better profile for a film nobody is offered.
  const done = new Set(
    (
      await db.filmProfile.findMany({
        where: { source: { in: ["ai", "editorial"] } },
        select: { filmId: true },
      })
    ).map((row) => row.filmId),
  );

  const films = (
    await db.film.findMany({
      orderBy: { tmdbVotes: "desc" },
      take: take * 3,
      select: {
        id: true,
        title: true,
        director: true,
        country: true,
        synopsis: true,
        // year, runtime, genres and the rest of what the derivation reads.
        ...PROFILE_SELECT,
      },
    })
  )
    .filter((film) => !done.has(film.id))
    .slice(0, take);

  if (films.length === 0) {
    console.log("Every candidate already has a real profile.");
    return;
  }

  console.log(`Tagging ${films.length} films with ${MODEL}…`);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let written = 0;
  let thin = 0;
  let failed = 0;

  for (const film of films) {
    const facts = [
      `Title: ${film.title}`,
      `Year: ${film.year}`,
      `Director: ${film.director}`,
      film.country ? `Country: ${film.country}` : "",
      film.runtime ? `Runtime: ${film.runtime} minutes` : "",
      `Genres: ${film.genres}`,
      `Synopsis: ${film.synopsis}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        system: SYSTEM,
        tools: [
          {
            name: "describe",
            description: "Describe this film on the dimensions.",
            input_schema: schema(),
          },
        ],
        tool_choice: { type: "tool", name: "describe" },
        messages: [{ role: "user", content: facts }],
      });

      const block = response.content.find((part) => part.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        failed++;
        continue;
      }

      const input = block.input as Record<string, unknown>;
      const confidence = Number(input.confidence ?? 0);
      if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) {
        thin++;
        continue;
      }

      const dims: Record<string, number> = {};
      for (const dimension of DIMENSIONS) {
        const value = input[dimension.key];
        if (typeof value === "number" && value >= 0 && value <= 1) {
          dims[dimension.key] = Math.round(value * 100) / 100;
        }
      }
      if (Object.keys(dims).length < 4) {
        thin++;
        continue;
      }

      // Anything the model declined to judge keeps its derived value rather
      // than becoming a hole in the vector.
      const merged = { ...deriveProfile(film), ...dims };

      if (dryRun) {
        console.log(`  ${film.title} (${film.year}) — ${input.note ?? ""}`);
        written++;
        continue;
      }

      await db.filmProfile.upsert({
        where: { filmId: film.id },
        create: {
          filmId: film.id,
          dims: JSON.stringify(merged),
          source: "ai",
          confidence,
        },
        update: {
          dims: JSON.stringify(merged),
          source: "ai",
          confidence,
        },
      });
      written++;

      if (written % 25 === 0) {
        process.stdout.write(`  …${written}/${films.length}\n`);
      }
    } catch (error) {
      failed++;
      console.warn(`  ${film.title}: ${(error as Error).message}`);
    }

    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  console.log(
    `\n${dryRun ? "[dry run] " : ""}wrote ${written}, skipped ${thin} as too uncertain, ${failed} failed.`,
  );
  console.log(`Prompt version: ${PROMPT_VERSION}`);
  console.log("Run `npm run films:cluster` afterwards so memberships follow.");
}

main();
