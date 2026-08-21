import Image from "next/image";
import Link from "next/link";
import type { CastMember } from "@/lib/people";

/**
 * The billed cast as a row of panels that expand on hover.
 *
 * Adapted from a Tailwind image-accordion drop-in. The mechanic is kept as
 * given — the row is a group, every panel shrinks when any sibling is
 * hovered, and the hovered one keeps its width — but the demo's hardcoded
 * base64 images became real headshots, and its `<a href="#">` became a link
 * to the person's page.
 *
 * Two things were added rather than adapted. `focus-within` mirrors every
 * hover rule, so the row opens for a keyboard as well as a mouse — the panel
 * that has focus is the one that stays wide. And below `md` the accordion
 * doesn't collapse at all: on a touch screen there is no hover, so panels
 * stay full width and the names stay visible instead of being permanently
 * hidden behind an interaction that can't happen.
 *
 * The headshot is a FIXED size and the panel merely clips it. The obvious
 * `w-full object-cover` re-derives the cover scale from the panel's current
 * width, so every panel visibly zoomed while it animated — and at rest a
 * 168px-wide, 416px-tall panel cropped a portrait headshot down to a band
 * across somebody's forehead. Sizing the image once, off the panel's height,
 * means widening the panel reveals more of the same picture at the same
 * scale, which is what an accordion should do.
 */
export function CastAccordion({ cast }: { cast: CastMember[] }) {
  if (cast.length === 0) return null;

  return (
    <ul className="group flex flex-col gap-2 md:flex-row">
      {cast.map((member) => (
        <li
          key={member.slug}
          className={[
            "group/panel relative h-64 w-full overflow-hidden rounded-lg bg-ink-raised transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.15)] md:h-[22rem]",
            // Every sibling narrows while one panel is hovered or focused.
            "md:not-[&:hover]:group-hover:w-[22%]",
            "md:[&:not(:focus-within):not(:hover)]:group-focus-within:w-[22%]",
            // Scrim under the caption, only once the panel is open.
            "before:absolute before:inset-x-0 before:bottom-0 before:h-1/2 before:bg-gradient-to-t before:from-ink before:transition-opacity",
            "md:before:opacity-0 md:hover:before:opacity-100 focus-within:before:opacity-100",
            // The narrowed siblings dim back.
            "after:absolute after:inset-0 after:bg-ink/40 after:opacity-0 after:transition-opacity",
            "md:not-[&:hover]:group-hover:after:opacity-100",
            "md:[&:not(:focus-within):not(:hover)]:group-focus-within:after:opacity-100",
          ].join(" ")}
        >
          <Link
            href={`/people/${member.slug}`}
            className="absolute inset-0 z-10 flex flex-col justify-end p-4 focus-visible:ring-2 focus-visible:ring-gold focus-visible:outline-none"
          >
            {member.character && (
              <span
                className={[
                  "block text-xs text-paper/70 transition duration-200 ease-[cubic-bezier(.5,.85,.25,1.8)]",
                  "md:translate-y-2 md:truncate md:opacity-0 md:whitespace-nowrap",
                  "group-hover/panel:translate-y-0 group-hover/panel:opacity-100 group-hover/panel:delay-200",
                  "group-focus-within/panel:translate-y-0 group-focus-within/panel:opacity-100 group-focus-within/panel:delay-200",
                ].join(" ")}
              >
                {member.character}
              </span>
            )}
            <span
              className={[
                "mt-0.5 block font-display text-2xl leading-tight text-paper transition duration-200 ease-[cubic-bezier(.5,.85,.25,1.8)]",
                "md:translate-y-2 md:truncate md:opacity-0 md:whitespace-nowrap",
                "group-hover/panel:translate-y-0 group-hover/panel:opacity-100 group-hover/panel:delay-300",
                "group-focus-within/panel:translate-y-0 group-focus-within/panel:opacity-100 group-focus-within/panel:delay-300",
              ].join(" ")}
            >
              {member.name}
            </span>
          </Link>

          {member.profileUrl ? (
            // Centred and absolutely placed at a fixed width wider than any
            // panel ever gets, so the panel is a window onto it rather than a
            // box that rescales it. object-top keeps the face in frame.
            <Image
              src={member.profileUrl}
              alt=""
              width={421}
              height={632}
              sizes="(max-width: 768px) 100vw, 448px"
              className="absolute inset-y-0 left-1/2 h-full w-full -translate-x-1/2 object-cover object-top md:w-[28rem] md:max-w-none"
            />
          ) : (
            // No headshot on TMDB — initials rather than an empty panel, so a
            // row with gaps still reads as a designed row.
            <span className="flex h-full w-full items-center justify-center font-display text-4xl text-faint">
              {member.name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
