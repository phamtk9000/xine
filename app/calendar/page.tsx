import Link from "next/link";
import type { Metadata } from "next";
import { PosterThumb } from "@/components/poster";
import { Container, PageHeader } from "@/components/ui";
import {
  upcomingByMonth,
  upcomingCounts,
  watchlistLanding,
  type CalendarEntry,
  type CalendarKind,
} from "@/lib/upcoming";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Calendar",
  description:
    "What is coming: films and series with a date, month by month, as far ahead as anyone has announced.",
};

/**
 * The release calendar.
 *
 * Laid out as a schedule rather than a grid of cards: a month heading, then
 * one row per title with the date set as a readout on the left. The date is
 * the reason anybody is on this page, so it gets the leftmost column and the
 * only mono type on the row — everything else is there to tell you whether
 * the date is worth remembering.
 *
 * Runtime is shown when TMDB has locked it and left blank when it has not,
 * which is a real signal this far out: a film with a runtime is finished.
 */

type ChipKey = CalendarKind | "saved";

const KINDS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "film", label: "Films" },
  { key: "series", label: "Series" },
];

function isKind(value: string | undefined): value is CalendarKind {
  return value === "film" || value === "series" || value === "all";
}

export default async function CalendarPage({
  searchParams,
}: PageProps<"/calendar">) {
  const params = await searchParams;
  const raw = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const savedOnly = raw === "saved";
  const kind: CalendarKind = isKind(raw) ? raw : "all";

  const viewer = await getCurrentUser();
  const [months, counts, landing] = await Promise.all([
    upcomingByMonth(savedOnly ? "all" : kind, {
      viewerId: viewer?.id,
      savedOnly,
    }),
    upcomingCounts(viewer?.id),
    viewer ? watchlistLanding(viewer.id) : Promise.resolve(null),
  ]);

  const total = months.reduce((sum, month) => sum + month.entries.length, 0);
  const last = months.at(-1);

  // The watchlist chip only exists for somebody who has one — for everyone
  // else it would be a filter that can only ever return nothing.
  const chips: { key: ChipKey; label: string }[] =
    viewer && counts.saved > 0
      ? [...KINDS, { key: "saved", label: "On your watchlist" }]
      : KINDS;

  return (
    <>
      <PageHeader
        label="Calendar"
        title="What is coming."
        lede="Films and series with a date on them, month by month, as far ahead as anyone has announced. Dates move — this reads them from TMDB every day and says what it currently knows."
        action={
          <p className="readout shrink-0 text-xs text-faint">
            {total} titles
            {last ? ` · through ${last.label}` : ""}
          </p>
        }
      />

      <Container className="py-10">
        {/* The one line worth putting in front of somebody with a watchlist.
            Two features that existed separately and never spoke: the list of
            what you mean to see, and the dates things arrive on. */}
        {landing && landing.length > 0 && (
          <div className="ticked mb-10 border border-line-bright bg-ink-raised p-6">
            <p className="label">
              From your watchlist, this month
              <span className="readout ml-3 text-faint">
                {String(landing.length).padStart(2, "0")}
              </span>
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              {landing.map((item) => (
                <li key={`${item.slug}-${item.date.toISOString()}`}>
                  <Link
                    href={`/films/${item.slug}`}
                    className="text-sm transition-colors hover:text-gold"
                  >
                    {item.title}
                    {item.season ? ` · S${item.season}` : ""}
                  </Link>
                  <span className="readout ml-2 text-xs text-faint">
                    {item.date.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filter rail. Counts sit in the chips so a filter that would empty
            the page announces that before it is clicked. */}
        <div
          className="flex flex-wrap items-center gap-2 border-b border-line pb-6"
          role="group"
          aria-label="Filter by kind"
        >
          {chips.map((option) => {
            const on = savedOnly
              ? option.key === "saved"
              : option.key === kind && !savedOnly;
            return (
              <Link
                key={option.key}
                href={
                  option.key === "all" ? "/calendar" : `/calendar?kind=${option.key}`
                }
                aria-current={on ? "true" : undefined}
                className={`rounded-[3px] border px-4 py-2 font-sans text-[0.6875rem] uppercase tracking-[0.14em] transition-colors ${
                  on
                    ? "border-line-bright bg-ink-raised text-paper"
                    : "border-line text-muted hover:border-line-bright hover:text-paper"
                }`}
              >
                {option.label}
                <span className="readout ml-2 text-faint">
                  {counts[option.key]}
                </span>
              </Link>
            );
          })}
        </div>

        {months.length === 0 && (
          <p className="py-16 text-sm text-muted">
            Nothing announced in the window. Run{" "}
            <code className="readout text-xs text-paper">
              npm run films:upcoming
            </code>{" "}
            to pull the schedule from TMDB.
          </p>
        )}

        {months.map((month) => (
          <section key={month.label} className="pt-12">
            {/* The month, as a rule with the label sitting on it. */}
            <div className="flex items-baseline gap-4 border-b border-line-bright pb-3">
              <h2 className="font-display text-3xl leading-none sm:text-4xl">
                {month.label}
              </h2>
              <span className="readout text-xs text-faint">
                {String(month.entries.length).padStart(2, "0")}
              </span>
            </div>

            <ul>
              {month.entries.map((entry) => (
                <CalendarRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </Container>
    </>
  );
}

function CalendarRow({ entry }: { entry: CalendarEntry }) {
  const day = entry.date.toLocaleDateString("en-GB", {
    day: "2-digit",
    timeZone: "UTC",
  });
  const weekday = entry.date.toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });

  return (
    <li className="border-b border-line">
      <Link
        href={`/films/${entry.slug}`}
        className="group grid grid-cols-[3.5rem_2.5rem_1fr] items-center gap-4 py-4 sm:grid-cols-[5rem_3rem_1fr_auto] sm:gap-6"
      >
        <span className="readout leading-tight">
          <span className="block text-lg text-paper">{day}</span>
          <span className="block text-[0.625rem] uppercase text-faint">
            {weekday}
          </span>
        </span>

        <PosterThumb film={entry} className="w-full" />

        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="truncate text-[0.9375rem] transition-colors group-hover:text-gold">
              {entry.title}
            </span>
            <span className="label !text-[0.5625rem]">
              {entry.season
                ? `Season ${entry.season}`
                : entry.kind === "series"
                  ? "New series"
                  : "Film"}
            </span>
            {entry.saved && (
              <span
                className="label !text-[0.5625rem] !text-gold"
                title="On your watchlist"
              >
                Saved
              </span>
            )}
          </span>
          <span className="mt-1 block truncate text-xs text-faint">
            {entry.director !== "Unknown" ? entry.director : "Crew unannounced"}
            {entry.genres.length > 0 && ` · ${entry.genres.slice(0, 2).join(", ")}`}
          </span>
        </span>

        {/* A locked runtime means the picture is finished; blank means it is
            not, and that is worth knowing this far out. */}
        <span className="readout hidden text-xs text-faint sm:block">
          {entry.season
            ? `S${String(entry.season).padStart(2, "0")}`
            : entry.kind === "series"
              ? entry.seasons
                ? `${entry.seasons} season${entry.seasons === 1 ? "" : "s"}`
                : "New series"
              : entry.runtime
                ? `${entry.runtime} min`
                : "—"}
        </span>
      </Link>
    </li>
  );
}
