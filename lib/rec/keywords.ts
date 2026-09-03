import {
  intentSchema,
  REGION_CODES,
  type Intent,
} from "@/lib/rec/intent";

/**
 * The reader that runs when there is no model, and the check on the one there
 * is.
 *
 * Pure and dependency-free on purpose: it is the fallback for a missing API
 * key, a network failure and a response the schema rejects, so it cannot
 * itself depend on anything that might be unavailable. Being pure also makes
 * it the only part of the interpretation that can be tested without a
 * network, which is why the model's answer is merged with it rather than
 * trusted alone.
 */

/**
 * Negations, read before anything else and then protected.
 *
 * "Not too slow" contains the word "slow", and a reader that scans for words
 * turns a request for something brisk into a request for something glacial —
 * which is exactly what it did the first time this ran. So the negative forms
 * are matched first and the dimensions they set are locked: a later rule
 * finding the bare adjective inside the negation cannot overwrite them.
 */
/** Everything that turns the next word into its opposite. */
const NOT = "(?:not|isn'?t|ain'?t|nothing|no|without|less)";
/** And everything people put between the negation and the adjective. */
const HEDGE = "(?:a\\s+|an\\s+|too\\s+|so\\s+|that\\s+|very\\s+|really\\s+)?";

/** "not too slow", "isn't a romance", "nothing so violent" — one shape. */
function negation(words: string) {
  return new RegExp(`\\b${NOT}\\s+${HEDGE}(?:${words})\\b`, "i");
}

const NEGATIONS: { match: RegExp; soft: Record<string, number> }[] = [
    { match: negation("slow|sluggish|plodding"), soft: { pace: 0.68 } },
    { match: negation("dark|bleak|grim|depressing"), soft: { darkness: 0.3 } },
    { match: negation("violent|violence|gory|bloody"), soft: { violence: 0.12 } },
    { match: negation("weird|strange|surreal|experimental"), soft: { weirdness: 0.3 } },
    { match: negation("long"), soft: { pace: 0.6 } },
    { match: negation("romance|romantic|love story"), soft: { romance: 0.1 } },
    { match: negation("sad|miserable|devastating|depressing|heavy|bleak"), soft: { weight: 0.35, darkness: 0.3 } },
    { match: negation("demanding|difficult|challenging|heavy going"), soft: { accessibility: 0.25 } },
    { match: negation("funny|comedy|comic|silly"), soft: { humour: 0.2 } },
    { match: negation("mainstream|popular|obvious"), soft: { familiarity: 0.75 } },
];

/** Words that mean something specific, and what they mean. */
const KEYWORDS: { match: RegExp; soft?: Record<string, number>; hard?: Record<string, unknown> }[] = [
  { match: /\b(funny|comedy|laugh|light-?hearted)\b/i, soft: { humour: 0.85, darkness: 0.3 } },
  { match: /\b(sad|melanchol\w+|depressing|miserable|devastating|heartbreak\w*)\b/i, soft: { weight: 0.85, darkness: 0.7 } },
  { match: /\b(beautiful|gorgeous|stunning|cinematograph\w+|looks? good)\b/i, soft: { beauty: 0.9 } },
  { match: /\b(scary|horror|terrifying|frightening)\b/i, soft: { darkness: 0.85, tension: 0.85 } },
  { match: /\b(tense|tension|suspense\w*|thriller|edge of)\b/i, soft: { tension: 0.85 } },
  { match: /\b(slow|meditative|contemplative|quiet|patient)\b/i, soft: { pace: 0.18 } },
  { match: /\b(fast|quick|relentless|propulsive|pacy|not too slow)\b/i, soft: { pace: 0.82 } },
  { match: /\b(weird|strange|surreal|experimental|bizarre)\b/i, soft: { weirdness: 0.85, realism: 0.7 } },
  { match: /\b(easy|comfort\w*|undemanding|switch off|background)\b/i, soft: { accessibility: 0.2, darkness: 0.3 } },
  { match: /\b(smart|clever|demanding|challenging|difficult|complex)\b/i, soft: { accessibility: 0.82 } },
  { match: /\b(romance|romantic|love story)\b/i, soft: { romance: 0.85 } },
  { match: /\b(not (too )?violent|less violent|no violence)\b/i, soft: { violence: 0.12 } },
  { match: /\b(violent|brutal|bloody|gory)\b/i, soft: { violence: 0.85 } },
  { match: /\b(hidden gem|obscure|underrated|nobody has seen|haven'?t seen)\b/i, soft: { familiarity: 0.85 } },
  { match: /\b(popular|well known|mainstream|crowd.?pleas\w+)\b/i, soft: { familiarity: 0.18 } },
  { match: /\b(uplifting|hopeful|feel.?good|warm)\b/i, soft: { darkness: 0.2, weight: 0.35 } },
  { match: /\b(bleak|grim|nihilistic|hopeless)\b/i, soft: { darkness: 0.9 } },
  { match: /\b(dark|darker|noir|gritty|sinister|menacing)\b/i, soft: { darkness: 0.8 } },
  { match: /\b(cosy|cozy|comforting|gentle|warm)\b/i, soft: { darkness: 0.22, weight: 0.35 } },
  { match: /\b(twisty|twist|mind.?bend\w*|puzzle)\b/i, soft: { story: 0.8, accessibility: 0.65 } },
  { match: /\b(epic|sweeping|grand)\b/i, soft: { beauty: 0.75, weight: 0.65 } },
  { match: /\b(talky|dialogue|conversation\w*)\b/i, soft: { dialogue: 0.82 } },
  { match: /\b(visual|wordless|no dialogue)\b/i, soft: { dialogue: 0.18 } },
];

const PLACE_WORDS: { match: RegExp; region: keyof typeof REGION_CODES }[] = [
  { match: /\b(korean?|japan\w*|chinese|hong kong|taiwan\w*|east asian?)\b/i, region: "east-asia" },
  { match: /\b(european?|french|german|italian|spanish|swedish|danish|polish|russian)\b/i, region: "europe" },
  { match: /\b(american|hollywood|mexican|brazilian|argentin\w+|latin american?)\b/i, region: "americas" },
  { match: /\b(indian|bollywood|south asian?)\b/i, region: "south-asia" },
  { match: /\b(thai|vietnamese|indonesian|filipino|southeast asian?)\b/i, region: "southeast-asia" },
  { match: /\b(iranian|turkish|israeli|lebanese|egyptian|middle eastern?)\b/i, region: "middle-east" },
  { match: /\b(african|nigerian|senegalese|south african)\b/i, region: "africa" },
  { match: /\b(australian|new zealand)\b/i, region: "oceania" },
];

/** The fallback, and the thing every AI answer is checked against. */
export function readKeywords(text: string): Intent {
  const soft: Record<string, number> = {};
  const hard: Record<string, unknown> = {};

  const locked = new Set<string>();
  for (const rule of NEGATIONS) {
    if (!rule.match.test(text)) continue;
    for (const [key, value] of Object.entries(rule.soft)) {
      soft[key] = value;
      locked.add(key);
    }
  }

  for (const rule of KEYWORDS) {
    if (!rule.match.test(text)) continue;
    for (const [key, value] of Object.entries(rule.soft ?? {})) {
      if (locked.has(key)) continue;
      soft[key] = value;
    }
    Object.assign(hard, rule.hard ?? {});
  }

  for (const place of PLACE_WORDS) {
    if (place.match.test(text)) {
      hard.countries = REGION_CODES[place.region];
      break;
    }
  }

  // "under two hours", "under 90 minutes", "90 mins or less"
  const hours = /under (an hour and a half|two hours|three hours|1\.5 hours)/i.exec(text);
  if (hours) {
    hard.runtimeMax = /an hour and a half|1\.5/i.test(hours[1])
      ? 95
      : /two/i.test(hours[1])
        ? 120
        : 180;
  }
  const minutes = /(?:under|below|less than)\s*(\d{2,3})\s*(?:min|minutes)/i.exec(text);
  if (minutes) hard.runtimeMax = Number(minutes[1]);

  const references: Intent["references"] = [];
  // The title ends where the qualification begins. Without this, "like
  // Parasite but less violent" looks for a film called "Parasite but less
  // violent", finds nothing, and quietly drops the only concrete thing in
  // the sentence.
  const like =
    /\blike\s+(.+?)(?=\s+(?:but|that|though|although|only|except|minus|without|and)\b|[,.;!?]|$)/i.exec(
      text,
    );
  if (like) {
    references.push({
      title: like[1].trim(),
      relation: /less violent/i.test(text)
        ? "similar_but_less_violent"
        : /faster/i.test(text)
          ? "similar_but_faster"
          : /lighter/i.test(text)
            ? "similar_but_lighter"
            : /darker/i.test(text)
              ? "similar_but_darker"
              : "similar",
      weight: 0.6,
    });
  }

  const matched = Object.keys(soft).length + Object.keys(hard).length;
  return intentSchema.parse({
    soft,
    hard,
    references,
    confidence: matched === 0 ? 0.2 : Math.min(0.7, 0.35 + matched * 0.08),
  });
}

