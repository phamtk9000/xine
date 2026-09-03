import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { intentSchema, type Intent } from "@/lib/rec/intent";
import { DIMENSIONS } from "@/lib/rec/dimensions";
import { readKeywords } from "@/lib/rec/keywords";

export { readKeywords };

/**
 * A sentence, turned into an intent.
 *
 * The model's only job is translation. It never sees the catalogue, never
 * names a film it has not been given, and never returns anything but a JSON
 * object that has to survive a Zod parse before it is allowed near the
 * ranker. That boundary is the whole safety story: a hallucinated film id
 * cannot enter the deck if the deck is only ever built from database rows,
 * and the worst a bad parse can do is describe an evening nobody asked for —
 * which the reader can see, because the interpretation is shown as removable
 * chips rather than applied silently.
 *
 * The keyword reader below is not a stub. It runs when no key is configured,
 * when the API is down, and when the model returns something the schema
 * rejects, and it is good enough that the page keeps working rather than
 * apologising. "Something funny and short" is not a hard sentence.
 */

export const PROMPT_VERSION = "intent-v1";

const MODEL = "claude-sonnet-5";

export function interpreterConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    soft: {
      type: "object" as const,
      description:
        "Position on each dimension, 0 to 1. Only include dimensions the request actually implies. 0.5 means no opinion and should be omitted rather than sent.",
      properties: Object.fromEntries(
        DIMENSIONS.map((d) => [
          d.key,
          {
            type: "number" as const,
            description: `0 = ${d.low}, 1 = ${d.high}`,
          },
        ]),
      ),
    },
    hard: {
      type: "object" as const,
      description: "Facts a film must satisfy. Omit anything not stated.",
      properties: {
        runtimeMax: { type: "number" as const },
        runtimeMin: { type: "number" as const },
        yearMin: { type: "number" as const },
        yearMax: { type: "number" as const },
        countries: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "ISO 3166-1 alpha-2 codes.",
        },
        excludeGenres: { type: "array" as const, items: { type: "string" as const } },
        includeGenres: { type: "array" as const, items: { type: "string" as const } },
      },
    },
    references: {
      type: "array" as const,
      description:
        "Films the request names as a comparison. Give the title exactly as written; never invent one.",
      items: {
        type: "object" as const,
        properties: {
          title: { type: "string" as const },
          relation: {
            type: "string" as const,
            enum: [
              "similar",
              "similar_but_faster",
              "similar_but_lighter",
              "similar_but_darker",
              "similar_but_less_violent",
              "similar_but_more_emotional",
              "avoid",
            ],
          },
          weight: { type: "number" as const },
        },
        required: ["title", "relation"],
      },
    },
    confidence: {
      type: "number" as const,
      description: "How sure you are this reading is what they meant, 0 to 1.",
    },
  },
  required: ["soft", "confidence"],
};

const SYSTEM = `You translate a person's description of the film they want tonight into a structured intent for a film recommender. You never recommend films and you never name a film that is not in their message.

Rules:
- Only set a dimension the request actually implies. Silence is not 0.5; it is absence.
- Hard constraints are facts they stated: a runtime, a decade, a country, a genre they ruled out. Never turn a mood into a hard constraint.
- "Not too slow" means pace around 0.6, not 1.0. Read intensity, not just direction.
- Countries are ISO 3166-1 alpha-2 codes. "Korean" is KR; "East Asian" is JP, KR, CN, HK, TW.
- If they name a film as a comparison, put it in references with the closest relation. Copy the title exactly as they wrote it.
- Set confidence honestly. A vague request gets a low number, and the page will ask a question rather than pretend.`;

/**
 * The model's reading, if there is a model. Never trusted without the schema.
 */
export async function interpret(text: string): Promise<{
  intent: Intent;
  source: "ai" | "keywords";
  promptVersion: string;
}> {
  const fallback = { intent: readKeywords(text), source: "keywords" as const, promptVersion: "keywords-v1" };
  if (!interpreterConfigured()) return fallback;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: SYSTEM,
      tools: [
        {
          name: "intent",
          description: "Return the structured reading of the request.",
          input_schema: TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "intent" },
      messages: [{ role: "user", content: text.slice(0, 800) }],
    });

    const block = response.content.find((part) => part.type === "tool_use");
    if (!block || block.type !== "tool_use") return fallback;

    const parsed = intentSchema.safeParse(block.input);
    if (!parsed.success) return fallback;

    // The keyword reader still gets a say: anything it is certain about and
    // the model missed is merged in, because the two fail in different places.
    const keywords = readKeywords(text);
    const intent: Intent = {
      ...parsed.data,
      soft: { ...keywords.soft, ...parsed.data.soft },
      hard: { ...keywords.hard, ...parsed.data.hard },
      references:
        parsed.data.references.length > 0 ? parsed.data.references : keywords.references,
    };

    return { intent, source: "ai", promptVersion: PROMPT_VERSION };
  } catch (error) {
    // Logged, not surfaced: the page has already fallen back to the keyword
    // reader and the reader is not owed a stack trace about it. But a silent
    // fallback that nobody can see is how a broken API key survives for
    // months while everybody assumes the parser is just mediocre.
    console.warn("[intent] falling back to keywords:", (error as Error).message);
    return fallback;
  }
}

/**
 * Turn a named title into a catalogue id, or drop it.
 *
 * The model is allowed to repeat a title back; it is not allowed to decide
 * which film that is. This does, against the database, and a reference that
 * matches nothing is discarded rather than guessed at.
 */
export async function resolveReferences(intent: Intent): Promise<Intent> {
  if (intent.references.length === 0) return intent;

  const resolved = await Promise.all(
    intent.references.map(async (reference) => {
      // Exact title first, and by some distance. "Like Burning" resolved by
      // popularity alone finds Mississippi Burning, which has forty times the
      // votes and nothing whatever to do with what was asked. The named film
      // is the point of the sentence; getting it wrong is worse than dropping
      // the reference entirely.
      const candidates = await db.film.findMany({
        where: { title: { contains: reference.title } },
        orderBy: { tmdbVotes: "desc" },
        take: 25,
        select: { id: true, title: true },
      });

      const wanted = reference.title.trim().toLowerCase();
      const film =
        candidates.find((row) => row.title.toLowerCase() === wanted) ??
        candidates.find((row) => row.title.toLowerCase().startsWith(wanted)) ??
        candidates[0];

      return film ? { ...reference, filmId: film.id, title: film.title } : null;
    }),
  );

  return {
    ...intent,
    references: resolved.filter((r): r is NonNullable<typeof r> => r !== null),
  };
}
