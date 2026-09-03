import { z } from "zod";
import {
  DIMENSION_KEYS,
  NEUTRAL,
  type DimensionKey,
  type Vector,
} from "@/lib/rec/dimensions";

/**
 * What somebody wants tonight, in a shape the ranker can act on.
 *
 * Two halves, and the split is the important part. Hard constraints are
 * facts — under two hours, made in Korea, not horror — and a film either
 * satisfies them or is not shown. Soft preferences are directions, expressed
 * as positions on the shared dimensions, and they order what survives.
 *
 * Getting that boundary wrong in either direction ruins the page. Treating
 * "quiet" as a hard filter throws away a film that is quiet for ninety of its
 * hundred minutes; treating "under two hours" as a preference offers a
 * three-hour film to somebody who told you they have to be up early.
 *
 * Validated with Zod rather than trusted, because one of the things that
 * writes this object is a language model, and a schema is the only place
 * where "the model returned something odd" becomes a caught error rather than
 * a strange evening.
 */

const dimensionValue = z.number().min(0).max(1);

export const softPreferencesSchema = z.object(
  Object.fromEntries(
    DIMENSION_KEYS.map((key) => [key, dimensionValue.optional()]),
  ) as Record<DimensionKey, z.ZodOptional<typeof dimensionValue>>,
);

export const hardConstraintsSchema = z.object({
  runtimeMin: z.number().int().min(0).max(600).optional(),
  runtimeMax: z.number().int().min(0).max(600).optional(),
  yearMin: z.number().int().min(1880).max(2100).optional(),
  yearMax: z.number().int().min(1880).max(2100).optional(),
  /** ISO 3166-1 alpha-2, matched against the film's home country. */
  countries: z.array(z.string().length(2)).max(40).optional(),
  includeGenres: z.array(z.string()).max(12).optional(),
  excludeGenres: z.array(z.string()).max(12).optional(),
  /** Catalogue ids the reader has already dealt with this session. */
  excludeFilmIds: z.array(z.string()).max(500).optional(),
});

export const referenceSchema = z.object({
  title: z.string().min(1).max(120),
  /** Resolved against the catalogue by the caller — never invented. */
  filmId: z.string().optional(),
  relation: z.enum([
    "similar",
    "similar_but_faster",
    "similar_but_lighter",
    "similar_but_darker",
    "similar_but_less_violent",
    "similar_but_more_emotional",
    "avoid",
  ]),
  weight: z.number().min(0).max(1).default(0.6),
});

export const intentSchema = z.object({
  hard: hardConstraintsSchema.default({}),
  soft: softPreferencesSchema.default({}),
  references: z.array(referenceSchema).max(4).default([]),
  context: z
    .object({
      party: z
        .enum(["alone", "date", "friends", "family", "background", "focused"])
        .optional(),
      /** How much attention they are willing to spend, 0–1. */
      effort: z.number().min(0).max(1).optional(),
    })
    .default({}),
  /** How far to stray from the safe answer, 0–1. */
  exploration: z.number().min(0).max(1).default(0.15),
  /** How sure we are that this intent is what they meant, 0–1. */
  confidence: z.number().min(0).max(1).default(0.5),
});

export type Intent = z.infer<typeof intentSchema>;
export type HardConstraints = z.infer<typeof hardConstraintsSchema>;

export const EMPTY_INTENT: Intent = intentSchema.parse({});

/**
 * What each chip means, in dimensions and constraints.
 *
 * The chips are not a lesser version of the natural-language box — they are
 * the same object arrived at by pointing instead of typing, which is why they
 * both produce an Intent and why either can be edited after the other has
 * spoken.
 */
export const MOOD_INTENT: Record<string, Vector> = {
  dark: { darkness: 0.82, tension: 0.72, humour: 0.25 },
  tender: { weight: 0.68, romance: 0.7, darkness: 0.3, humour: 0.45 },
  thrilling: { pace: 0.85, tension: 0.8, story: 0.72 },
  beautiful: { beauty: 0.9, pace: 0.35, dialogue: 0.32 },
  funny: { humour: 0.9, darkness: 0.25, weight: 0.28 },
  strange: { weirdness: 0.85, realism: 0.75, accessibility: 0.68 },
};

export const PARTY_INTENT: Record<string, { soft: Vector; effort: number }> = {
  alone: { soft: {}, effort: 0.6 },
  date: { soft: { romance: 0.65, darkness: 0.35, weight: 0.45 }, effort: 0.5 },
  friends: { soft: { humour: 0.7, pace: 0.68, accessibility: 0.25 }, effort: 0.35 },
  family: {
    soft: { darkness: 0.15, violence: 0.1, humour: 0.68, accessibility: 0.2 },
    effort: 0.3,
  },
  background: {
    soft: { accessibility: 0.15, tension: 0.3, dialogue: 0.35 },
    effort: 0.15,
  },
  focused: {
    soft: { accessibility: 0.75, weight: 0.7, weirdness: 0.6 },
    effort: 0.95,
  },
};

export const REGION_CODES: Record<string, string[]> = {
  "east-asia": ["JP", "KR", "CN", "HK", "TW"],
  "southeast-asia": ["TH", "ID", "PH", "MY", "SG", "VN"],
  "south-asia": ["IN", "PK", "BD", "LK", "NP"],
  europe: [
    "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "AT", "CH",
    "DK", "SE", "NO", "FI", "IS", "PL", "CZ", "SK", "HU", "GR", "RO",
    "BG", "HR", "RS", "SI", "EE", "LV", "LT", "UA", "RU", "SU",
  ],
  americas: ["US", "CA", "MX", "BR", "AR", "CL", "CO", "PE", "UY", "CU", "VE"],
  africa: ["NG", "ZA", "SN", "BF", "ML", "KE", "GH", "ET", "TZ", "CI", "MA", "EG"],
  "middle-east": ["IR", "TR", "IL", "LB", "PS", "SY", "JO", "IQ", "SA", "AE"],
  oceania: ["AU", "NZ"],
};

export type Answers = {
  mood?: string[];
  party?: string;
  length?: string;
  era?: string;
  place?: string;
  /** Direct positions on the dimensions, from the fine-tune sliders. */
  fine?: Vector;
};

/** Chips and sliders to an Intent. Pure, so it runs on either side. */
export function intentFromAnswers(answers: Answers): Intent {
  const soft: Record<string, number> = {};
  /** Later answers win, but two moods average rather than fight. */
  const blend = (vector: Vector, weight = 1) => {
    for (const [key, value] of Object.entries(vector)) {
      if (value === undefined) continue;
      soft[key] =
        soft[key] === undefined ? value : soft[key] * (1 - weight) + value * weight;
    }
  };

  for (const mood of answers.mood ?? []) {
    const pull = MOOD_INTENT[mood];
    if (pull) blend(pull, 0.5);
  }

  const hard: HardConstraints = {};

  if (answers.length === "short") hard.runtimeMax = 100;
  if (answers.length === "normal") {
    hard.runtimeMin = 95;
    hard.runtimeMax = 145;
  }
  if (answers.length === "long") hard.runtimeMin = 140;

  if (answers.era === "now") hard.yearMin = 2015;
  if (answers.era === "modern") {
    hard.yearMin = 1990;
    hard.yearMax = 2014;
  }
  if (answers.era === "classic") hard.yearMax = 1989;

  if (answers.place && answers.place !== "anywhere") {
    const codes = REGION_CODES[answers.place];
    if (codes) hard.countries = codes;
  }

  const context: Intent["context"] = {};
  if (answers.party) {
    const party = PARTY_INTENT[answers.party];
    if (party) {
      blend(party.soft, 0.6);
      context.party = answers.party as NonNullable<Intent["context"]["party"]>;
      context.effort = party.effort;
    }
  }

  // The sliders are explicit and beat anything inferred from a chip.
  for (const [key, value] of Object.entries(answers.fine ?? {})) {
    if (typeof value === "number") soft[key] = value;
  }

  return intentSchema.parse({
    hard,
    soft,
    context,
    // Somebody who has said nothing wants to be surprised more than somebody
    // who has described their evening in four answers.
    exploration: answered(answers) >= 3 ? 0.1 : 0.25,
    confidence: Math.min(0.9, 0.4 + answered(answers) * 0.12),
  });
}

export function answered(answers: Answers) {
  return (
    (answers.mood?.length ? 1 : 0) +
    (answers.party ? 1 : 0) +
    (answers.length ? 1 : 0) +
    (answers.era ? 1 : 0) +
    (answers.place && answers.place !== "anywhere" ? 1 : 0) +
    (Object.keys(answers.fine ?? {}).length > 0 ? 1 : 0)
  );
}

/**
 * An intent as removable chips.
 *
 * The reader has to be able to see what was understood and take any of it
 * back — especially when a sentence was interpreted rather than pointed at.
 * A misread that cannot be removed is worse than no interpretation at all.
 */
export type IntentChip = {
  /** Where it came from, so removing it knows what to edit. */
  kind: "soft" | "hard" | "context" | "reference";
  key: string;
  label: string;
};

export function chipsFor(intent: Intent): IntentChip[] {
  const chips: IntentChip[] = [];

  for (const key of DIMENSION_KEYS) {
    const value = intent.soft[key];
    if (value === undefined || Math.abs(value - NEUTRAL) < 0.12) continue;
    chips.push({ kind: "soft", key, label: describe(key, value) });
  }

  const { hard } = intent;
  if (hard.runtimeMax) {
    chips.push({
      kind: "hard",
      key: "runtimeMax",
      label: `Under ${hard.runtimeMax} min`,
    });
  }
  if (hard.runtimeMin && !hard.runtimeMax) {
    chips.push({
      kind: "hard",
      key: "runtimeMin",
      label: `Over ${hard.runtimeMin} min`,
    });
  }
  if (hard.yearMin || hard.yearMax) {
    chips.push({
      kind: "hard",
      key: "years",
      label:
        hard.yearMin && hard.yearMax
          ? `${hard.yearMin}–${hard.yearMax}`
          : hard.yearMin
            ? `${hard.yearMin} onward`
            : `Before ${(hard.yearMax ?? 0) + 1}`,
    });
  }
  if (hard.countries?.length) {
    const region = Object.entries(REGION_CODES).find(
      ([, codes]) => codes.length === hard.countries!.length,
    );
    chips.push({
      kind: "hard",
      key: "countries",
      label: region ? title(region[0]) : `${hard.countries.length} countries`,
    });
  }
  for (const genre of hard.excludeGenres ?? []) {
    chips.push({ kind: "hard", key: `excludeGenres:${genre}`, label: `No ${genre}` });
  }
  for (const genre of hard.includeGenres ?? []) {
    chips.push({ kind: "hard", key: `includeGenres:${genre}`, label: genre });
  }
  if (intent.context.party) {
    chips.push({
      kind: "context",
      key: "party",
      label: title(intent.context.party),
    });
  }
  for (const reference of intent.references) {
    chips.push({
      kind: "reference",
      key: reference.title,
      label:
        reference.relation === "avoid"
          ? `Not like ${reference.title}`
          : `Like ${reference.title}`,
    });
  }

  return chips;
}

const HIGH: Partial<Record<DimensionKey, string>> = {
  pace: "Relentless",
  weight: "Emotionally heavy",
  accessibility: "Demanding",
  realism: "Fantastical",
  dialogue: "Talkative",
  story: "Plot-driven",
  darkness: "Bleak",
  familiarity: "Hidden gem",
  weirdness: "Experimental",
  beauty: "Visually beautiful",
  humour: "Funny",
  tension: "Tense",
  romance: "Romantic",
  violence: "Violent",
};

const LOW: Partial<Record<DimensionKey, string>> = {
  pace: "Slow",
  weight: "Light",
  accessibility: "Easy",
  realism: "Grounded",
  dialogue: "Visual",
  story: "Character-led",
  darkness: "Comforting",
  familiarity: "Well known",
  weirdness: "Conventional",
  beauty: "Plain",
  humour: "Serious",
  tension: "Calm",
  romance: "No romance",
  violence: "Low violence",
};

function describe(key: DimensionKey, value: number) {
  return value >= NEUTRAL ? (HIGH[key] ?? key) : (LOW[key] ?? key);
}

function title(value: string) {
  return value
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
