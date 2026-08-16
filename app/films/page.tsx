import Link from "next/link";
import type { Metadata } from "next";
import { FilmGrid } from "@/components/film-card";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { filmFacets, listFilms, type FilmSort } from "@/lib/films";

export const metadata: Metadata = {
  title: "Films",
  description:
    "The catalogue: trending, new releases, and everything rated across six axes.",
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

  const [films, facets] = await Promise.all([
    listFilms({ sort, genre, country, decade, search }),
    filmFacets(),
  ]);

  // Preserve the other filters when a facet link is clicked.
  function href(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const base = { sort, genre, country, decade: decadeParam, q: search, ...patch };
    for (const [key, value] of Object.entries(base)) {
      if (value && !(key === "sort" && value === "trending")) {
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
        lede={`${films.length} film${films.length === 1 ? "" : "s"}, each rated on Story, Direction, Visual, Performance and Sound — not just a number out of five.`}
        action={
          <form action="/films" className="flex w-full max-w-xs gap-2">
            <input
              name="q"
              defaultValue={search}
              placeholder="Search title or director"
              aria-label="Search films"
              className="w-full rounded-full border border-line bg-ink-raised px-4 py-2 text-sm placeholder:text-faint focus:border-line-bright focus:outline-none"
            />
          </form>
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
              title="Country"
              values={facets.countries}
              current={country}
              hrefFor={(v) => href({ country: v })}
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
                    className="rounded-full border border-line-bright px-3 py-1 text-xs text-paper transition-colors hover:border-accent hover:text-accent"
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
              <FilmGrid films={films} priorityCount={6} />
            )}
          </div>
        </div>
      </Container>
    </>
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
