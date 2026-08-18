import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { SEED_FILMS } from "./seed-data/films";
import {
  SEED_BRIEF,
  SEED_LISTS,
  SEED_PASSWORD,
  SEED_PROJECT,
  SEED_RATINGS,
  SEED_REVIEWS,
  SEED_USERS,
} from "./seed-data/community";
import { STAGES } from "../lib/stages";

/** Spread seeded activity across the last few weeks so the feed reads plausibly. */
function daysAgo(n: number, hour = 20): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, (n * 17) % 60, 0, 0);
  return d;
}

async function main() {
  console.log("Clearing existing data…");
  await db.activity.deleteMany();
  await db.serviceEnquiry.deleteMany();
  await db.trailerBrief.deleteMany();
  await db.projectStage.deleteMany();
  await db.project.deleteMany();
  await db.listEntry.deleteMany();
  await db.filmList.deleteMany();
  await db.watchlistItem.deleteMany();
  await db.review.deleteMany();
  await db.rating.deleteMany();
  await db.user.deleteMany();

  // Films are upserted, not wiped. The catalogue also holds whatever
  // `films:import` has pulled from TMDB, and re-seeding must restore the
  // editorial tier without destroying the imported one.
  console.log(`Seeding ${SEED_FILMS.length} editorial films…`);
  const filmIds = new Map<string, string>();
  for (const film of SEED_FILMS) {
    const editorial = {
        slug: film.slug,
        title: film.title,
        originalTitle: film.originalTitle ?? null,
        year: film.year,
        runtime: film.runtime,
        director: film.director,
        country: film.country,
        language: film.language,
        synopsis: film.synopsis,
        genres: film.genres.join(", "),
        cast: film.cast.join(", "),
        cinematographer: film.cinematographer ?? null,
        composer: film.composer ?? null,
      criticScore: film.criticScore,
      releasedAt: new Date(film.year, 0, 1),
      // Hand-written synopsis and critic score — this is the editorial tier.
      reviewed: true,
    };

    // Poster art and tmdbId come from films:sync / films:import, so an upsert
    // must not clear them — only the editorial fields are written here.
    const saved = await db.film.upsert({
      where: { slug: film.slug },
      create: editorial,
      update: editorial,
    });
    filmIds.set(film.slug, saved.id);
  }

  console.log(`Seeding ${SEED_USERS.length} members…`);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const userIds = new Map<string, string>();
  for (const user of SEED_USERS) {
    const created = await db.user.create({
      data: {
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        bio: user.bio,
        location: user.location,
        passwordHash,
      },
    });
    userIds.set(user.username, created.id);
  }

  console.log(`Seeding ${SEED_RATINGS.length} ratings…`);
  let age = SEED_RATINGS.length;
  for (const [
    username,
    slug,
    overall,
    story,
    direction,
    visual,
    performance,
    sound,
  ] of SEED_RATINGS) {
    const userId = userIds.get(username);
    const filmId = filmIds.get(slug);
    if (!userId || !filmId) throw new Error(`Bad rating row: ${username}/${slug}`);
    const createdAt = daysAgo(age--);
    await db.rating.create({
      data: {
        userId,
        filmId,
        overall,
        story,
        direction,
        visual,
        performance,
        sound,
        createdAt,
        updatedAt: createdAt,
      },
    });
    await db.activity.create({
      data: {
        userId,
        filmId,
        type: "rated",
        payload: JSON.stringify({ overall }),
        createdAt,
      },
    });
  }

  console.log(`Seeding ${SEED_REVIEWS.length} reviews…`);
  age = SEED_REVIEWS.length * 2;
  for (const review of SEED_REVIEWS) {
    const userId = userIds.get(review.username);
    const filmId = filmIds.get(review.film);
    if (!userId || !filmId) throw new Error(`Bad review row: ${review.film}`);
    const createdAt = daysAgo(age, 21);
    age -= 2;
    await db.review.create({
      data: {
        userId,
        filmId,
        body: review.body,
        spoilers: review.spoilers,
        createdAt,
      },
    });
    await db.activity.create({
      data: { userId, filmId, type: "reviewed", createdAt },
    });
  }

  console.log("Seeding watchlists…");
  const watchlist: [string, string[]][] = [
    ["huy", ["drive-my-car", "burning", "the-scent-of-green-papaya", "mirror"]],
    ["mai", ["the-brutalist", "the-zone-of-interest", "aftersun"]],
    ["kovacs", ["inside-the-yellow-cocoon-shell", "cemetery-of-splendour"]],
    ["dan", ["in-the-mood-for-love", "anatomy-of-a-fall", "past-lives"]],
  ];
  for (const [username, slugs] of watchlist) {
    for (const slug of slugs) {
      await db.watchlistItem.create({
        data: { userId: userIds.get(username)!, filmId: filmIds.get(slug)! },
      });
    }
  }

  console.log(`Seeding ${SEED_LISTS.length} lists…`);
  let listAge = 3;
  for (const list of SEED_LISTS) {
    const createdAt = daysAgo(listAge++, 11);
    const created = await db.filmList.create({
      data: {
        slug: list.slug,
        title: list.title,
        description: list.description,
        editorial: list.editorial,
        ownerId: list.owner ? userIds.get(list.owner)! : null,
        createdAt,
        entries: {
          create: list.films.map((slug, i) => ({
            filmId: filmIds.get(slug)!,
            position: i,
          })),
        },
      },
    });
    if (list.owner) {
      await db.activity.create({
        data: {
          userId: userIds.get(list.owner)!,
          listId: created.id,
          type: "listed",
          payload: JSON.stringify({ title: list.title, count: list.films.length }),
          createdAt,
        },
      });
    }
  }

  console.log("Seeding the CREATE project…");
  const project = await db.project.create({
    data: {
      ownerId: userIds.get(SEED_PROJECT.owner)!,
      title: SEED_PROJECT.title,
      genre: SEED_PROJECT.genre,
      premise: SEED_PROJECT.premise,
      logline: SEED_PROJECT.logline,
      stage: SEED_PROJECT.stage,
      visibility: "community",
    },
  });
  for (const stage of STAGES) {
    const content =
      (SEED_PROJECT.stages as Record<string, string>)[stage.key] ?? "";
    await db.projectStage.create({
      data: {
        projectId: project.id,
        key: stage.key,
        content,
        status: content ? "complete" : "empty",
      },
    });
  }
  await db.activity.create({
    data: {
      userId: userIds.get(SEED_PROJECT.owner)!,
      type: "pitched",
      payload: JSON.stringify({ title: SEED_PROJECT.title, id: project.id }),
      createdAt: daysAgo(6, 15),
    },
  });

  await db.trailerBrief.create({
    data: {
      ownerId: userIds.get(SEED_BRIEF.owner)!,
      projectId: project.id,
      title: SEED_BRIEF.title,
      genre: SEED_BRIEF.genre,
      logline: SEED_BRIEF.logline,
      filmReferences: SEED_BRIEF.filmReferences.join(", "),
      visualReferences: SEED_BRIEF.visualReferences.join("\n"),
    },
  });

  const counts = {
    films: await db.film.count(),
    users: await db.user.count(),
    ratings: await db.rating.count(),
    reviews: await db.review.count(),
    lists: await db.filmList.count(),
    projects: await db.project.count(),
  };
  console.log("Done.", counts);
  console.log(`\nSign in with any of: ${SEED_USERS.map((u) => u.email).join(", ")}`);
  console.log(`Password: ${SEED_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
