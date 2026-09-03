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
  /**
   * The second pass: how many votes make a film worth having whatever it
   * scores. Reach rather than quality — see the note on importCandidates.
   */
  reachVotes: number;
  reachPages: number;
};

export const IMPORT_REGIONS: ImportRegion[] = [
  {
    key: "us",
    label: "United States",
    countries: ["US"],
    // The deepest catalogue on TMDB by far, so the bar is highest.
    minScore: 7.0,
    minVotes: 900,
    pages: 20,
    yearFrom: 1950,
    reachVotes: 2000,
    reachPages: 10,
  },
  {
    key: "vn",
    label: "Vietnam",
    countries: ["VN"],
    // Barely represented on TMDB. A Hollywood-scale threshold would return
    // almost nothing, so this takes essentially everything with a pulse.
    minScore: 0,
    minVotes: 10,
    pages: 10,
    yearFrom: 1950,
    reachVotes: 30,
    reachPages: 4,
  },
  {
    key: "kr",
    label: "South Korea",
    countries: ["KR"],
    minScore: 6.5,
    minVotes: 300,
    pages: 14,
    yearFrom: 1955,
    reachVotes: 600,
    reachPages: 8,
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
    pages: 24,
    yearFrom: 1930,
    reachVotes: 800,
    reachPages: 10,
  },
  {
    key: "jp",
    label: "Japan",
    countries: ["JP"],
    minScore: 6.8,
    minVotes: 120,
    pages: 16,
    yearFrom: 1930,
    reachVotes: 500,
    reachPages: 8,
  },
  {
    key: "cn",
    label: "Chinese-language",
    countries: ["CN", "HK", "TW"],
    minScore: 6.6,
    minVotes: 80,
    pages: 14,
    yearFrom: 1930,
    reachVotes: 300,
    reachPages: 8,
  },
  {
    key: "in",
    label: "India",
    countries: ["IN"],
    minScore: 6.8,
    minVotes: 120,
    pages: 12,
    yearFrom: 1950,
    reachVotes: 300,
    reachPages: 8,
  },
  {
    key: "latam",
    label: "Latin America",
    countries: ["MX", "BR", "AR", "CL", "CO", "PE", "UY", "CU", "VE", "BO"],
    minScore: 6.7,
    minVotes: 80,
    pages: 12,
    yearFrom: 1950,
    reachVotes: 300,
    reachPages: 6,
  },
  {
    key: "mena",
    label: "Middle East & North Africa",
    countries: ["IR", "TR", "IL", "LB", "EG", "MA", "DZ", "TN", "PS", "SY"],
    // Thinly voted on TMDB even for canonical work — Kiarostami rarely
    // clears three figures — so the bar is set where the films are, not
    // where an American release would be.
    minScore: 6.6,
    minVotes: 40,
    pages: 10,
    yearFrom: 1950,
    reachVotes: 150,
    reachPages: 5,
  },
  {
    key: "sea",
    label: "Southeast Asia",
    countries: ["TH", "ID", "PH", "MY", "SG"],
    minScore: 6.5,
    minVotes: 40,
    pages: 10,
    yearFrom: 1960,
    reachVotes: 150,
    reachPages: 5,
  },
  {
    key: "anz",
    label: "Australia & New Zealand",
    countries: ["AU", "NZ"],
    minScore: 6.7,
    minVotes: 120,
    pages: 10,
    yearFrom: 1950,
    reachVotes: 400,
    reachPages: 5,
  },
  {
    key: "ca",
    label: "Canada",
    countries: ["CA"],
    minScore: 6.7,
    minVotes: 120,
    pages: 10,
    yearFrom: 1950,
    reachVotes: 400,
    reachPages: 5,
  },
  {
    key: "africa",
    label: "Africa",
    countries: ["NG", "ZA", "SN", "BF", "ML", "KE", "GH", "ET", "TZ", "CI"],
    // The thinnest corner of TMDB there is. Ousmane Sembène's entire
    // filmography sits under fifty votes a title.
    minScore: 6.0,
    minVotes: 15,
    pages: 8,
    yearFrom: 1960,
    reachVotes: 50,
    reachPages: 4,
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
type DiscoverSort = "vote_average.desc" | "vote_count.desc";

/**
 * Two sweeps per region, under two different arguments.
 *
 * The first asks what a cinema is rated highest for, against a vote floor —
 * the ordering an editorial catalogue can defend, and the one that finds
 * Sembène under twenty votes.
 *
 * The second asks what a lot of people have actually seen, at any score. It
 * exists because a rule that reads quality alone had a strange consequence:
 * Insidious (6.954, seven and a half thousand votes) missed the American bar
 * by four hundredths of a point, so a franchise most of a generation has
 * seen was absent while its unreleased 2026 sequel was present — the calendar
 * sync having imported that one regardless of score. A catalogue can decline
 * to admire a film. It cannot sensibly decline to have heard of it.
 *
 * The opinion moves to where it belongs: the lists, the reviews and the
 * critic scores, which is where this site argues. Presence is not praise.
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

    /** One sweep of a region under one rule, deduped into `seen`. */
    const sweep = async (
      maxPages: number,
      params: { minScore: number; minVotes: number; sort: DiscoverSort },
    ) => {
      for (let page = 1; page <= maxPages; page++) {
        const { rows, totalPages } = await discoverPage({
          countries: region.countries,
          yearFrom: region.yearFrom,
          page,
          ...params,
        });

        for (const row of rows) seen.set(row.id, row);
        options.onProgress?.(region, page, seen.size);

        if (page >= totalPages) break;
        // TMDB tolerates bursts, but there is no reason to hammer it.
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    };

    // Quality: what a region is rated highest for, which is what an
    // editorial catalogue is for.
    await sweep(options.pagesOverride ?? region.pages, {
      minScore: region.minScore,
      minVotes: region.minVotes,
      sort: "vote_average.desc",
    });

    // Reach: what a lot of people have actually seen, whatever it scores.
    await sweep(options.pagesOverride ?? region.reachPages, {
      minScore: 0,
      minVotes: region.reachVotes,
      sort: "vote_count.desc",
    });

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
