import type { ReactNode } from "react";
import Link from "next/link";
import { QuickRate } from "@/components/quick-rate";
import { Poster } from "@/components/poster";
import { ScorePill } from "@/components/score";
import { SealMark } from "@/components/seal";
import type { FilmSummary } from "@/lib/films";

/**
 * Who is looking, and what they have already said about this film.
 *
 * Passed down rather than read inside the card, because a grid renders sixty
 * of these and sixty session lookups is sixty round trips — the page fetches
 * the viewer once and hands every card the same answer.
 */
export type Viewer = {
  signedIn: boolean;
  /** Their own ratings, keyed by film id. */
  ratings?: Map<string, number>;
};

export function FilmCard({
  film,
  priority = false,
  showScore = true,
  score: override,
  viewer,
}: {
  film: FilmSummary;
  priority?: boolean;
  showScore?: boolean;
  /** Overrides the displayed number — used on profiles to show *their* rating. */
  score?: number | null;
  /** Present on surfaces that let you rate in place. */
  viewer?: Viewer;
}) {
  const score = override ?? film.communityScore ?? film.criticScore;

  // The seal is XINE's own editorial verdict, so a caller-supplied override
  // (a specific user's rating, on a profile) always falls back to the plain
  // number rather than borrowing a crest that isn't theirs.
  const sealed =
    override === undefined && film.reviewed && film.criticScore !== null;

  return (
    <Link href={`/films/${film.slug}`} className="group block">
      <Poster film={film} priority={priority} />
      {/* The title gets the full width of the card and two lines of it.
          Sharing one line with the score meant the score always won: a
          six-across grid left about 110px for the title, so the catalogue
          was reading "In the Mood …", "There Will B…", "Blade Runne…" —
          truncating the one thing a poster grid exists to tell you. The
          score moves down to the metadata line, where a clipped director
          costs far less. */}
      <div className="mt-3">
        {/* Two lines are reserved whether or not the title needs them, so
            every card in a row puts its metadata on the same baseline. */}
        <p className="line-clamp-2 min-h-[2.4rem] text-sm leading-snug font-medium group-hover:text-gold">
          {film.title}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-faint">
            {film.director} · {film.year}
          </p>
          {showScore &&
            (sealed ? (
              <SealMark
                score={film.criticScore!}
                reviewCount={film.reviewCount}
              />
            ) : (
              <ScorePill value={score} />
            ))}
        </div>

        {viewer && (
          <div className="mt-2 min-h-[1.5rem]">
            <QuickRate
              filmId={film.id}
              slug={film.slug}
              mine={viewer.ratings?.get(film.id) ?? null}
              signedIn={viewer.signedIn}
            />
          </div>
        )}
      </div>
    </Link>
  );
}

export function FilmGrid({
  films,
  priorityCount = 0,
  scores,
  id,
  viewer,
}: {
  films: FilmSummary[];
  priorityCount?: number;
  /** Optional per-film score override, keyed by film id. */
  scores?: Map<string, number>;
  /** Lets a page target this grid from a sibling, e.g. RevealGroup. */
  id?: string;
  /** Set to put a one-tap rating scale under every card. */
  viewer?: Viewer;
}) {
  return (
    <div
      id={id}
      className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
    >
      {films.map((film, i) => (
        <FilmCard
          key={film.id}
          film={film}
          priority={i < priorityCount}
          score={scores?.get(film.id)}
          viewer={viewer}
        />
      ))}
    </div>
  );
}

/** Horizontal row used inside lists and profiles, where rank matters. */
export function FilmRow({
  film,
  position,
  note,
  noteSlot,
  viewer,
}: {
  film: FilmSummary;
  position?: number;
  note?: string | null;
  /** Replaces the static note — the list owner gets an editable one. */
  noteSlot?: ReactNode;
  viewer?: Viewer;
}) {
  return (
    <Link
      href={`/films/${film.slug}`}
      className="group flex gap-5 border-b border-line py-5 last:border-0"
    >
      {position !== undefined && (
        <span className="w-8 shrink-0 pt-1 font-sans text-xs text-faint tabular-nums">
          {String(position).padStart(2, "0")}
        </span>
      )}
      <div className="w-16 shrink-0 sm:w-20">
        <Poster film={film} sizes="80px" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-display text-2xl leading-tight group-hover:text-gold">
          {film.title}
        </p>
        <p className="mt-1 text-xs text-faint">
          {film.director} · {film.year}
          {film.country ? ` · ${film.country}` : ""}
        </p>
        {noteSlot ??
          (note && (
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              {note}
            </p>
          ))}
        {viewer && (
          <div className="mt-3">
            <QuickRate
              filmId={film.id}
              slug={film.slug}
              mine={viewer.ratings?.get(film.id) ?? null}
              signedIn={viewer.signedIn}
            />
          </div>
        )}
      </div>
      <div className="shrink-0 pt-1 text-right">
        {film.reviewed && film.criticScore !== null ? (
          <SealMark score={film.criticScore} reviewCount={film.reviewCount} />
        ) : (
          <ScorePill value={film.communityScore ?? film.criticScore} />
        )}
      </div>
    </Link>
  );
}
