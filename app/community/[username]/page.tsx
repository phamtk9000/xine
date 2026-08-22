import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FilmGrid } from "@/components/film-card";
import { AxisSpark } from "@/components/score";
import { Container, formatDate } from "@/components/ui";
import { signOut } from "@/app/actions/auth";
import { editorialCounts } from "@/lib/films";
import { getProfile } from "@/lib/profile";
import { getCurrentUser } from "@/lib/session";
import { fromCsv } from "@/lib/serialize";
import { AXES, averageAxis } from "@/lib/scores";
import { getStage } from "@/lib/stages";
import { WatchedCorridor } from "@/components/watched-corridor";
import { readingFor } from "@/lib/archetype-members";
import { ArchetypeCard } from "@/components/archetype-card";
import { RevealGroup } from "@/components/reveal-group";
import { CountUp } from "@/components/count-up";
import { countriesWatched } from "@/lib/geography";
import { tasteNeighbours } from "@/lib/neighbours";
import { readEraPair } from "@/lib/era";
import { FilmAtlas } from "@/components/film-atlas";
import { CinemaEra } from "@/components/cinema-era";
import { TasteDna } from "@/components/taste-dna";

export async function generateMetadata({
  params,
}: PageProps<"/community/[username]">): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return {};
  return {
    title: `${profile.user.displayName}'s cinema`,
    description:
      profile.user.bio ?? `${profile.stats.watched} films watched on xine.`,
  };
}

export default async function ProfilePage({
  params,
}: PageProps<"/community/[username]">) {
  const { username } = await params;
  const [profile, viewer, reviewCounts, reading, neighbours, atlas] =
    await Promise.all([
      getProfile(username),
      getCurrentUser(),
      editorialCounts(),
      readingFor(username),
      tasteNeighbours(username),
      countriesWatched(username),
    ]);
  if (!profile) notFound();

  const { user, stats } = profile;
  const isMe = viewer?.id === user.id;

  const axisAverages = Object.fromEntries(
    AXES.map(({ key }) => [key, averageAxis(user.ratings, key)]),
  );

  // Both readings need the film itself, not just its year: the reference
  // points name the earliest and latest titles, and the loved distribution
  // is filtered on this person's own score.
  const era = readEraPair(
    user.ratings.map((r) => ({
      year: r.film.year,
      title: r.film.title,
      slug: r.film.slug,
      score: r.overall,
    })),
  );

  const toSummary = (film: {
    id: string;
    slug: string;
    title: string;
    year: number;
    director: string;
    genres: string;
    posterUrl: string | null;
    criticScore: number | null;
    runtime: number | null;
    country: string | null;
    reviewed: boolean;
    tmdbScore: number | null;
  }) => ({
    ...film,
    genres: fromCsv(film.genres),
    communityScore: null,
    ratingCount: 0,
    reviewed: film.reviewed,
    tmdbScore: film.tmdbScore,
    reviewCount: reviewCounts.get(film.slug) ?? 0,
  });

  return (
    <>
      <header className="border-b border-line py-14 sm:py-20">
        <Container>
          <p className="label">@{user.username}</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <h1 className="font-display text-5xl leading-none tracking-tight sm:text-7xl">
              {user.displayName}&rsquo;s cinema
            </h1>
            {isMe && (
              <form action={signOut}>
                <button type="submit" className="label hover:text-accent">
                  Sign out
                </button>
              </form>
            )}
          </div>

          {user.bio && (
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
              {user.bio}
            </p>
          )}

          <dl className="mt-10 grid grid-cols-2 gap-x-10 gap-y-6 border-t border-line pt-8 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Films watched" count={stats.watched} />
            <Stat
              label="Average rating"
              count={stats.average}
              decimals={1}
            />
            <Stat label="Reviews" count={stats.reviews} />
            <Stat label="Lists" count={stats.lists} />
            <Stat
              label="Favourite genre"
              value={stats.favouriteGenre ?? "—"}
              wide
            />
            <Stat
              label="Favourite director"
              value={stats.favouriteDirector ?? "—"}
              wide
            />
          </dl>
        </Container>
      </header>

      <Container className="py-14">
        {/* Sections rise in as you reach them; the grids inside them are
            staggered separately so a long shelf of posters doesn't arrive as
            one slab. */}
        <RevealGroup selector="[data-profile-main]" />
        <RevealGroup selector="[data-profile-aside]" />
        <div className="grid gap-14 lg:grid-cols-[1fr_20rem]">
          <div data-profile-main>
            {user.projects.length > 0 && (
              <section className="mb-14">
                <h2 className="label border-b border-line pb-3">
                  In development
                </h2>
                <div className="mt-5 space-y-5">
                  {user.projects
                    .filter((p) => isMe || p.visibility === "community")
                    .map((project) => {
                      const stage = getStage(project.stage);
                      return (
                        <Link
                          key={project.id}
                          href={`/create/projects/${project.id}`}
                          className="group block rounded-xl border border-line p-6 transition-colors hover:border-line-bright"
                        >
                          <div className="flex items-center gap-3">
                            <span className="label !text-gold">
                              {project.genre}
                            </span>
                            {stage && (
                              <span className="text-xs text-faint">
                                Stage {stage.index} of 10 · {stage.label}
                              </span>
                            )}
                          </div>
                          <p className="mt-3 font-display text-3xl leading-tight transition-colors group-hover:text-gold">
                            {project.title}
                          </p>
                          {project.logline && (
                            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
                              {project.logline}
                            </p>
                          )}
                        </Link>
                      );
                    })}
                </div>
              </section>
            )}

            <section>
              {/* The corridor is their best films; the grid is everything.
                  Two headings rather than one, because they are answering two
                  different questions. */}
              <h2 className="label border-b border-line pb-3">
                {user.displayName}&rsquo;s Top{" "}
                {Math.min(30, user.ratings.length)}
              </h2>
              {user.ratings.length === 0 ? (
                <p className="mt-5 text-sm text-muted">Nothing rated yet.</p>
              ) : (
                <>
                  <div className="mt-7">
                    {/* Their highest-rated films, best first, capped at 30.
                        The count that used to sit over the vanishing point is
                        gone: it landed exactly where the cards converge, and
                        the section heading above already says it. */}
                    <WatchedCorridor
                      films={[...user.ratings]
                        .sort((a, b) => b.overall - a.overall)
                        .filter((r) => !!r.film.posterUrl)
                        .slice(0, 30)
                        .map((r) => ({
                          src: r.film.posterUrl!,
                          href: `/films/${r.film.slug}`,
                          title: `${r.film.title} · ${r.overall.toFixed(1)}`,
                        }))}
                    />
                  </div>
                  <h2 className="label mt-14 border-b border-line pb-3">
                    {user.displayName}&rsquo;s Seen · {user.ratings.length}
                  </h2>
                  <div className="mt-7">
                    {/* Their own score, not the crowd's — this is their record. */}
                    <FilmGrid
                      films={user.ratings.map((r) => toSummary(r.film))}
                      scores={
                        new Map(user.ratings.map((r) => [r.film.id, r.overall]))
                      }
                    />
                  </div>
                </>
              )}
            </section>

            {user.reviews.length > 0 && (
              <section className="mt-14">
                <h2 className="label border-b border-line pb-3">
                  Reviews · {user.reviews.length}
                </h2>
                <div className="mt-5 space-y-8">
                  {user.reviews.map((review) => (
                    <article
                      key={review.id}
                      className="border-b border-line pb-8 last:border-0"
                    >
                      <div className="flex items-baseline gap-3">
                        <Link
                          href={`/films/${review.film.slug}`}
                          className="font-display text-2xl transition-colors hover:text-gold"
                        >
                          {review.film.title}
                        </Link>
                        <span className="text-xs text-faint">
                          {review.film.year}
                        </span>
                        <span className="ml-auto text-xs text-faint">
                          {formatDate(review.createdAt)}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-muted">
                        {review.body}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {user.watchlist.length > 0 && (
              <section className="mt-14">
                <h2 className="label border-b border-line pb-3">
                  Watchlist · {user.watchlist.length}
                </h2>
                <div className="mt-7">
                  <FilmGrid
                    films={user.watchlist.map((w) => toSummary(w.film))}
                  />
                </div>
              </section>
            )}
          </div>

          <aside data-profile-aside className="space-y-8">
            {reading && (
              <ArchetypeCard
                reading={reading}
                href={`/community/types/${reading.archetype.key}`}
              />
            )}

            <div className="rounded-xl border border-line p-6">
              <p className="label">Taste DNA</p>
              {stats.watched === 0 ? (
                <p className="mt-4 text-sm text-muted">
                  Rate a few films and this fills in.
                </p>
              ) : (
                <>
                  <div className="mt-5">
                    <TasteDna scores={axisAverages} className="w-full" />
                  </div>
                  {stats.lean && (
                    <p className="mt-5 border-t border-line pt-4 text-sm leading-relaxed text-muted">
                      Rewards{" "}
                      <span className="text-gold">{stats.lean.label}</span> most
                      — {stats.lean.lean.toFixed(1)} above their own average
                      across the other axes.
                    </p>
                  )}
                </>
              )}
            </div>

            {user.lists.length > 0 && (
              <div className="rounded-xl border border-line p-6">
                <p className="label">Lists</p>
                <ul className="mt-4 space-y-3">
                  {user.lists.map((list) => (
                    <li key={list.id}>
                      <Link
                        href={`/lists/${list.slug}`}
                        className="text-sm text-muted transition-colors hover:text-paper"
                      >
                        {list.title}
                        <span className="ml-2 text-faint">
                          {list._count.entries}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {user.ratings.length > 0 && (
              <div className="rounded-xl border border-line p-6">
                <p className="label">Latest ratings</p>
                <ul className="mt-4 space-y-3">
                  {user.ratings.slice(0, 8).map((rating) => (
                    <li key={rating.id} className="flex items-center gap-3">
                      <Link
                        href={`/films/${rating.film.slug}`}
                        className="min-w-0 flex-1 truncate text-sm text-muted transition-colors hover:text-paper"
                      >
                        {rating.film.title}
                      </Link>
                      <AxisSpark scores={rating} />
                      <span className="font-sans text-xs text-gold tabular-nums">
                        {rating.overall.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </Container>

      {era && (
        <section className="border-t border-line py-16">
          <Container>
            <CinemaEra era={era} />
          </Container>
        </section>
      )}

      {atlas.countries.length > 0 && (
        <section className="border-t border-line py-16">
          <Container>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="label">Cinema without borders</p>
                <h2 className="mt-4 max-w-2xl font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
                  {user.displayName} has watched cinema from{" "}
                  <span className="text-gold">{atlas.total}</span>{" "}
                  {atlas.total === 1 ? "country" : "countries"}
                </h2>
              </div>
            </div>
            <div className="mt-10">
              <FilmAtlas
                countries={atlas.countries}
                unplaced={atlas.filmsUnplaced}
              />
            </div>
          </Container>
        </section>
      )}

      {neighbours.length > 0 && (
        <section className="border-t border-line py-16">
          <Container>
            <p className="label">Taste neighbours</p>
            <h2 className="mt-4 max-w-2xl font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              People who watch like {user.displayName}
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted">
              Not who rated the same films the same way — who rewards the same
              things, reaches for the same genres, and lives in the same decades
              and countries of cinema.
            </p>

            <RevealGroup selector="[data-neighbours]" />
            <ul
              data-neighbours
              className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {neighbours.map((n) => (
                <li key={n.username}>
                  <Link
                    href={`/community/${n.username}`}
                    className="group block h-full rounded-xl border border-line p-6 transition-colors hover:border-faint"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-display text-2xl leading-tight transition-colors group-hover:text-gold">
                        {n.displayName}
                      </p>
                      <span className="font-sans text-sm text-gold tabular-nums">
                        {n.overlap}%
                      </span>
                    </div>
                    <p className="label mt-1">@{n.username}</p>

                    {/* A percentage alone is a number to argue with; the
                        reason is what makes it worth acting on. */}
                    {n.because.length > 0 && (
                      <p className="mt-4 text-sm leading-relaxed text-muted">
                        You {n.because.join(" and ")}.
                      </p>
                    )}

                    <p className="mt-4 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint">
                      {n.watched} rated{n.location && ` · ${n.location}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </section>
      )}
    </>
  );
}

/**
 * `count` animates; `value` is printed as given. Numbers earn the count-up,
 * a director's name would just look broken mid-flight.
 */
function Stat({
  label,
  value,
  count,
  decimals = 0,
  wide = false,
}: {
  label: string;
  value?: string;
  count?: number | null;
  decimals?: number;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-1" : ""}>
      <dt className="label">{label}</dt>
      <dd
        className={`mt-1.5 tabular-nums ${
          wide ? "text-sm text-paper" : "font-display text-3xl leading-none"
        }`}
      >
        {count === null || count === undefined ? (
          (value ?? "—")
        ) : (
          <CountUp value={count} decimals={decimals} />
        )}
      </dd>
    </div>
  );
}
