import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { IndexList } from "@/components/index-list";
import { FilmMarquee } from "@/components/film-marquee";
import { TrendingCoverflow } from "@/components/trending-coverflow";
import { RatingSplit } from "@/components/rating-split";
import { MastheadBackdrop } from "@/components/masthead-backdrop";
import { ImageShade } from "@/components/image-shade";
import { RevealGroup } from "@/components/reveal-group";
import { TitleSequence } from "@/components/title-sequence";
import { VerdictBand } from "@/components/verdict-band";
import {
  CatalogueNumbers,
  CatalogueNumbersFooter,
} from "@/components/catalogue-numbers";
import {
  ButtonLink,
  Container,
  SectionHeading,
  relativeTime,
} from "@/components/ui";
import { catalogueStats, listFilms } from "@/lib/films";
import { weeklyTrending } from "@/lib/trending";
import { listArticles } from "@/lib/journal";
import { recentActivity } from "@/lib/profile";
import { STAGES } from "@/lib/stages";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/serialize";
import { SHELVES } from "@/lib/collections";

export default async function HomePage() {
  const [articles, trending, newest, shelfLists, stats, activity] =
    await Promise.all([
      listArticles(),
      // What the world is watching this week, per TMDB, resolved against the
      // catalogue and split by whether it is out yet — see lib/trending.
      weeklyTrending({ take: 10, comingTake: 5 }),
      listFilms({ sort: "new", take: 16 }),
      // Every shelf, counted. No posters: the lists index below is type only.
      db.filmList.findMany({
        where: { collection: { not: null } },
        orderBy: [{ collection: "asc" }, { position: "asc" }],
        select: {
          id: true,
          collection: true,
          _count: { select: { entries: true } },
        },
      }),
      catalogueStats(),
      recentActivity(8),
    ]);

  // The ten shelves with their weight, in house order.
  const shelves = SHELVES.map((shelf) => {
    const mine = shelfLists.filter((list) => list.collection === shelf.slug);
    return {
      ...shelf,
      lists: mine.length,
      films: mine.reduce((sum, list) => sum + list._count.entries, 0),
    };
  }).filter((shelf) => shelf.lists > 0);

  // Same rule as /journal: the big card wants an article that has artwork.
  const leadIndex = Math.max(
    articles.findIndex((a) => a.featured),
    0,
  );
  const lead = articles[leadIndex];
  const more = articles.filter((_, i) => i !== leadIndex);

  // The change-of-gear band below the journal block wants a piece with
  // artwork that the reader is not already looking at: not the lead card,
  // and preferably not one of the five in the index under it either. A
  // Review is the first choice, because the band states a verdict.
  const spare = more.slice(5);
  const bandArticle =
    spare.find((a) => a.hero && a.kicker === "Review") ??
    spare.find((a) => a.hero) ??
    more.find((a) => a.hero && a.kicker === "Review") ??
    more.find((a) => a.hero) ??
    null;

  const bandFilm =
    bandArticle?.films[0] !== undefined
      ? await db.film.findUnique({
          where: { slug: bandArticle.films[0] },
          select: {
            slug: true,
            title: true,
            year: true,
            criticScore: true,
            reviewed: true,
          },
        })
      : null;

  // How many Journal pieces reference that film — the seal reads it to tell
  // a XINE Select from a plain score. Counted from the articles already in
  // hand rather than with another pass over the filesystem.
  const bandReviewCount = bandFilm
    ? articles.filter((a) => a.films.includes(bandFilm.slug)).length
    : 0;

  // The title sequence cuts through real posters from the catalogue rather
  // than stock art, so it is the site introducing itself with its own stock.
  const titleFrames = trending.now
    .map((film) => film.posterUrl)
    .filter((url): url is string => Boolean(url))
    .slice(0, 12);

  return (
    <>
      <TitleSequence posters={titleFrames} />

      {/* Masthead */}
      <section className="relative overflow-hidden border-b border-line">
        {/* Whichever key art is up right now lights the whole page, and the
            sample is re-taken when the plate crossfades. */}
        <ImageShade selector=".masthead-plate.is-active" />
        <MastheadBackdrop
          images={[
            { src: "/hero.png", alt: "" },
            { src: "/hero2.png", alt: "" },
            { src: "/hero3.png", alt: "" },
            { src: "/hero5.png", alt: "" },
          ]}
        />
        <Container className="relative py-16 sm:py-24">
          <div className="masthead-copy">
            <p className="label">Cinema, rated and made</p>
            <h1 className="mt-6 max-w-5xl font-display text-[clamp(2.75rem,8vw,7rem)] leading-[0.9] tracking-tight">
              Read about films. Rate them properly. Then go and make one.
            </h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-muted">
              xine is a film magazine with a rating system that asks six
              questions instead of one, and a workspace that takes an idea from
              a single paragraph to a pitch package.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <ButtonLink href="/create/pitch">Pitch Your Film →</ButtonLink>
            <ButtonLink href="/films" variant="outline">
              Browse the catalogue
            </ButtonLink>
          </div>
        </Container>
      </section>

      {/* Lead article, then the rest of the week's writing as a dense,
          text-led index rather than another row of poster-sized cards. */}
      {lead && (
        <section className="border-b border-line">
          <Container className="py-14">
            <SectionHeading
              label="Journal"
              title="This week"
              href="/journal"
              hrefLabel="All writing"
            />
            <ArticleCard article={lead} size="lg" priority />
            {more.length > 0 && (
              <div className="mt-4">
                <IndexList id="this-week-list" articles={more.slice(0, 5)} />
                <RevealGroup selector="#this-week-list" stagger={90} />
              </div>
            )}
          </Container>
        </section>
      )}

      {/* The change of gear: one image, one sentence, one link. */}
      {bandArticle?.hero && (
        <VerdictBand
          article={{
            slug: bandArticle.slug,
            title: bandArticle.title,
            dek: bandArticle.dek,
            kicker: bandArticle.kicker,
            hero: bandArticle.hero,
            heroAlt: bandArticle.heroAlt,
          }}
          film={
            bandFilm ? { ...bandFilm, reviewCount: bandReviewCount } : null
          }
        />
      )}

      {/* Trending */}
      <section className="border-b border-line">
        <Container className="py-14">
          <SectionHeading
            label="Films"
            title="Trending this week"
            href="/films"
            hrefLabel="The catalogue"
          />
          <TrendingCoverflow films={trending.now} />

          {/* Trending, but not out yet. TMDB's feed mixes the two and the
              rake above promises something you can watch tonight, so the
              trailers get their own line instead of a poster each. */}
          {trending.coming.length > 0 && (
            <div className="mt-12 flex flex-wrap items-baseline gap-x-6 gap-y-3 border-t border-line pt-5">
              <Link
                href="/calendar"
                className="label shrink-0 transition-colors hover:text-paper"
              >
                Coming →
              </Link>
              <ul className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                {trending.coming.map((film) => (
                  <li key={film.id} className="text-sm">
                    <Link
                      href={`/films/${film.slug}`}
                      className="text-muted transition-colors hover:text-gold"
                    >
                      {film.title}
                    </Link>
                    <span className="ml-2 font-sans text-xs text-faint tabular-nums">
                      {film.releasedAt
                        ? film.releasedAt.toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : film.year}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Container>
      </section>

      {/* The catalogue, stated rather than shown — the page's one module
          with no artwork in it at all. */}
      <section className="shaded border-b border-line bg-ink-sunk">
        <Container className="py-16 sm:py-20">
          <SectionHeading
            label="The catalogue"
            title="What is in here"
            href="/films"
            hrefLabel="Browse it"
          />
          <CatalogueNumbers stats={stats} />
          <CatalogueNumbersFooter />
        </Container>
      </section>

      {/* The rating system — argued rather than described. The panel is a
          disagreement, not a readout; see components/rating-split.tsx. */}
      <section
        id="rating-system"
        className="shaded border-b border-line bg-ink-sunk"
      >
        <Container className="py-16 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[0.85fr_1.35fr] lg:gap-16">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="label">The rating system</p>
              <h2 className="mt-5 font-display text-4xl leading-[0.98] tracking-tight sm:text-6xl">
                Five stars tells you almost nothing.
              </h2>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">
                Two people give the same film four stars and mean completely
                different things. One was floored by the images. One thought the
                script was airtight. xine records both, on five axes plus the
                overall, and the one that matters most turns out to be the
                difference between them.
              </p>
              <p className="mt-5 max-w-lg text-sm leading-relaxed text-faint">
                The breakdown is optional. Rate overall in one tap and the rest
                stays out of your way — the numbers only get interesting when
                enough people volunteer them.
              </p>
              <ButtonLink href="/sign-up" variant="outline" className="mt-8">
                Start rating
              </ButtonLink>
            </div>

            <RatingSplit />
          </div>
        </Container>
      </section>

      {/* Editorial lists, as an index rather than three cards.
          Ten shelves fit here as type; three of them fit as posters, and
          the posters were the third row of artwork on this page. */}
      <section className="border-b border-line">
        <Container className="py-14">
          <SectionHeading
            label="Lists"
            title="Grouped by an argument"
            href="/lists"
            hrefLabel="All collections"
          />
          <ol
            id="lists-index"
            className="grid gap-x-12 border-t border-line md:grid-cols-2"
          >
            {shelves.map((shelf, i) => (
              <li key={shelf.slug} className="border-b border-line">
                <Link
                  href={`/collections/${shelf.slug}`}
                  className="group grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 py-5"
                >
                  <span className="font-sans text-[0.625rem] text-faint tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="font-display text-2xl leading-tight transition-colors group-hover:text-gold">
                        {shelf.name}
                      </span>
                      <span className="label shrink-0">
                        {shelf.lists} lists · {shelf.films} films
                      </span>
                    </span>
                    <span className="mt-1.5 block max-w-md text-sm leading-relaxed text-muted">
                      {shelf.blurb}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <RevealGroup selector="#lists-index" stagger={60} />
        </Container>
      </section>

      {/* Create */}
      <section className="relative border-b border-line overflow-hidden">
        <Container className="py-16 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <p className="label !text-gold">Create</p>
              <h2 className="mt-5 font-display text-4xl leading-[0.95] tracking-tight sm:text-6xl">
                Everyone reading this has an idea for a film.
              </h2>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">
                Almost none of them will ever write it down in a form anyone
                else can read. Create is ten stages that fix exactly that
                problem — idea, logline, synopsis, characters, structure, visual
                direction, trailer, deck, business plan, production.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <ButtonLink href="/create/pitch">Pitch Your Film →</ButtonLink>
                <ButtonLink href="/create/trailer" variant="outline">
                  Trailer Studio
                </ButtonLink>
              </div>
            </div>

            <ol id="stages-list" className="grid grid-cols-2 gap-x-8 gap-y-3">
              {STAGES.map((stage) => (
                <li
                  key={stage.key}
                  className="flex items-baseline gap-3 border-b border-line py-2.5"
                >
                  <span className="font-sans text-[0.625rem] text-faint tabular-nums">
                    {String(stage.index).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-muted">{stage.label}</span>
                </li>
              ))}
            </ol>
            <RevealGroup selector="#stages-list" stagger={35} />
          </div>
        </Container>
      </section>

      {/* New releases + activity */}
      <section>
        <Container className="py-14">
          <div className="grid gap-14 lg:grid-cols-[1fr_20rem]">
            <div className="min-w-0">
              <SectionHeading
                label="Films"
                title="New releases"
                href="/films?sort=new"
              />
              <FilmMarquee films={newest} />
            </div>

            <aside>
              <div className="flex items-baseline justify-between border-b border-line pb-4">
                <p className="label">Community</p>
                <Link href="/community" className="label hover:text-paper">
                  All →
                </Link>
              </div>
              <ul className="mt-5 space-y-4">
                {activity.map((item) => {
                  const payload = parseJson<{
                    overall?: number;
                    title?: string;
                  }>(item.payload, {});
                  return (
                    <li key={item.id} className="text-sm">
                      <Link
                        href={`/community/${item.user.username}`}
                        className="transition-colors hover:text-gold"
                      >
                        {item.user.displayName}
                      </Link>{" "}
                      <span className="text-muted">
                        {item.type === "rated" && "rated"}
                        {item.type === "reviewed" && "reviewed"}
                        {item.type === "watchlisted" && "saved"}
                        {item.type === "watched" && "watched"}
                        {item.type === "liked" && "liked"}
                        {item.type === "listed" && "published"}
                        {item.type === "pitched" && "started"}
                      </span>{" "}
                      {item.film ? (
                        <Link
                          href={`/films/${item.film.slug}`}
                          className="transition-colors hover:text-gold"
                        >
                          {item.film.title}
                        </Link>
                      ) : (
                        <span>{payload.title}</span>
                      )}
                      {payload.overall !== undefined && (
                        <span className="ml-2 font-sans text-xs text-gold tabular-nums">
                          {payload.overall.toFixed(1)}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs text-faint">
                        {relativeTime(item.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
