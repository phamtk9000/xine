import Link from "next/link";
import type { Metadata } from "next";
import { FilmGrid } from "@/components/film-card";
import { CatalogueSearch } from "@/components/catalogue-search";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { browseFilms, filmFacets, PAGE_SIZE, type FilmSort } from "@/lib/films";

export const metadata: Metadata = {
  title: "Films",
  description:
    "The catalogue: trending, new releases, and everything rated on five axes plus an overall.",
};

const SORTS: { key: FilmSort; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "new", label: "New releases" },
  { key: "rated", label: "Highest rated" },
  { key: "az", label: "A–Z" },
];

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function FilmsPage({ searchParams }: PageProps<"/films">) {
  const params = await searchParams;
  const sort = (one(params.sort) as FilmSort) ?? "trending";
  const genre = one(params.genre);
  const country = one(params.country);
  const decadeParam = one(params.decade);
  const decade = decadeParam ? Number(decadeParam) : undefined;
  const search = one(params.q);
  const reviewed = one(params.reviewed) === "1";
  const requestedPage = Number(one(params.page) ?? 1) || 1;

  const [{ films, total, page, pages }, facets, user] = await Promise.all([
    browseFilms(
      { sort, genre, country, decade, search, reviewed },
      requestedPage,
    ),
    filmFacets(),
    getCurrentUser(),
  ]);

  // One query for the whole page: whatever this reader has already said
  // about the sixty films in front of them, so the scales render filled
  // rather than blank and a second press does not look like a first.
  const mine = user
    ? new Map(
        (
          await db.rating.findMany({
            where: { userId: user.id, filmId: { in: films.map((f) => f.id) } },
            select: { filmId: true, overall: true },
          })
        ).map((row) => [row.filmId, row.overall]),
      )
    : new Map<string, number>();

  // Preserve the other filters when a facet link is clicked.
  function href(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    // Changing a filter or sort resets to page 1 — staying on page 7 of a
    // result set that just shrank to two pages lands the reader on nothing.
    // A patch that names `page` is the pager itself, so it wins.
    const base = {
      sort,
      genre,
      country,
      decade: decadeParam,
      q: search,
      reviewed: reviewed ? "1" : undefined,
      page: undefined as string | undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(base)) {
      if (
        value &&
        !(key === "sort" && value === "trending") &&
        !(key === "page" && value === "1")
      ) {
        next.set(key, String(value));
      }
    }
    const qs = next.toString();
    return qs ? `/films?${qs}` : "/films";
  }

  const active = [
    genre && { label: genre, href: href({ genre: undefined }) },
    country && { label: country, href: href({ country: undefined }) },
    decade && { label: `${decade}s`, href: href({ decade: undefined }) },
    search && { label: `“${search}”`, href: href({ q: undefined }) },
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <>
      <PageHeader
        label="Films"
        title="The catalogue."
        lede={`${total} film${total === 1 ? "" : "s"}, each open to a rating on five axes plus an overall — Story, Direction, Visual, Performance, Sound — rather than one number out of five.`}
        action={
          <div className="flex w-full max-w-md flex-col gap-3">
            <CatalogueSearch initial={search ?? ""} />
            <Link
              href="/films/find"
              className="text-sm text-gold underline underline-offset-4"
            >
              Or describe what you&rsquo;re in the mood for →
            </Link>
          </div>
        }
      />

      <Container className="py-10">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line pb-5">
          {SORTS.map((s) => (
            <Link
              key={s.key}
              href={href({ sort: s.key })}
              className={`label transition-colors hover:text-paper ${
                sort === s.key ? "!text-paper" : ""
              }`}
            >
              {s.label}
            </Link>
          ))}

          {/* Country sits with the sorts rather than down in the rail: it is
              the filter people reach for first on a catalogue that spans
              twelve cinemas, and a `details` element makes it a dropdown
              without shipping a line of JavaScript. */}
          <details className="group relative ml-auto">
            <summary className="label cursor-pointer list-none transition-colors hover:text-paper marker:content-['']">
              <span className={country ? "!text-gold" : ""}>
                {country ?? "Country"}
              </span>
              <span className="ml-2 text-faint transition-transform group-open:inline-block group-open:rotate-180">
                ▾
              </span>
            </summary>

            <div className="absolute right-0 z-20 mt-3 max-h-80 w-56 overflow-y-auto rounded-[3px] border border-line-bright bg-ink-raised p-2 shadow-xl">
              {country && (
                <Link
                  href={href({ country: undefined })}
                  className="block px-3 py-2 text-sm text-gold hover:bg-ink"
                >
                  ✕ Clear
                </Link>
              )}
              {facets.countries.map((value) => (
                <Link
                  key={value}
                  href={href({ country: value === country ? undefined : value })}
                  className={`block px-3 py-2 text-sm transition-colors hover:bg-ink ${
                    value === country ? "text-gold" : "text-muted hover:text-paper"
                  }`}
                >
                  {value}
                </Link>
              ))}
            </div>
          </details>

          {/* The editorial tier, separated from the imported catalogue. */}
          <Link
            href={href({ reviewed: reviewed ? undefined : "1" })}
            className={`label transition-colors hover:text-paper ${
              reviewed ? "!text-gold" : ""
            }`}
          >
            {reviewed ? "✓ Reviewed by xine" : "Reviewed by xine"}
          </Link>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[13rem_1fr]">
          <aside className="space-y-8">
            <Facet
              title="Genre"
              values={facets.genres}
              current={genre}
              hrefFor={(v) => href({ genre: v })}
            />
            <Facet
              title="Decade"
              values={facets.decades.map((d) => `${d}s`)}
              current={decade ? `${decade}s` : undefined}
              hrefFor={(v) => href({ decade: v?.replace("s", "") })}
            />
          </aside>

          <div>
            {active.length > 0 && (
              <div className="mb-7 flex flex-wrap items-center gap-2">
                <span className="label">Filtered by</span>
                {active.map((chip) => (
                  <Link
                    key={chip.label}
                    href={chip.href}
                    className="rounded-[3px] border border-line-bright px-3 py-1 text-xs text-paper transition-colors hover:border-accent hover:text-accent"
                  >
                    {chip.label} ✕
                  </Link>
                ))}
              </div>
            )}

            {films.length === 0 ? (
              <EmptyState
                title="Nothing matches that"
                body="No films in the catalogue fit these filters. Clear one and try again."
              />
            ) : (
              <>
                <FilmGrid
                  films={films}
                  priorityCount={6}
                  viewer={{ signedIn: !!user, ratings: mine }}
                />
                <Pager page={page} pages={pages} total={total} href={href} />
              </>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}

/**
 * Page N of M, with a window of numbers around the current page rather than
 * every page — twenty-two numbered links is a worse way to find page 12 than
 * two arrows and a count.
 */
function Pager({
  page,
  pages,
  total,
  href,
}: {
  page: number;
  pages: number;
  total: number;
  href: (patch: Record<string, string | undefined>) => string;
}) {
  if (pages <= 1) return null;

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const window: number[] = [];
  for (let n = Math.max(1, page - 2); n <= Math.min(pages, page + 2); n++) {
    window.push(n);
  }

  const step =
    "rounded-[3px] border border-line px-3 py-1.5 text-xs transition-colors hover:border-line-bright hover:text-paper";

  return (
    <nav
      className="mt-12 flex flex-wrap items-center gap-2 border-t border-line pt-6"
      aria-label="Pagination"
    >
      <p className="mr-auto text-xs text-faint">
        {from}–{to} of {total}
      </p>

      {page > 1 && (
        <Link href={href({ page: String(page - 1) })} className={step}>
          ← Prev
        </Link>
      )}

      {window[0] > 1 && <span className="px-1 text-xs text-faint">…</span>}

      {window.map((n) => (
        <Link
          key={n}
          href={href({ page: String(n) })}
          aria-current={n === page ? "page" : undefined}
          className={`rounded-[3px] border px-3 py-1.5 text-xs tabular-nums transition-colors ${
            n === page
              ? "border-gold text-gold"
              : "border-line text-muted hover:border-line-bright hover:text-paper"
          }`}
        >
          {n}
        </Link>
      ))}

      {window[window.length - 1] < pages && (
        <span className="px-1 text-xs text-faint">…</span>
      )}

      {page < pages && (
        <Link href={href({ page: String(page + 1) })} className={step}>
          Next →
        </Link>
      )}
    </nav>
  );
}

function Facet({
  title,
  values,
  current,
  hrefFor,
}: {
  title: string;
  values: string[];
  current?: string;
  hrefFor: (value: string | undefined) => string;
}) {
  return (
    <div>
      <p className="label border-b border-line pb-2">{title}</p>
      <ul className="mt-3 space-y-1.5">
        {values.map((value) => {
          const on = current === value;
          return (
            <li key={value}>
              <Link
                href={hrefFor(on ? undefined : value)}
                className={`text-sm transition-colors ${
                  on ? "text-gold" : "text-muted hover:text-paper"
                }`}
              >
                {value}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
