import Image from "next/image";
import Link from "next/link";
import type { CastMember } from "@/lib/people";

/**
 * The billed cast, as a row of faces you can click through to.
 *
 * Character name sits under the actor's, because on a film page the part is
 * what a reader is usually trying to place — "who played the mother" more
 * often than "what else has she been in", even though the second is what the
 * link is for.
 */
export function CastRow({ cast }: { cast: CastMember[] }) {
  if (cast.length === 0) return null;

  return (
    <ul className="grid grid-cols-3 gap-x-4 gap-y-7 sm:grid-cols-4 lg:grid-cols-5">
      {cast.map((member) => (
        <li key={member.slug}>
          <Link href={`/people/${member.slug}`} className="group block">
            <div className="relative aspect-2/3 overflow-hidden rounded-md bg-ink-raised">
              {member.profileUrl ? (
                <Image
                  src={member.profileUrl}
                  alt=""
                  fill
                  sizes="160px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                // No headshot on TMDB — initials rather than an empty box, so
                // a row with gaps still reads as a designed grid.
                <span className="flex h-full w-full items-center justify-center font-display text-3xl text-faint">
                  {member.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")}
                </span>
              )}
            </div>
            <p className="mt-2.5 text-sm leading-snug font-medium transition-colors group-hover:text-gold">
              {member.name}
            </p>
            {member.character && (
              <p className="mt-0.5 text-xs leading-snug text-faint">
                {member.character}
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
