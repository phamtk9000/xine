/**
 * What XINE covers, and how hard each region has to work to get in.
 *
 * The thresholds are deliberately uneven. A single bar across all four would
 * either drown the catalogue in Hollywood or exclude Vietnam entirely — TMDB
 * has tens of thousands of US films with four-figure vote counts and a few
 * hundred Vietnamese ones where fifty votes is a hit. So each region is scored
 * against its own industry rather than against Hollywood.
 */

export type ImportRegion = {
  key: string;
  label: string;
  countries: string[];
  minScore: number;
  minVotes: number;
  pages: number;
  yearFrom: number;
};

export const IMPORT_REGIONS: ImportRegion[] = [
  {
    key: "us",
    label: "United States",
    countries: ["US"],
    // The deepest catalogue on TMDB by far, so the bar is highest.
    minScore: 7.0,
    minVotes: 900,
    pages: 12,
    yearFrom: 1950,
  },
  {
    key: "vn",
    label: "Vietnam",
    countries: ["VN"],
    // Barely represented on TMDB. A Hollywood-scale threshold would return
    // almost nothing, so this takes essentially everything with a pulse.
    minScore: 0,
    minVotes: 10,
    pages: 8,
    yearFrom: 1950,
  },
  {
    key: "kr",
    label: "South Korea",
    countries: ["KR"],
    minScore: 6.5,
    minVotes: 300,
    pages: 8,
    yearFrom: 1955,
  },
  {
    key: "eu",
    label: "Europe",
    countries: [
      "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "LU",
      "AT", "CH", "DK", "SE", "NO", "FI", "IS", "PL", "CZ", "SK",
      "HU", "RO", "BG", "GR", "HR", "RS", "SI", "EE", "LV", "LT",
      "UA", "RU", "SU",
    ],
    minScore: 6.7,
    minVotes: 200,
    pages: 14,
    yearFrom: 1930,
  },
];

export function findRegion(key: string) {
  return IMPORT_REGIONS.find((r) => r.key === key) ?? null;
}

/**
 * Pages through discover for each region and returns the raw candidates.
 * Deduplicated by TMDB id, because a European co-production can match several
 * origin countries in the same query.
 */
export async function importCandidates(options: {
  only?: string | null;
  pagesOverride?: number | null;
  kind?: "film" | "series";
  onProgress?: (region: ImportRegion, page: number, found: number) => void;
} = {}) {
  const tmdb = await import("./tmdb");
  const discoverPage =
    options.kind === "series" ? tmdb.discoverTvPage : tmdb.discoverPage;

  const regions = options.only
    ? IMPORT_REGIONS.filter((r) => r.key === options.only)
    : IMPORT_REGIONS;

  if (regions.length === 0) {
    throw new Error(
      `Unknown region. Use one of: ${IMPORT_REGIONS.map((r) => r.key).join(", ")}`,
    );
  }

  const out: [ImportRegion, DiscoverRowLike[]][] = [];

  for (const region of regions) {
    const seen = new Map<number, DiscoverRowLike>();
    const maxPages = options.pagesOverride ?? region.pages;

    for (let page = 1; page <= maxPages; page++) {
      const { rows, totalPages } = await discoverPage({
        countries: region.countries,
        minScore: region.minScore,
        minVotes: region.minVotes,
        yearFrom: region.yearFrom,
        page,
      });

      for (const row of rows) seen.set(row.id, row);
      options.onProgress?.(region, page, seen.size);

      if (page >= totalPages) break;
      // TMDB tolerates bursts, but there is no reason to hammer it.
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    out.push([region, [...seen.values()]]);
  }

  return out;
}

type DiscoverRowLike = {
  id: number;
  title: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
};
