import { NEUTRAL, type Vector } from "@/lib/rec/dimensions";

/**
 * xine's own vocabulary for what a film is like.
 *
 * Genres say what happens in a film. These say what it is like to sit through
 * one, which is much closer to how anybody actually chooses: nobody wants "a
 * thriller", they want the specific dread of a film where nothing has
 * happened yet and something is about to. The editorial lists have been
 * making this argument for seventy-two entries; this is the same argument in
 * a form the ranker can read.
 *
 * A cluster is a signature over the shared dimensions plus a tolerance. A
 * film belongs to it to the degree its profile sits inside that signature —
 * so membership is computed rather than assigned, and a film imported
 * tomorrow joins the right clusters without anybody tagging it.
 *
 * Deliberately not exhaustive. Twelve clusters that mean something are worth
 * more than forty that overlap, and a film belonging to nothing is a fine
 * outcome — most films are simply films.
 */

export type Cluster = {
  key: string;
  label: string;
  blurb: string;
  /** Where a member sits on the dimensions that define this cluster. */
  signature: Vector;
  /** How far from the signature still counts. Lower is stricter. */
  tolerance?: number;
};

export const CLUSTERS: Cluster[] = [
  {
    key: "quiet-dread",
    label: "Quiet Dread",
    blurb: "Nothing has happened yet, and something is about to.",
    signature: { tension: 0.85, pace: 0.25, darkness: 0.72, violence: 0.3, accessibility: 0.65 },
  },
  {
    key: "beautifully-miserable",
    label: "Beautifully Miserable",
    blurb: "Made to be looked at, and it will not be making you feel better.",
    signature: { beauty: 0.9, weight: 0.85, darkness: 0.7, humour: 0.2, pace: 0.3 },
  },
  {
    key: "neon-loneliness",
    label: "Neon Loneliness",
    blurb: "Cities at night, and people not quite meeting in them.",
    signature: { beauty: 0.88, weight: 0.7, dialogue: 0.35, pace: 0.3, romance: 0.6, darkness: 0.6 },
  },
  {
    key: "mind-games",
    label: "Mind Games",
    blurb: "The film is playing you, and it wants you to notice.",
    signature: { story: 0.85, accessibility: 0.72, tension: 0.7, weirdness: 0.6 },
  },
  {
    key: "eat-the-rich",
    label: "Eat the Rich",
    blurb: "Money as the weapon, and manners as the mask.",
    signature: { darkness: 0.75, humour: 0.7, tension: 0.7, weight: 0.68, violence: 0.6 },
  },
  {
    key: "professional-obsession",
    label: "Professional Obsession",
    blurb: "Being very good at one thing, and what it costs to stay that way.",
    signature: { weight: 0.78, accessibility: 0.72, dialogue: 0.75, humour: 0.22, pace: 0.35 },
  },
  {
    key: "everything-falling-apart",
    label: "Everything Is Falling Apart",
    blurb: "A life coming undone at the speed of an ordinary week.",
    signature: { weight: 0.9, darkness: 0.75, pace: 0.35, romance: 0.35, accessibility: 0.6 },
  },
  {
    key: "existential-sci-fi",
    label: "Existential Sci-Fi",
    blurb: "The future as a way of asking what a person is.",
    signature: { realism: 0.85, weight: 0.7, accessibility: 0.68, pace: 0.35, beauty: 0.75 },
  },
  {
    key: "beautiful-crime",
    label: "Beautiful Crime",
    blurb: "Terrible things, shot like an advertisement.",
    signature: { beauty: 0.85, violence: 0.7, darkness: 0.72, story: 0.7, pace: 0.6 },
  },
  {
    key: "relentless",
    label: "No Time to Sit Down",
    blurb: "Two hours with your shoulders somewhere around your ears.",
    signature: { pace: 0.92, tension: 0.88, story: 0.8, accessibility: 0.22, violence: 0.72 },
  },
  {
    key: "comfort",
    label: "Nothing Here Will Hurt You",
    blurb: "Warm, funny, and entirely uninterested in devastating you.",
    signature: { darkness: 0.18, humour: 0.75, weight: 0.3, accessibility: 0.25, violence: 0.12 },
  },
  {
    key: "strange-weather",
    label: "Strange Weather",
    blurb: "The rules are different here and nobody is going to explain them.",
    signature: { weirdness: 0.9, realism: 0.75, accessibility: 0.78, story: 0.35 },
  },
];

const DEFAULT_TOLERANCE = 0.2;

/**
 * A dimension only counts if the cluster has an opinion about it.
 *
 * A signature written near the middle — "story: 0.6, tension: 0.6" — matches
 * almost everything, which is how Professional Obsession ended up with nine
 * thousand members and Beautifully Miserable with a hundred. A cluster is
 * defined by what it insists on, so anything within this distance of neutral
 * is treated as silence rather than as a requirement.
 */
const OPINION = 0.15;

/**
 * How well a film fits a cluster, 0–1.
 *
 * Distance over the signature's own dimensions only — a cluster that says
 * nothing about romance should not reject a film for being romantic — and
 * scaled so that a film sitting exactly on the signature scores 1 and one a
 * tolerance away scores nothing. That sharpness is deliberate: a cluster
 * everything belongs to slightly is a cluster that means nothing.
 */
export function membership(profile: Vector, cluster: Cluster): number {
  const keys = (Object.keys(cluster.signature) as (keyof Vector)[]).filter(
    (key) => Math.abs((cluster.signature[key] ?? NEUTRAL) - NEUTRAL) >= OPINION,
  );
  if (keys.length < 3) return 0;

  let total = 0;
  for (const key of keys) {
    const want = cluster.signature[key] ?? NEUTRAL;
    const has = profile[key] ?? NEUTRAL;
    total += Math.abs(want - has);
  }

  const average = total / keys.length;
  const tolerance = cluster.tolerance ?? DEFAULT_TOLERANCE;
  return Math.max(0, 1 - average / tolerance);
}

/** Every cluster a film belongs to, strongest first. */
export function clustersFor(profile: Vector, floor = 0.25) {
  return CLUSTERS.map((cluster) => ({
    cluster: cluster.key,
    label: cluster.label,
    weight: membership(profile, cluster),
  }))
    .filter((row) => row.weight >= floor)
    .sort((a, b) => b.weight - a.weight);
}

export function clusterByKey(key: string) {
  return CLUSTERS.find((cluster) => cluster.key === key) ?? null;
}
