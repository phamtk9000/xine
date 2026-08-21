import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink, Container, PageHeader } from "@/components/ui";
import { STAGES } from "@/lib/stages";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Create",
  description:
    "Take a film from a one-line idea to a pitch package. Ten stages, a trailer studio, and a way out to professional development.",
};

export default async function CreatePage() {
  const user = await getCurrentUser();
  const projects = user
    ? await db.project.findMany({
        where: { ownerId: user.id },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  return (
    <>
      <PageHeader
        label="Create"
        title="You have an idea. This is what happens next."
        lede="Most film ideas die between the thought and the document. Create is the workspace that closes that gap — ten stages, in order, each one producing something you can hand to someone else."
        action={<ButtonLink href="/create/pitch">Pitch Your Film →</ButtonLink>}
      />

      {projects.length > 0 && (
        <Container className="pt-12">
          <h2 className="label border-b border-line pb-3">Your projects</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/create/projects/${project.id}`}
                className="group rounded-xl border border-line p-5 transition-colors hover:border-line-bright"
              >
                <p className="label !text-gold">{project.genre}</p>
                <p className="mt-2 font-display text-2xl transition-colors group-hover:text-gold">
                  {project.title}
                </p>
                <p className="mt-2 text-xs text-faint">
                  Currently at {project.stage}
                </p>
              </Link>
            ))}
          </div>
        </Container>
      )}

      <Container className="py-16">
        <div className="grid gap-14 lg:grid-cols-[1fr_20rem]">
          <section>
            <h2 className="label border-b border-line pb-3">The pipeline</h2>
            <ol className="mt-2">
              {STAGES.map((stage) => (
                <li
                  key={stage.key}
                  className="grid grid-cols-[3rem_1fr] gap-4 border-b border-line py-6 last:border-0"
                >
                  <span className="font-sans text-xs text-faint tabular-nums">
                    {String(stage.index).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-display text-3xl leading-none">
                      {stage.label}
                    </h3>
                    <p className="mt-2 text-sm text-muted">{stage.blurb}</p>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-faint">
                      {stage.prompt}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <aside className="space-y-6">
            <div className="rounded-xl border border-line bg-ink-raised p-6">
              <p className="label">Trailer Studio</p>
              <p className="mt-3 font-display text-3xl leading-none">
                Build the ninety seconds
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                Title, genre, logline, film references and visual references in.
                Creative direction, storyboard and a timed trailer script out.
              </p>
              <ButtonLink
                href="/create/trailer"
                variant="outline"
                className="mt-6 w-full"
              >
                Open Trailer Studio
              </ButtonLink>
            </div>

            <div className="rounded-xl border border-line p-6">
              <p className="label">When you are serious</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                The workspace gets you a draft. For a project going in front of
                money, our development team takes it the rest of the way —
                treatment, visual identity, concept trailer, pitch package,
                business plan.
              </p>
              <Link
                href="/develop"
                className="mt-5 inline-block border-b border-gold pb-1 text-sm text-gold"
              >
                Develop My Film →
              </Link>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
