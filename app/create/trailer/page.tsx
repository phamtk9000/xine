import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink, Container, EmptyState } from "@/components/ui";
import { BriefForm } from "@/components/brief-form";
import { BEATS } from "@/lib/trailer";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Trailer Studio",
  description:
    "Creative direction, storyboard and a timed trailer script — from a title, a logline and a handful of references.",
};

export default async function TrailerStudioPage({
  searchParams,
}: PageProps<"/create/trailer">) {
  const params = await searchParams;
  const projectId = typeof params.project === "string" ? params.project : undefined;

  const user = await getCurrentUser();
  const [projects, briefs] = user
    ? await Promise.all([
        db.project.findMany({
          where: { ownerId: user.id },
          select: { id: true, title: true },
          orderBy: { updatedAt: "desc" },
        }),
        db.trailerBrief.findMany({
          where: { ownerId: user.id },
          select: { id: true, title: true, genre: true },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], []];

  return (
    <Container className="py-16">
      <div className="grid gap-14 lg:grid-cols-[1fr_22rem]">
        <div className="max-w-2xl">
          <p className="label !text-gold">Create</p>
          <h1 className="mt-4 font-display text-5xl leading-[0.95] tracking-tight sm:text-6xl">
            Create a concept trailer.
          </h1>
          <p className="mt-6 text-base leading-relaxed text-muted">
            A financier will watch ninety seconds before they read a page.
            Give the studio a title, a logline and your references, and it
            returns creative direction, a storyboard and a timed script you can
            shoot against.
          </p>

          {briefs.length > 0 && (
            <div className="mt-10">
              <p className="label border-b border-line pb-2">Your briefs</p>
              <ul className="mt-3 space-y-2">
                {briefs.map((brief) => (
                  <li key={brief.id}>
                    <Link
                      href={`/create/trailer/${brief.id}`}
                      className="text-sm text-muted transition-colors hover:text-paper"
                    >
                      {brief.title}
                      <span className="ml-2 text-faint">{brief.genre}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-12">
            {user ? (
              <BriefForm projects={projects} defaultProjectId={projectId} />
            ) : (
              <EmptyState
                title="Briefs belong to an account"
                body="Sign in and the studio saves your brief, its direction, storyboard and script — and links it to a project if you have one."
                action={<ButtonLink href="/sign-in">Sign in</ButtonLink>}
              />
            )}
          </div>
        </div>

        <aside>
          <p className="label border-b border-line pb-2">The output</p>
          <ol className="mt-4 space-y-5">
            {[
              ["01", "Creative direction", "Visual language, palette, cinematography, lighting, production design."],
              ["02", "Storyboard", "Eight shots — what a proof-of-concept can actually afford to build."],
              ["03", "Trailer script", "Ninety seconds, timed to the beat."],
              ["04", "Concept trailer", "Shot with our team, or by yours against the document."],
            ].map(([n, title, body]) => (
              <li key={n} className="grid grid-cols-[2rem_1fr] gap-3">
                <span className="font-sans text-xs text-faint">{n}</span>
                <div>
                  <p className="text-sm text-paper">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-10 rounded-xl border border-line bg-ink-raised p-5">
            <p className="label">The beat map</p>
            <ul className="mt-3 space-y-1.5">
              {BEATS.map((beat) => (
                <li
                  key={beat.label}
                  className="flex gap-3 font-sans text-[0.6875rem] text-muted"
                >
                  <span className="shrink-0 text-faint tabular-nums">
                    {beat.from}
                  </span>
                  <span>{beat.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </Container>
  );
}
