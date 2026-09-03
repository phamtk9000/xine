import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../lib/db";
import { intentSchema } from "../lib/rec/intent";
import { DIMENSIONS } from "../lib/rec/dimensions";

/**
 * A second opinion on the recommender's own work.
 *
 *   npm run rec:critique
 *   npm run rec:critique -- --sessions 10
 *
 * The metrics in `rec:evaluate` answer "did readers act?"; they cannot answer
 * "were the films any good for what was asked". This reads a sample of real
 * sessions — the intent, the films dealt, the reasons given — and scores them
 * on intent match, constraint compliance, diversity, serendipity and whether
 * the explanations were honest.
 *
 * It is an evaluator and nothing else. It never writes to any table the
 * application reads, never adjusts a weight, and its output is a report for a
 * person. A system that lets a model grade its own homework and then act on
 * the grade has invented a feedback loop with no ground truth in it.
 */

const MODEL = "claude-sonnet-5";
const PROMPT_VERSION = "critic-v1";

const SYSTEM = `You are evaluating a film recommender's output, offline, for its engineers.

You are given: what the reader asked for (as a structured intent), the films the system dealt them in order, and what the reader did about each one.

Score each of these 0 to 10, and be hard to please — a 7 should mean "acceptable", not "fine".

INTENT_MATCH — did the films answer what was actually asked?
CONSTRAINT_COMPLIANCE — were the stated hard limits (runtime, era, country) respected?
DIVERSITY — was there variety, or one idea repeated?
SERENDIPITY — was there anything the reader would not have found alone?
EXPLANATION_ACCURACY — do the stated reasons correspond to real properties of the films?
REPETITION — 10 means nothing repeated; 0 means the same thing over and over.

Then write at most three sentences of specific criticism naming films. No praise, no summary, no suggestions about the product — only what went wrong and for which film.`;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. The critic is optional by design —\n" +
        "`npm run rec:evaluate` measures behaviour without it.",
    );
    process.exit(1);
  }

  const takeArg = process.argv.indexOf("--sessions");
  const take = takeArg === -1 ? 5 : Number(process.argv[takeArg + 1]);

  const sessions = await db.recSession.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      events: {
        orderBy: { createdAt: "asc" },
        include: {
          film: {
            select: { title: true, year: true, director: true, country: true, runtime: true },
          },
        },
      },
    },
  });

  const usable = sessions.filter((session) => session.events.length >= 4);
  if (usable.length === 0) {
    console.log("No session has enough interactions to critique yet.");
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  for (const session of usable) {
    const intent = intentSchema.parse(JSON.parse(session.intent));

    const asked = Object.entries(intent.soft)
      .map(([key, value]) => {
        const dimension = DIMENSIONS.find((d) => d.key === key);
        return dimension ? `${dimension.low}→${dimension.high}: ${value}` : null;
      })
      .filter(Boolean)
      .join("\n");

    const transcript = session.events
      .filter((event) => event.film)
      .map(
        (event) =>
          `${event.type.padEnd(16)} ${event.film!.title} (${event.film!.year}, ${event.film!.director}, ${event.film!.country ?? "?"}, ${event.film!.runtime ?? "?"}min)` +
          (event.reason ? ` — reason: ${event.reason}` : ""),
      )
      .join("\n");

    const message = [
      `Typed request: ${session.query ?? "(none — chips only)"}`,
      `Chips: ${session.answers}`,
      `Hard constraints: ${JSON.stringify(intent.hard)}`,
      `Soft preferences:\n${asked || "(none)"}`,
      "",
      "What happened:",
      transcript,
    ].join("\n");

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      messages: [{ role: "user", content: message }],
    });

    const text = response.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();

    console.log(`\n${"─".repeat(64)}`);
    console.log(`session ${session.id.slice(0, 8)} · ${session.events.length} events · ${session.modelVersion}`);
    console.log(`request: ${session.query ?? "(chips only)"}`);
    console.log(`${"─".repeat(64)}`);
    console.log(text);
  }

  console.log(`\nPrompt version: ${PROMPT_VERSION}`);
  console.log("This is a report. Nothing here changes production configuration.");
}

main();
