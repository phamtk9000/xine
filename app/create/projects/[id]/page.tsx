import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { StageEditor } from "@/components/stage-editor";
import { setVisibility } from "@/app/actions/create";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { STAGES } from "@/lib/stages";

export const metadata: Metadata = { title: "Project workspace" };

export default async function ProjectPage({
  params,
}: PageProps<"/create/projects/[id]">) {
  const { id } = await params;
  const [project, user] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        stages: true,
        owner: { select: { username: true, displayName: true } },
        briefs: { select: { id: true, title: true } },
      },
    }),
    getCurrentUser(),
  ]);

  if (!project) notFound();

  const mine = user?.id === project.ownerId;
  // Private projects are visible to their owner only. Everything else is a
  // read-only view, which is what "share with the community" has to mean.
  if (!mine && project.visibility !== "community") notFound();

  const byKey = new Map(project.stages.map((s) => [s.key, s]));
  const done = project.stages.filter((s) => s.status === "complete").length;

  return (
    <Container className="py-14">
      <header className="border-b border-line pb-10">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/create" className="label hover:text-paper">
            ← Create
          </Link>
          <span className="label !text-gold">{project.genre}</span>
          {!mine && (
            <span className="text-xs text-faint">
              by {project.owner.displayName}
            </span>
          )}
        </div>

        <h1 className="mt-5 font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
          {project.title}
        </h1>

        {project.logline && (
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            {project.logline}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-6">
          <p className="label">
            {done} of {STAGES.length} stages complete
          </p>
          <div className="flex gap-1" aria-hidden>
            {STAGES.map((stage) => {
              const s = byKey.get(stage.key);
              return (
                <span
                  key={stage.key}
                  className={`h-1 w-8 rounded-full ${
                    s?.status === "complete"
                      ? "bg-gold"
                      : s?.content.trim()
                        ? "bg-line-bright"
                        : "bg-line"
                  }`}
                />
              );
            })}
          </div>

          {mine && (
            <form action={setVisibility} className="ml-auto">
              <input type="hidden" name="projectId" value={project.id} />
              <input
                type="hidden"
                name="visibility"
                value={project.visibility === "community" ? "private" : "community"}
              />
              <button type="submit" className="label hover:text-paper">
                {project.visibility === "community"
                  ? "Visible to the community · make private"
                  : "Private · share with the community"}
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="grid gap-12 pt-10 lg:grid-cols-[14rem_1fr]">
        <nav className="lg:sticky lg:top-24 lg:self-start" aria-label="Stages">
          <p className="label border-b border-line pb-2">Stages</p>
          <ol className="mt-3 space-y-1">
            {STAGES.map((stage) => {
              const s = byKey.get(stage.key);
              return (
                <li key={stage.key}>
                  <a
                    href={`#${stage.key}`}
                    className="flex items-center gap-2.5 py-1.5 text-sm text-muted transition-colors hover:text-paper"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        s?.status === "complete"
                          ? "bg-gold"
                          : s?.content.trim()
                            ? "bg-line-bright"
                            : "bg-line"
                      }`}
                      aria-hidden
                    />
                    {stage.label}
                  </a>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 border-t border-line pt-5">
            <p className="label">Next</p>
            <Link
              href={
                project.briefs[0]
                  ? `/create/trailer/${project.briefs[0].id}`
                  : `/create/trailer?project=${project.id}`
              }
              className="mt-2 block text-sm text-gold underline underline-offset-4"
            >
              {project.briefs[0] ? "Open trailer brief" : "Build the trailer"}
            </Link>
            <Link
              href="/develop"
              className="mt-2 block text-sm text-muted underline underline-offset-4 hover:text-paper"
            >
              Hand it to the team
            </Link>
          </div>
        </nav>

        <div className="space-y-14">
          {STAGES.map((stage) => (
            <StageEditor
              key={stage.key}
              projectId={project.id}
              stage={stage}
              content={byKey.get(stage.key)?.content ?? ""}
              status={byKey.get(stage.key)?.status ?? "empty"}
              editable={mine}
            />
          ))}
        </div>
      </div>
    </Container>
  );
}
