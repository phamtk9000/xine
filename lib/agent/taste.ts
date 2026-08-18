import "server-only";
import { db } from "@/lib/db";
import { AXES, averageAxis, averageOverall, dominantAxis } from "@/lib/scores";
import { fromCsv } from "@/lib/serialize";

/**
 * Semantic memory — the stable half of a taste model.
 *
 * Everything here is derived from ratings rather than declared, so it stays
 * honest as taste changes and there is no stored profile to go stale. It is
 * deliberately separate from the conversation transcript: "something funny
 * tonight" is contextual state and must never be written back here as
 * "this person loves comedy".
 */

export type TasteProfile = {
  username: string;
  watched: number;
  average: number | null;
  axes: Record<string, number | null>;
  lean: { label: string; lean: number } | null;
  favouriteGenres: string[];
  favouriteDirectors: string[];
  loved: { title: string; score: number }[];
  disliked: { title: string; score: number }[];
  seen: string[];
};

function topBy(values: string[], count: number) {
  const tally = new Map<string, number>();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([value]) => value);
}

export async function getTasteProfile(
  userId: string,
): Promise<TasteProfile | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      ratings: {
        orderBy: { overall: "desc" },
        select: {
          overall: true,
          story: true,
          direction: true,
          visual: true,
          performance: true,
          sound: true,
          film: {
            select: { slug: true, title: true, genres: true, director: true },
          },
        },
      },
      watchlist: { select: { film: { select: { slug: true } } } },
    },
  });

  if (!user || user.ratings.length === 0) return null;

  const axes: Record<string, number | null> = {};
  for (const { key } of AXES) axes[key] = averageAxis(user.ratings, key);

  const lean = dominantAxis(user.ratings);

  return {
    username: user.username,
    watched: user.ratings.length,
    average: averageOverall(user.ratings),
    axes,
    lean: lean ? { label: lean.label, lean: lean.lean } : null,
    favouriteGenres: topBy(
      user.ratings.flatMap((r) => fromCsv(r.film.genres)),
      5,
    ),
    favouriteDirectors: topBy(
      user.ratings.map((r) => r.film.director),
      4,
    ),
    loved: user.ratings
      .slice(0, 5)
      .map((r) => ({ title: r.film.title, score: r.overall })),
    // Their own floor, not an absolute one — a 6.5 from someone who averages
    // 8.8 is a dislike, and the same number from a harsh rater is not.
    disliked: user.ratings
      .slice(-3)
      .reverse()
      .filter((r) => r.overall < (averageOverall(user.ratings) ?? 10) - 0.8)
      .map((r) => ({ title: r.film.title, score: r.overall })),
    seen: user.ratings.map((r) => r.film.slug),
  };
}

/** Rendered into the system prompt when someone is signed in. */
export function describeTaste(taste: TasteProfile): string {
  const lines = [
    `# WHO YOU ARE TALKING TO`,
    ``,
    `${taste.watched} films rated, averaging ${taste.average?.toFixed(1) ?? "—"}.`,
  ];

  if (taste.lean) {
    lines.push(
      `Rewards ${taste.lean.label} above everything else — ${taste.lean.lean.toFixed(1)} above their own average across the other axes. That is the strongest single signal you have about them.`,
    );
  }

  const axisLine = AXES.map(({ key, label }) =>
    typeof taste.axes[key] === "number"
      ? `${label} ${taste.axes[key]?.toFixed(1)}`
      : null,
  )
    .filter(Boolean)
    .join(", ");
  if (axisLine) lines.push(`Axis averages: ${axisLine}.`);

  if (taste.favouriteGenres.length) {
    lines.push(`Rates most often in: ${taste.favouriteGenres.join(", ")}.`);
  }
  if (taste.favouriteDirectors.length) {
    lines.push(`Directors they return to: ${taste.favouriteDirectors.join(", ")}.`);
  }
  if (taste.loved.length) {
    lines.push(
      `Rated highest: ${taste.loved.map((f) => `${f.title} (${f.score})`).join(", ")}.`,
    );
  }
  if (taste.disliked.length) {
    lines.push(
      `Rated lowest, relative to their own average: ${taste.disliked.map((f) => `${f.title} (${f.score})`).join(", ")}.`,
    );
  }

  lines.push(
    ``,
    `Reason from these rather than restating them. Work out WHY those films score the way they do for this person, and match on that property.`,
    ``,
    `They have already rated these — do not recommend any of them: ${taste.seen.join(", ")}.`,
    ``,
    `This is stable history. Anything they say in this conversation about tonight — a mood, who they are watching with, how long they have — outranks it for this request and does not change it.`,
  );

  return lines.join("\n");
}
