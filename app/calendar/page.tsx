import Link from "next/link";
import type { Metadata } from "next";
import { PosterThumb } from "@/components/poster";
import { Container, PageHeader } from "@/components/ui";
import {
  monthEntries,
  monthTotals,
  upcomingCounts,
  watchlistLanding,
  type CalendarEntry,
  type CalendarKind,
} from "@/lib/upcoming";
import { isMonthKey, monthKey, monthRange, shiftMonth } from "@/lib/month";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Calendar",
  description:
    "What is coming: films and series with a date, a month at a time, as far ahead as anyone has announced.",
};

/**
 * The release calendar, as an actual calendar.
 *
 * It began as a year-long schedule — every month stacked, every title a row —
 * which is honest and hard to follow: a reader asking "what is out this
 * weekend" had to parse a hundred and thirty rows to find the two that
 * answered them. A grid answers that by shape. Weeks are lines, days are
 * cells, a busy Friday is visibly busy, and an empty week is visibly empty,
 * which is information the list could only convey by absence.
 *
 * One month at a time, because twelve grids stacked is the same wall of rows
 * with more scrolling. Stepping is by arrow, and each arrow carries the count
 * of what is behind it so nobody walks into an empty month.
 *
 * The list did not deserve to be thrown away, and a seven-column grid at
 * 375px is unusable — so it survives underneath as the phone layout, and as
 * a deliberate choice at any width through the view toggle.
 */

type ChipKey = CalendarKind | "saved";

const KINDS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "film", label: "Films" },
  { key: "series", label: "Series" },
];

/** Monday-first. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** How many chips fit in a cell before it starts saying "+3 more". */
const CHIPS_PER_DAY = 3;

function isKind(value: string | undefined): value is CalendarKind {
  return value === "film" || value === "series" || value === "all";
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CalendarPage({
  searchParams,
}: PageProps<"/calendar">) {
  const params = await searchParams;
  const rawKind = one(params.kind);
  const savedOnly = rawKind === "saved";
  const kind: CalendarKind = isKind(rawKind) ? rawKind : "all";
  const asList = one(params.view) === "list";

  const thisMonth = monthKey(new Date());
  const requested = one(params.m);
  const key = requested && isMonthKey(requested) ? requested : thisMonth;

  const viewer = await getCurrentUser();
  const [entries, totals, counts, landing] = await Promise.all([
    monthEntries(key, {
      kind: savedOnly ? "all" : kind,
      viewerId: viewer?.id,
      savedOnly,
    }),
    monthTotals(),
    upcomingCounts(viewer?.id),
    viewer ? watchlistLanding(viewer.id) : Promise.resolve(null),
  ]);

  const chips: { key: ChipKey; label: string }[] =
    viewer && counts.saved > 0
      ? [...KINDS, { key: "saved", label: "On your watchlist" }]
      : KINDS;

  // Stepping a month must not drop the filter or the chosen view.
  const href = (patch: { m?: string; kind?: string; view?: string }) => {
    const next = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      m: key === thisMonth ? undefined : key,
      kind: savedOnly ? "saved" : kind === "all" ? undefined : kind,
      view: asList ? "list" : undefined,
      ...patch,
    };
    for (const [name, value] of Object.entries(base)) {
      if (value) next.set(name, value);
    }
    const query = next.toString();
    return query ? `/calendar?${query}` : "/calendar";
  };

  const previous = shiftMonth(key, -1);
  const next = shiftMonth(key, 1);
  const { label } = monthRange(key);

  return (
    <>
      <PageHeader
        label="Calendar"
        title="What is coming."
        lede="Films and series with a date on them, a month at a time, as far ahead as anyone has announced. Dates move — this reads them from TMDB every day and says what it currently knows."
        action={
          <p className="readout shrink-0 text-xs text-faint">
            {counts.all} titles ahead
          </p>
        }
      />

      <Container className="py-10">
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

        {/* Month navigation and the filters, on one line. */}
        <div className="flex flex-wrap items-center justify-between gap-6 border-b border-line pb-6">
          <div className="flex items-center gap-5">
            <Step
              href={href({ m: previous })}
              label="Previous month"
              glyph="←"
              count={totals.get(previous) ?? 0}
              disabled={previous < thisMonth}
            />
            <h2 className="font-display text-3xl leading-none sm:text-4xl">
              {label}
            </h2>
            <Step
              href={href({ m: next })}
              label="Next month"
              glyph="→"
              count={totals.get(next) ?? 0}
              disabled={false}
            />
            {key !== thisMonth && (
              <Link
                href={href({ m: thisMonth })}
                className="label transition-colors hover:text-paper"
              >
                Today
              </Link>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {chips.map((option) => {
              const on = savedOnly ? option.key === "saved" : option.key === kind;
              return (
                <Link
                  key={option.key}
                  href={href({ kind: option.key === "all" ? "" : option.key })}
                  aria-current={on ? "true" : undefined}
                  className={`rounded-[3px] border px-3 py-1.5 font-sans text-[0.625rem] tracking-[0.14em] uppercase transition-colors ${
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

            <Link
              href={href({ view: asList ? "" : "list" })}
              className="label ml-2 transition-colors hover:text-paper"
            >
              {asList ? "Grid view" : "List view"}
            </Link>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="py-16 text-sm leading-relaxed text-muted">
            Nothing dated in {label}
            {savedOnly ? " from your watchlist" : ""}. Try the next month, or
            run{" "}
            <code className="readout text-xs text-paper">
              npm run films:upcoming
            </code>{" "}
            to pull more of the schedule.
          </p>
        ) : (
          <>
            {/* The grid is desktop-only: seven columns at 375px gives each
                day 40px, which fits a number and nothing else. Phones get
                the list, which is the same data read downward. */}
            {!asList && (
              <div className="mt-8 hidden md:block">
                <MonthGrid
                  monthKey={key}
                  entries={entries}
                  listHref={href({ view: "list" })}
                />
              </div>
            )}

            <div className={asList ? "mt-4" : "mt-4 md:hidden"}>
              <ul>
                {entries.map((entry) => (
                  <CalendarRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </div>
          </>
        )}
      </Container>
    </>
  );
}

function Step({
  href,
  label,
  glyph,
  count,
  disabled,
}: {
  href: string;
  label: string;
  glyph: string;
  count: number;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <span className="label opacity-25" aria-hidden="true">
        {glyph}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={`${label} — ${count} titles`}
      className="label flex items-center gap-2 transition-colors hover:text-paper"
    >
      {glyph}
      {/* The count behind an arrow, so nobody steps into an empty month. */}
      <span className="readout text-faint">{count}</span>
    </Link>
  );
}

/* ---- the grid ----------------------------------------------------------- */

function MonthGrid({
  monthKey: key,
  entries,
  listHref,
}: {
  monthKey: string;
  entries: CalendarEntry[];
  /** Where "+n more" goes: the same month, read as a list. */
  listHref: string;
}) {
  const { start } = monthRange(key);
  const year = start.getUTCFullYear();
  const month = start.getUTCMonth();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // getUTCDay is Sunday-first and the grid is Monday-first, so Sunday has to
  // wrap to the end of a week rather than starting one.
  const leading = (start.getUTCDay() + 6) % 7;

  const byDay = new Map<number, CalendarEntry[]>();
  for (const entry of entries) {
    const day = entry.date.getUTCDate();
    byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  }

  const today = new Date();
  const todayDay =
    today.getUTCFullYear() === year && today.getUTCMonth() === month
      ? today.getUTCDate()
      : null;

  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  // Fill the last week out so the grid ends on a straight edge.
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line-bright">
        {WEEKDAYS.map((day) => (
          <p key={day} className="label pb-2 !text-[0.5625rem]">
            {day}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 border-l border-line">
        {cells.map((day, i) => {
          const dayEntries = day ? (byDay.get(day) ?? []) : [];
          const isToday = day !== null && day === todayDay;

          return (
            <div
              key={i}
              className={`min-h-[9.5rem] border-r border-b border-line p-2 ${
                day === null ? "bg-ink-sunk/50" : ""
              } ${isToday ? "bg-ink-raised" : ""}`}
            >
              {day !== null && (
                <>
                  <p
                    className={`readout text-[0.6875rem] ${
                      isToday
                        ? "text-gold"
                        : dayEntries.length
                          ? "text-paper"
                          : "text-faint"
                    }`}
                  >
                    {String(day).padStart(2, "0")}
                    {isToday && <span className="ml-1.5">today</span>}
                  </p>

                  <div className="mt-2 space-y-1.5">
                    {dayEntries.slice(0, CHIPS_PER_DAY).map((entry) => (
                      <DayChip key={entry.id} entry={entry} />
                    ))}

                    {dayEntries.length > CHIPS_PER_DAY && (
                      <Link
                        href={listHref}
                        className="readout block pl-1 text-[0.625rem] text-faint transition-colors hover:text-gold"
                      >
                        +{dayEntries.length - CHIPS_PER_DAY} more
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayChip({ entry }: { entry: CalendarEntry }) {
  return (
    <Link
      href={`/films/${entry.slug}`}
      title={`${entry.title}${entry.season ? ` — season ${entry.season}` : ""}`}
      className="group flex items-center gap-2 rounded-[2px] p-1 transition-colors hover:bg-ink-raised"
    >
      <PosterThumb film={entry} className="w-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.6875rem] leading-tight transition-colors group-hover:text-gold">
          {entry.title}
        </span>
        {(entry.season || entry.saved) && (
          <span className="readout block text-[0.5625rem] leading-tight text-faint">
            {entry.season ? `S${String(entry.season).padStart(2, "0")}` : ""}
            {entry.season && entry.saved ? " · " : ""}
            {entry.saved ? <span className="text-gold">saved</span> : ""}
          </span>
        )}
      </span>
    </Link>
  );
}

/* ---- the list, still ---------------------------------------------------- */

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
            {entry.genres.length > 0 &&
              ` · ${entry.genres.slice(0, 2).join(", ")}`}
          </span>
        </span>

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
