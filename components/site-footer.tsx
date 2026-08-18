import Link from "next/link";
import { tmdbConfigured } from "@/lib/tmdb";

const COLUMNS = [
  {
    heading: "Discover",
    links: [
      { href: "/films", label: "Films" },
      { href: "/films/find", label: "Find me a film" },
      { href: "/films?sort=new", label: "New releases" },
      { href: "/films?sort=trending", label: "Trending" },
      { href: "/journal", label: "Journal" },
      { href: "/lists", label: "Lists" },
    ],
  },
  {
    heading: "Community",
    links: [
      { href: "/community", label: "Activity" },
      { href: "/community/members", label: "Members" },
      { href: "/reviews", label: "Recent reviews" },
      { href: "/sign-up", label: "Create an account" },
    ],
  },
  {
    heading: "Create",
    links: [
      { href: "/create", label: "Overview" },
      { href: "/create/pitch", label: "Pitch Your Film" },
      { href: "/create/trailer", label: "Trailer Studio" },
      { href: "/develop", label: "Develop My Film" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink-sunk">
      <div className="mx-auto max-w-[1400px] px-5 py-16 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <p className="font-display text-5xl leading-none">xine</p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              A film magazine that rates on six axes and a workspace that takes
              an idea to a pitch package. Read, rate, then make one.
            </p>
            <Link
              href="/develop"
              className="mt-6 inline-block border-b border-gold pb-1 text-sm text-gold"
            >
              Develop My Film →
            </Link>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="label">{column.heading}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-paper"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-line pt-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} xine</p>
          <p>
            {tmdbConfigured()
              ? "Film metadata from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB."
              : "Running on the seeded catalogue. Add a TMDB key to pull live film data."}
          </p>
        </div>
      </div>
    </footer>
  );
}
