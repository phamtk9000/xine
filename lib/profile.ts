import "server-only";
import { db } from "@/lib/db";
import { averageOverall, dominantAxis, round1 } from "@/lib/scores";
import { fromCsv } from "@/lib/serialize";

/**
 * The taste profile.
 *
 * Everything here is derived, never stored — which means it stays honest as
 * someone's ratings change, and there is no denormalised column to go stale.
 */
export async function getProfile(username: string) {
  const user = await db.user.findUnique({
    where: { username },
    include: {
      ratings: {
        orderBy: { updatedAt: "desc" },
        include: {
          film: {
            select: {
              id: true,
              slug: true,
              title: true,
              year: true,
              director: true,
              genres: true,
              posterUrl: true,
              criticScore: true,
              runtime: true,
              country: true,
              reviewed: true,
              tmdbScore: true,
            },
          },
        },
      },
      reviews: {
        orderBy: { createdAt: "desc" },
        include: { film: { select: { slug: true, title: true, year: true } } },
      },
      watchlist: {
        orderBy: { createdAt: "desc" },
        include: {
          film: {
            select: {
              id: true,
              slug: true,
              title: true,
              year: true,
              director: true,
              genres: true,
              posterUrl: true,
              criticScore: true,
              runtime: true,
              country: true,
              reviewed: true,
              tmdbScore: true,
            },
          },
        },
      },
      lists: {
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { entries: true } } },
      },
      projects: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          genre: true,
          logline: true,
          stage: true,
          visibility: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!user) return null;

  const tally = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  const genres = user.ratings.flatMap((r) => fromCsv(r.film.genres));
  const directors = user.ratings.map((r) => r.film.director);

  return {
    user,
    stats: {
      watched: user.ratings.length,
      reviews: user.reviews.length,
      lists: user.lists.length,
      watchlist: user.watchlist.length,
      average: averageOverall(user.ratings),
      favouriteGenre: tally(genres),
      favouriteDirector: tally(directors),
      lean: dominantAxis(user.ratings),
      // How generous they are relative to everyone else on the same films.
      spread: user.ratings.length
        ? round1(
            Math.max(...user.ratings.map((r) => r.overall)) -
              Math.min(...user.ratings.map((r) => r.overall)),
          )
        : null,
    },
  };
}

export type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

/**
 * The activity feed.
 *
 * `followedBy` narrows it to the people one member has chosen to follow,
 * which is the whole reason following exists — a global feed is a firehose
 * that gets less useful as the site grows, and this is the same query with
 * one clause. Returns nothing when they follow nobody, and the caller shows
 * the empty state rather than silently falling back to everyone: a feed that
 * quietly ignores your choices teaches you not to make them.
 */
export async function recentActivity(
  take = 40,
  options: { followedBy?: string } = {},
) {
  const following = options.followedBy
    ? (
        await db.follow.findMany({
          where: { followerId: options.followedBy },
          select: { followingId: true },
        })
      ).map((row) => row.followingId)
    : null;

  return db.activity.findMany({
    where: following ? { userId: { in: following } } : {},
    orderBy: { createdAt: "desc" },
    take,
    include: {
      user: {
        select: { username: true, displayName: true, avatar: true },
      },
      film: { select: { slug: true, title: true, year: true, director: true } },
    },
  });
}

export async function listMembers() {
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      ratings: { select: { overall: true } },
      _count: { select: { reviews: true, lists: true } },
    },
  });

  return users.map((user) => ({
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    bio: user.bio,
    location: user.location,
    watched: user.ratings.length,
    average: averageOverall(user.ratings),
    reviews: user._count.reviews,
    lists: user._count.lists,
  }));
}
