import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import {
  browseCatalogue,
  catalogueFacets,
  filmDetail,
  rankByAxis,
  searchCatalogue,
  type CatalogueRow,
} from "@/lib/agent/catalogue";
import {
  discoverConfigured,
  discoverExternal,
  lookupExternal,
  summariseExternal,
  watchRegion,
  type ExternalCandidate,
} from "@/lib/agent/discover";
import { TMDB_GENRES } from "@/lib/tmdb";
import { AXES } from "@/lib/scores";
import type { Turn } from "@/lib/agent/prompts";
import { recommendOffline } from "@/lib/agent/offline";
import { describeTaste, type TasteProfile } from "@/lib/agent/taste";

/**
 * The XINE film programmer.
 *
 * Three stages, one loop: read the request for its real signals, research it
 * against both a deep curated catalogue and the breadth of TMDB, then write
 * pitches for a shortlist of three.
 *
 * It ends by calling exactly one of two tools — `recommend` or `ask` — so the
 * shape of the answer is enforced by a schema rather than parsed out of prose,
 * and the internal scoring never reaches the reader.
 */

/**
 * Distance from established taste, not the film's status in the world.
 * "Hidden gem" describes a film; "adjacent" describes a relationship — and a
 * recommender that only ever plays it safe builds a taste bubble.
 */
export type Archetype = "safe" | "adjacent" | "wildcard";

export type Recommendation = {
  id: string;
  archetype: Archetype;
  matchScore: number;
  vibeCheck: string[];
  whyItFits: string;
};

/** A recommendation resolved against whichever source produced it. */
export type PickCard = Recommendation & {
  title: string;
  year: number | null;
  director: string | null;
  runtime: number | null;
  posterUrl: string | null;
  slug: string | null;
  inCatalogue: boolean;
  criticScore: number | null;
  communityScore: number | null;
  providers: string[];
  providerRegion: string | null;
};

export type FinderResult = {
  kind: "recommendations" | "question";
  intro: string;
  question: string | null;
  picks: PickCard[];
  finalPick: { id: string; reason: string } | null;
  toolCalls: number;
  configured: boolean;
  externalEnabled: boolean;
};

export function agentConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MAX_PICKS = 5;

async function buildSystemPrompt(taste: TasteProfile | null) {
  const facets = await catalogueFacets();
  const external = discoverConfigured();

  return `You are an expert film critic and taste-matching agent for XINE, an editorial cinema platform.

Your goal: analyse the request, extract the real taste parameters underneath it, and recommend precisely matched films with rationales written for this person.

You are not a general film chatbot. No trivia, no industry news, no essays. If asked something off-task, answer in a sentence and steer back.

# 1. DECONSTRUCT THE REQUEST

Identify mood, pacing, aesthetic, sub-genre, and any hard constraints — runtime, era, language, rating.

Identify the implicit tastes too. "Like Severance" implies workplace paranoia, sleek minimalism and dark satire. "Like Fight Club but with a darker synthwave soundtrack, under two hours" implies identity crisis, anti-establishment rage, dark subculture, neon-noir surface, high pace, and a hard 120-minute ceiling.

When they name a reference film, decompose what characterises it and match on those qualities. Never retrieve on the title alone. Use lookup_film to check the reference's own metadata when it would sharpen the read.

# 2. RESEARCH — TWO SOURCES, DIFFERENT JOBS

**The XINE catalogue** (${facets.total} films) covers the United States, Vietnam, South Korea and Europe. Every one of them has a page on the site, so prefer them — a catalogue pick is a link the reader can follow.

It has two tiers, and tool results mark which is which:
- **Reviewed** films carry a hand-written synopsis, a XINE critic score, and community ratings across the six axes. These are the ones with real editorial weight behind them. Lead with them where they fit.
- **Unreviewed** films are catalogued but not yet written about. Their synopsis is TMDB's and they have no axis data. Still perfectly recommendable — just do not describe them as though XINE has reviewed them, and do not cite an axis score they do not have.

Genres: ${facets.genres.join(", ")}
Countries: ${facets.countries.join(", ")}
Decades: ${facets.decades.map((d) => `${d}s`).join(", ")}

${
  external
    ? `**TMDB** is broad and shallow — effectively every film ever released, with no XINE editorial data. Use discover_external when the catalogue cannot serve the request, when the reader names something outside it, or when a genuine hidden gem or classic would round out the shortlist.

TMDB genres you can filter on: ${Object.keys(TMDB_GENRES).join(", ")}

Streaming availability comes back from TMDB for region ${watchRegion()}. Report it only as returned. If a film has no providers listed, say availability is unknown — never guess, and never name a service that was not in the data.`
    : `**TMDB is not configured**, so you are limited to the catalogue. When it cannot serve a request, say so plainly rather than stretching. You have no streaming availability data at all — if asked where to watch, say XINE does not have that yet.`
}

Research narrowly. Search around the actual signals rather than a broad "best crime films" sweep. Two to five tool calls is normal.

XINE's rating axes turn taste into a query: every catalogue film carries Overall out of 10 plus ${AXES.map((a) => a.label).join(", ")}. "Looks extraordinary, plot can be thin" is a Visual query. "Unrecognisable with the sound off" is Sound. Use rank_by_axis for those.

# 3. SELECT

Build a candidate pool of roughly 10 to 20 internally. Never show it. Cut hard against the taste profile and reject weak matches.

Return exactly three films where you can, ${MAX_PICKS} at the absolute most, fewer if only two genuinely earn it. Padding a shortlist is worse than a short one.

Make the three distinct — approach the request from different angles, and label each with its archetype:
- **safe** — squarely inside what they have told you they like. High confidence, low risk.
- **adjacent** — a step outside the established pattern that should still land, and stretches it slightly.
- **wildcard** — a film that looks wrong on paper but shares a deeper structural or emotional affinity. Justify it hard or drop it.

Always try to include a wildcard. A recommender that only plays it safe builds a taste bubble, and the reader can find the safe answer themselves.

Do not let fame drive the order. A lesser-known 90% fit outranks a famous 60% fit. Never recommend the same handful of famous titles to every request.

# SCORING

Give every pick a XINE Match percentage: your editorial judgement of fit for this specific request, not a quality rating and not a review score. Be discriminating — a 72% fit is a 72%. Reserve 95%+ for uncanny.

Catalogue critic and community scores are real XINE data. TMDB vote averages are TMDB's. Your Match percentage is yours. Never blur them, and never let a high rating alone justify a pick.

# THE RECOMMENDATION CONSTITUTION

Every pick must survive these before you return it. Drop anything that fails.

1. Never recommend a film because its genre matches. Genre is the weakest signal available to you.
2. Identify the property actually responsible for their enjoyment, and match on that.
3. Prefer meaningful similarity over superficial similarity. "Also has a twist" is superficial. "Also withholds information the audience could have assembled" is meaningful.
4. Distinguish a similar story from a similar emotional experience, and say which one you are offering.
5. Do not recommend what they have already told you they know or have seen.
6. Balance familiarity, discovery, quality and context — that is what the three archetypes are for.
7. When a current mood is stated explicitly, it outranks historical preference.
8. Preserve real diversity between the picks. Three films from the same director, decade and register is one recommendation with three titles.
9. Explain why each film matches this person, not why it is good.
10. Never fabricate a director, cast member, plot point, rating, award or release date.

# NEVER

Invent ratings, awards, festival results, review quotes, box office, or streaming availability. Never recommend a film neither tool returned to you. Never dump a list. Never reveal your candidate pool or internal reasoning — the reader sees the picks and the rationale, nothing else.

# MEMORY

Everything they say is a preference signal. Carry it forward. "I loved Prisoners" raises darkness and slow-burn investigation. "Blade Runner was too slow" lowers tolerance for meditative pacing. "Nothing before 2000" is a hard constraint until lifted. If they reject a pick, work out why it failed and adjust — do not just swap in another famous title.

# ASKING

Do not interrogate. If you can already recommend well, recommend. Ask exactly one short question via the ask tool only when a missing preference would genuinely change your picks — and never twice in a row.

# FINISHING

Call exactly one tool at the end: recommend, or ask.

Your own message text is one short paragraph of framing, or nothing. Do not list the films in prose — the picks render from the tool call. No headers, no bullets.

whyItFits is two to three sentences connecting their specific words to this specific film. "A masterpiece of the genre" is not a rationale. Write like an articulate critic talking to a friend: insightful, direct, no marketing copy.

vibeCheck is exactly three short descriptors. Not sentences. "Neon-drenched", "Slow burn", "Morally bankrupt".

${taste ? `\n${describeTaste(taste)}` : ""}`;
}

function summariseRow(row: CatalogueRow) {
  const axes = Object.entries(row.axes)
    .filter(([, value]) => typeof value === "number")
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");

  return [
    `${row.slug} | ${row.title} (${row.year}) | dir ${row.director}`,
    row.country,
    row.genres.join("/"),
    row.runtime ? `${row.runtime}min` : null,
    row.reviewed ? "REVIEWED" : "unreviewed",
    row.criticScore ? `critic ${row.criticScore}` : null,
    row.communityScore ? `community ${row.communityScore}` : null,
    axes || null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function rowsToText(rows: CatalogueRow[]) {
  if (rows.length === 0) return "No catalogue films matched.";
  return rows.map(summariseRow).join("\n");
}

export async function runFinder(
  turns: Turn[],
  taste: TasteProfile | null = null,
): Promise<FinderResult> {
  const externalEnabled = discoverConfigured();
  if (!agentConfigured()) return fallbackSearch(turns, externalEnabled);

  const client = new Anthropic();
  const catalogueSeen = new Map<string, CatalogueRow>();
  const externalSeen = new Map<number, ExternalCandidate>();
  let toolCalls = 0;

  let outcome: {
    kind: "recommendations" | "question";
    intro: string;
    question: string | null;
    picks: Recommendation[];
    finalPick: { id: string; reason: string } | null;
  } = {
    kind: "recommendations",
    intro: "",
    question: null,
    picks: [],
    finalPick: null,
  };

  const rememberRows = (rows: CatalogueRow[]) => {
    for (const row of rows) catalogueSeen.set(row.slug, row);
    return rows;
  };

  const rememberExternal = (list: ExternalCandidate[]) => {
    for (const item of list) externalSeen.set(item.tmdbId, item);
    return list;
  };

  const browse = betaTool({
    name: "browse_catalogue",
    description:
      "Filter the XINE catalogue by structured criteria — hard constraints like runtime, era or country. Use the exact facet values from the system prompt.",
    inputSchema: {
      type: "object",
      properties: {
        genre: { type: "string" },
        country: { type: "string" },
        director: { type: "string" },
        decade: { type: "number" },
        yearFrom: { type: "number" },
        yearTo: { type: "number" },
        maxRuntime: { type: "number" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
    run: async (input) => {
      toolCalls++;
      return rowsToText(rememberRows(await browseCatalogue(input)));
    },
  });

  const search = betaTool({
    name: "search_catalogue",
    description:
      "Free-text search of the XINE catalogue across title, director, synopsis, cast, genre and cinematographer. Use for themes and the qualities you decomposed from a reference film.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run: async ({ query, limit }) => {
      toolCalls++;
      return rowsToText(rememberRows(await searchCatalogue(query, limit ?? 12)));
    },
  });

  const rank = betaTool({
    name: "rank_by_axis",
    description:
      "Rank the XINE catalogue by community average on one rating axis. Use when the request is about a quality rather than a subject.",
    inputSchema: {
      type: "object",
      properties: {
        axis: {
          type: "string",
          enum: AXES.map((a) => a.key) as unknown as string[],
        },
        limit: { type: "number" },
      },
      required: ["axis"],
      additionalProperties: false,
    },
    run: async ({ axis, limit }) => {
      toolCalls++;
      return rowsToText(rememberRows(await rankByAxis(axis, limit ?? 10)));
    },
  });

  const detail = betaTool({
    name: "film_detail",
    description:
      "Full XINE record for one catalogue film by slug: synopsis, credits, axis breakdown.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" } },
      required: ["slug"],
      additionalProperties: false,
    },
    run: async ({ slug }) => {
      toolCalls++;
      const film = await filmDetail(slug);
      return film ? JSON.stringify(film) : `No catalogue film "${slug}".`;
    },
  });

  const discover = betaTool({
    name: "discover_external",
    description:
      "Structured search across all of TMDB, with streaming availability. Use when the catalogue cannot serve the request or a hidden gem or classic would round out the shortlist. Keyword filters are ANDed — pass few and specific.",
    inputSchema: {
      type: "object",
      properties: {
        genres: {
          type: "array",
          items: { type: "string" },
          description: "TMDB genre names from the system prompt.",
        },
        excludeGenres: { type: "array", items: { type: "string" } },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Up to four specific themes, e.g. 'neo-noir', 'heist'.",
        },
        yearFrom: { type: "number" },
        yearTo: { type: "number" },
        maxRuntime: { type: "number", description: "Minutes" },
        minRuntime: { type: "number" },
        language: {
          type: "string",
          description: "ISO 639-1, e.g. 'ja', 'ko', 'vi'.",
        },
        minVotes: {
          type: "number",
          description: "Lower to surface obscure films; default 200.",
        },
        sortBy: {
          type: "string",
          enum: ["popularity", "rating", "revenue", "newest"],
        },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
    run: async (input) => {
      toolCalls++;
      if (!externalEnabled) {
        return "TMDB is not configured. Work from the catalogue only.";
      }
      const found = rememberExternal(
        await discoverExternal(input, { withProviders: true }),
      );
      if (found.length === 0) return "No TMDB films matched those filters.";
      return found.map(summariseExternal).join("\n");
    },
  });

  const lookup = betaTool({
    name: "lookup_film",
    description:
      "Look up one film by title — use for a reference film the reader named, to check its metadata before decomposing it.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        year: { type: "number" },
      },
      required: ["title"],
      additionalProperties: false,
    },
    run: async ({ title, year }) => {
      toolCalls++;
      if (!externalEnabled) {
        return "TMDB is not configured, so reference films cannot be looked up. Reason from what you know instead, and only recommend catalogue films.";
      }
      const found = await lookupExternal(title, year);
      if (!found) return `No film found for "${title}".`;
      rememberExternal([found]);
      return `${summariseExternal(found)}\nOverview: ${found.overview}`;
    },
  });

  const ask = betaTool({
    name: "ask",
    description:
      "Ask exactly one short clarifying question, only when a missing preference would genuinely change your picks. Never twice in a row.",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "One sentence. Offer concrete alternatives where useful.",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
    run: async ({ question }) => {
      outcome = { ...outcome, kind: "question", question };
      return "Question recorded. Stop here and wait for their answer.";
    },
  });

  const recommend = betaTool({
    name: "recommend",
    description: `Deliver the shortlist. Call exactly once, at the end. Three picks is the target, ${MAX_PICKS} the maximum.`,
    inputSchema: {
      type: "object",
      properties: {
        intro: {
          type: "string",
          description: "One short line framing the shortlist.",
        },
        picks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description:
                  "A catalogue slug, or 'tmdb:<id>' for a TMDB film. Must be one a tool returned.",
              },
              archetype: {
                type: "string",
                enum: ["safe", "adjacent", "wildcard"],
              },
              matchScore: {
                type: "number",
                description: "XINE Match, 0–100. Fit for this request.",
              },
              vibeCheck: {
                type: "array",
                items: { type: "string" },
                description: "Exactly three short descriptors.",
              },
              whyItFits: {
                type: "string",
                description:
                  "Two to three sentences connecting their words to this film.",
              },
            },
            required: [
              "id",
              "archetype",
              "matchScore",
              "vibeCheck",
              "whyItFits",
            ],
            additionalProperties: false,
          },
        },
        finalPick: {
          type: "object",
          properties: {
            id: { type: "string" },
            reason: {
              type: "string",
              description: "One sentence on the decisive reason.",
            },
          },
          required: ["id", "reason"],
          additionalProperties: false,
        },
      },
      required: ["intro", "picks", "finalPick"],
      additionalProperties: false,
    },
    run: async ({ intro, picks, finalPick }) => {
      // Only ids a tool actually returned survive. The model should never
      // produce anything else, but a dead card is not worth shipping.
      const known = (id: string) =>
        id.startsWith("tmdb:")
          ? externalSeen.has(Number(id.slice(5)))
          : catalogueSeen.has(id);

      const valid = picks
        .filter((p) => known(p.id))
        .slice(0, MAX_PICKS)
        .map((p) => ({
          id: p.id,
          archetype: p.archetype as Archetype,
          matchScore: Math.max(0, Math.min(100, Math.round(p.matchScore))),
          vibeCheck: p.vibeCheck.slice(0, 3),
          whyItFits: p.whyItFits,
        }));

      const ids = new Set(valid.map((p) => p.id));

      outcome = {
        kind: "recommendations",
        intro,
        question: null,
        picks: valid,
        finalPick: ids.has(finalPick.id) ? finalPick : null,
      };

      const dropped = picks.length - valid.length;
      return dropped > 0
        ? `Recorded ${valid.length}. Dropped ${dropped} unknown id(s) — only use ids a tool returned.`
        : `Recorded ${valid.length} pick(s).`;
    },
  });

  const runner = client.beta.messages.toolRunner({
    model: "claude-opus-5",
    max_tokens: 16000,
    output_config: { effort: "medium" },
    system: [
      {
        type: "text",
        text: await buildSystemPrompt(taste),
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [browse, search, rank, detail, discover, lookup, ask, recommend],
    messages: turns.map((turn) => ({ role: turn.role, content: turn.text })),
    max_iterations: 12,
  });

  const final = await runner;

  const answer = final.content
    .filter(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === "text",
    )
    .map((block) => block.text)
    .join("\n\n")
    .trim();

  return {
    kind: outcome.kind,
    intro: answer || outcome.intro,
    question: outcome.question,
    picks: outcome.picks
      .map((pick) => resolvePick(pick, catalogueSeen, externalSeen))
      .filter((card): card is PickCard => card !== null),
    finalPick: outcome.finalPick,
    toolCalls,
    configured: true,
    externalEnabled,
  };
}

/** Join a recommendation back to whichever source produced it. */
function resolvePick(
  pick: Recommendation,
  catalogue: Map<string, CatalogueRow>,
  external: Map<number, ExternalCandidate>,
): PickCard | null {
  if (pick.id.startsWith("tmdb:")) {
    const found = external.get(Number(pick.id.slice(5)));
    if (!found) return null;
    return {
      ...pick,
      title: found.title,
      year: found.year,
      director: found.director,
      runtime: found.runtime,
      posterUrl: found.posterUrl,
      // A TMDB result we already hold links to its real film page.
      slug: found.slug,
      inCatalogue: Boolean(found.slug),
      criticScore: null,
      communityScore: null,
      providers: found.providers,
      providerRegion: found.providerRegion,
    };
  }

  const row = catalogue.get(pick.id);
  if (!row) return null;
  return {
    ...pick,
    title: row.title,
    year: row.year,
    director: row.director,
    runtime: row.runtime,
    posterUrl: row.posterUrl,
    slug: row.slug,
    inCatalogue: true,
    criticScore: row.criticScore,
    communityScore: row.communityScore,
    providers: [],
    providerRegion: null,
  };
}

/**
 * No model key — the page still has to work. Plain keyword search over the
 * catalogue, labelled honestly rather than dressed up as programming.
 */
async function fallbackSearch(
  turns: Turn[],
  externalEnabled: boolean,
): Promise<FinderResult> {
  const latest = [...turns].reverse().find((t) => t.role === "user");
  const picks = await recommendOffline(latest?.text ?? "", 3);

  const archetypes: Archetype[] = ["safe", "adjacent", "wildcard"];

  return {
    kind: "recommendations",
    intro:
      picks.length > 0
        ? "Matched on the catalogue's own data — rating axes, genre, country and runtime. No model involved, so the reasons below are facts rather than argument."
        : "Nothing in the catalogue matches those signals. Try naming a mood, a genre, or how long you have.",
    question: null,
    picks: picks.map((film, i) => ({
      id: film.slug,
      archetype: archetypes[i] ?? "safe",
      // A rule-based score is a fit percentage, not a critic's judgement, and
      // is capped well below the range the agent uses so the two never read
      // as the same claim.
      matchScore: Math.min(88, Math.round(film.score)),
      vibeCheck: film.genres.slice(0, 3),
      whyItFits:
        film.reasons.length > 0
          ? `Matched on ${film.reasons.slice(0, 3).join(", ")}. ${film.director}, ${film.year}.`
          : `${film.director}, ${film.year}. Ranked on the catalogue's own scores.`,
      title: film.title,
      year: film.year,
      director: film.director,
      runtime: film.runtime,
      posterUrl: film.posterUrl,
      slug: film.slug,
      inCatalogue: true,
      criticScore: film.criticScore,
      communityScore: film.communityScore,
      providers: [],
      providerRegion: null,
    })),
    finalPick: null,
    toolCalls: 0,
    configured: false,
    externalEnabled,
  };
}
