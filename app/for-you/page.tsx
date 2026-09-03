import Link from "next/link";
import type { Metadata } from "next";
import { Poster } from "@/components/poster";
import { QuickRate } from "@/components/quick-rate";
import { ButtonLink, Container, EmptyState, PageHeader } from "@/components/ui";
import { InterestButtons } from "@/components/interest-buttons";
import { Poster as PosterArt } from "@/components/poster";
import { editorialPicks, keptFilms, recommendFor, tuningCount } from "@/lib/recommend";
import { readingFor } from "@/lib/archetype-members";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "For you",
  description:
    "Films chosen from what you have already rated, and the editorial lists that connect them.",
};

/**
 * The recommendations page.
 *
 * Every row states why it is there, and the reason is a fact rather than a
 * sentence somebody generated: the film shares an editorial list with
 * something you rated highly, or shares a director with it. That is a
 * deliberate limit. A recommender that cannot explain itself is asking to be
 * trusted; this one hands over its reasoning and lets the reader disagree
 * with it — which is the same argument the rating system makes about scores.
 *
 * Nobody with fewer than a handful of ratings gets invented taste. They get
 * the films this site has actually written about, and an honest line saying
 * the page improves as they rate.
 */

export default async function ForYouPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Container className="py-20">
        <div className="mx-auto max-w-lg">
          <EmptyState
            title="Rate a few films first"
            body="This page reads what you have already rated and follows the editorial lists outward from it. Sign in and rate three or four things you love — it starts working immediately."
            action={<ButtonLink href="/sign-in">Sign in</ButtonLink>}
          />
        </div>
      </Container>
    );
  }

  const [recommendations, reading, rated, kept, tuned] = await Promise.all([
    recommendFor(user.id, { take: 18 }),
    readingFor(user.username),
    db.rating.count({ where: { userId: user.id } }),
    keptFilms(user.id),
    tuningCount(user.id),
  ]);

  const cold = recommendations.length === 0;
  const films = cold ? await editorialPicks(12) : recommendations;

  // Their own ratings for the scales under each card — one query, not one
  // per film.
  const mine = new Map(
    (
      await db.rating.findMany({
        where: { userId: user.id, filmId: { in: films.map((f) => f.id) } },
        select: { filmId: true, overall: true },
      })
    ).map((row) => [row.filmId, row.overall]),
  );

  return (
    <>
      <PageHeader
        label="For you"
        title={cold ? "Start here." : "Because of what you rate."}
        lede={
          cold
            ? "Nothing to read from yet — these are the films xine has written about. Rate three or four you have seen and this page rebuilds itself around them."
            : "Films connected to the ones you rate highest, through the lists that argue they belong together. Every row says which film it followed and which argument connected them."
        }
        action={
          <p className="readout shrink-0 text-xs text-faint">
            {rated} ratings
            {tuned > 0 ? ` · ${tuned} tuned` : ""}
            {reading ? ` · ${reading.archetype.name}` : ""}
          </p>
        }
      />

      <Container className="py-14">
        {kept.length > 0 && (
          <div className="mb-14 border-b border-line pb-12">
            <p className="label">Kept</p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Suggestions you said yes to. They are out of the rotation below,
              and everything they have in common is pulling on what appears
              there.
            </p>
            <ul className="mt-6 flex gap-4 overflow-x-auto pb-2">
              {kept.map((film) => (
                <li key={film.id} className="w-24 shrink-0 sm:w-28">
                  <Link href={`/films/${film.slug}`} className="group block">
                    <PosterArt film={film} sizes="120px" />
                    <p className="mt-2 truncate text-xs text-muted transition-colors group-hover:text-gold">
                      {film.title}
                    </p>
                  </Link>
                  <InterestButtons filmId={film.id} mine="yes" className="mt-2" />
                </li>
              ))}
            </ul>
          </div>
        )}

        <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {films.map((film) => (
            <li key={film.id} className="flex gap-5">
              <Link
                href={`/films/${film.slug}`}
                className="group w-24 shrink-0 sm:w-28"
              >
                <Poster film={film} sizes="120px" />
              </Link>

              <div className="min-w-0 flex-1">
                <Link href={`/films/${film.slug}`} className="group block">
                  <p className="font-display text-xl leading-tight transition-colors group-hover:text-gold">
                    {film.title}
                  </p>
                  <p className="mt-1 truncate text-xs text-faint">
                    {film.director} · {film.year}
                  </p>
                </Link>

                {/* The reason, which is the whole point of the page. */}
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {film.reason}
                </p>

                {/* Two controls, two different questions. The scale is for
                    a film they have seen; the thumbs are for one they have
                    not, which is every film on this page until it isn't. */}
                <div className="mt-3">
                  <QuickRate
                    filmId={film.id}
                    slug={film.slug}
                    mine={mine.get(film.id) ?? null}
                    signedIn
                  />
                </div>

                <InterestButtons filmId={film.id} mine={null} className="mt-3" />
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-16 max-w-2xl border-t border-line pt-6 text-xs leading-relaxed text-faint">
          No model is involved. These come from the editorial lists — seventy-two
          arguments about what belongs next to what — read outward from the films
          you rate highest and the suggestions you keep, with directors and
          genres filling in behind. Rate something, keep something, or say no
          to something, and the page changes.{" "}
          <Link
            href="/films/find"
            className="text-gold underline underline-offset-4"
          >
            Describe a mood instead
          </Link>{" "}
          if you want the programmer rather than the shelf.
        </p>
      </Container>
    </>
  );
}
