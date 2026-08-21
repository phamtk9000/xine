import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { IndexList } from "@/components/index-list";
import { FilmGrid } from "@/components/film-card";
import { FilmMarquee } from "@/components/film-marquee";
import { MastheadBackdrop } from "@/components/masthead-backdrop";
import { RevealGroup } from "@/components/reveal-group";
import { TitleSequence } from "@/components/title-sequence";
import { Poster } from "@/components/poster";
import {
  ButtonLink,
  Container,
  SectionHeading,
  relativeTime,
} from "@/components/ui";
import { listFilms } from "@/lib/films";
import { listArticles } from "@/lib/journal";
import { recentActivity } from "@/lib/profile";
import { AXES } from "@/lib/scores";
import { STAGES } from "@/lib/stages";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/serialize";

export default async function HomePage() {
  const [articles, trending, newest, lists, activity] = await Promise.all([
    listArticles(),
    listFilms({ sort: "trending", take: 8 }),
    listFilms({ sort: "new", take: 16 }),
    db.filmList.findMany({
      where: { editorial: true },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: {
        entries: {
          orderBy: { position: "asc" },
          take: 4,
          include: {
            film: {
              select: {
                slug: true,
                title: true,
                year: true,
                director: true,
                posterUrl: true,
              },
            },
          },
        },
        _count: { select: { entries: true } },
      },
    }),
    recentActivity(8),
  ]);

  // Same rule as /journal: the big card wants an article that has artwork.
  const leadIndex = Math.max(
    articles.findIndex((a) => a.featured),
    0,
  );
  const lead = articles[leadIndex];
  const more = articles.filter((_, i) => i !== leadIndex);

  // The title sequence cuts through real posters from the catalogue rather
  // than stock art, so it is the site introducing itself with its own stock.
  const titleFrames = trending
    .map((film) => film.posterUrl)
    .filter((url): url is string => Boolean(url))
    .slice(0, 12);

  return (
    <>
      <TitleSequence posters={titleFrames} />

      {/* Masthead */}
      <section className="relative overflow-hidden border-b border-line">
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

      {/* Trending */}
      <section className="border-b border-line">
        <Container className="py-14">
          <SectionHeading
            label="Films"
            title="Trending this week"
            href="/films"
            hrefLabel="The catalogue"
          />
          <FilmGrid id="trending-grid" films={trending} />
          {/* Slower and more deliberate than the other grids' default — eight
              posters revealing one at a time reads as a considered lineup,
              not a wall arriving all at once. */}
          <RevealGroup selector="#trending-grid" stagger={120} />
        </Container>
      </section>

      {/* The rating system — the site's one deliberate break from a single
          dark palette, the same beat the reference uses to stop a long
          black scroll from numbing out. */}
      <section className="section-light border-b border-line bg-ink-sunk">
        <Container className="py-16">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="label">The rating system</p>
              <h2 className="mt-5 font-display text-4xl leading-[0.98] tracking-tight sm:text-6xl">
                Five stars tells you almost nothing.
              </h2>
              <p className="mt-6 max-w-lg text-base leading-relaxed text-muted">
                Two people give the same film four stars and mean completely
                different things. One was floored by the images. One thought the
                script was airtight. xine records both, on six axes, and the one
                that matters most turns out to be the difference between them.
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

            <div className="rounded-xl border border-line bg-ink p-8">
              <div className="flex items-baseline justify-between border-b border-line pb-5">
                <div>
                  <p className="label">Sample film</p>
                  <p className="mt-1.5 font-display text-3xl leading-none">
                    Overall
                  </p>
                </div>
                <p className="font-display text-6xl leading-none text-gold tabular-nums">
                  8.6
                </p>
              </div>
              <dl className="mt-6 space-y-4">
                {[
                  ["Story", 8.2],
                  ["Direction", 9.1],
                  ["Visual", 9.5],
                  ["Performance", 8.4],
                  ["Sound", 9.0],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-4"
                  >
                    <dt className="text-sm text-muted">{label}</dt>
                    <dd className="h-px bg-line">
                      <div
                        className="h-px bg-gold"
                        style={{ width: `${(Number(value) / 10) * 100}%` }}
                      />
                    </dd>
                    <dd className="text-right font-sans text-xs text-paper tabular-nums">
                      {Number(value).toFixed(1)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-7 border-t border-line pt-5 text-xs leading-relaxed text-faint">
                {AXES.length} axes, one number each, 0–10. Your profile then
                shows which one you reward most — and that is your taste, stated
                as data.
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* Editorial lists */}
      <section className="border-b border-line">
        <Container className="py-14">
          <SectionHeading
            label="Lists"
            title="Grouped by an argument"
            href="/lists"
          />
          <div id="lists-grid" className="grid gap-10 md:grid-cols-3">
            {lists.map((list) => (
              <Link
                key={list.id}
                href={`/lists/${list.slug}`}
                className="group"
              >
                <div className="flex gap-2">
                  {list.entries.map((entry) => (
                    <div key={entry.id} className="w-1/4">
                      <Poster film={entry.film} sizes="120px" />
                    </div>
                  ))}
                </div>
                <p className="label mt-5">{list._count.entries} films</p>
                <h3 className="mt-2 font-display text-2xl leading-tight transition-colors group-hover:text-gold">
                  {list.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {list.description}
                </p>
              </Link>
            ))}
          </div>
          <RevealGroup selector="#lists-grid" stagger={90} />
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
