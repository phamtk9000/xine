import Link from "next/link";
import { Poster } from "@/components/poster";
import { ScorePill } from "@/components/score";
import { SealMark } from "@/components/seal";
import type { FilmSummary } from "@/lib/films";

export function FilmCard({
  film,
  priority = false,
  showScore = true,
  score: override,
}: {
  film: FilmSummary;
  priority?: boolean;
  showScore?: boolean;
  /** Overrides the displayed number — used on profiles to show *their* rating. */
  score?: number | null;
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
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm leading-snug font-medium group-hover:text-gold">
            {film.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-faint">
            {film.director} · {film.year}
          </p>
        </div>
        {showScore &&
          (sealed ? (
            <SealMark score={film.criticScore!} />
          ) : (
            <ScorePill value={score} />
          ))}
      </div>
    </Link>
  );
}

export function FilmGrid({
  films,
  priorityCount = 0,
  scores,
  id,
}: {
  films: FilmSummary[];
  priorityCount?: number;
  /** Optional per-film score override, keyed by film id. */
  scores?: Map<string, number>;
  /** Lets a page target this grid from a sibling, e.g. RevealGroup. */
  id?: string;
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
}: {
  film: FilmSummary;
  position?: number;
  note?: string | null;
}) {
  return (
    <Link
      href={`/films/${film.slug}`}
      className="group flex gap-5 border-b border-line py-5 last:border-0"
    >
      {position !== undefined && (
        <span className="w-8 shrink-0 pt-1 font-mono text-xs text-faint tabular-nums">
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
        {note && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            {note}
          </p>
        )}
      </div>
      <div className="shrink-0 pt-1 text-right">
        {film.reviewed && film.criticScore !== null ? (
          <SealMark score={film.criticScore} />
        ) : (
          <ScorePill value={film.communityScore ?? film.criticScore} />
        )}
      </div>
    </Link>
  );
}
