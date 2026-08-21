import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ButtonLink, Container } from "@/components/ui";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { BEATS, creativeDirection, parseReferences, storyboard } from "@/lib/trailer";

export const metadata: Metadata = { title: "Trailer brief" };

export default async function BriefPage({
  params,
}: PageProps<"/create/trailer/[id]">) {
  const { id } = await params;
  const [brief, user] = await Promise.all([
    db.trailerBrief.findUnique({
      where: { id },
      include: { project: { select: { id: true, title: true } } },
    }),
    getCurrentUser(),
  ]);

  if (!brief || brief.ownerId !== user?.id) notFound();

  const direction = creativeDirection(brief.genre);
  const { films, visual } = parseReferences(brief);
  const shots = storyboard(brief.title, brief.logline);

  return (
    <Container className="py-14">
      <header className="border-b border-line pb-10">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/create/trailer" className="label hover:text-paper">
            ← Trailer Studio
          </Link>
          <span className="label !text-gold">{brief.genre}</span>
          {brief.project && (
            <Link
              href={`/create/projects/${brief.project.id}`}
              className="text-xs text-faint underline underline-offset-4"
            >
              {brief.project.title}
            </Link>
          )}
        </div>

        <h1 className="mt-5 font-display text-5xl leading-[0.95] tracking-tight uppercase sm:text-7xl">
          {brief.title}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          {brief.logline}
        </p>

        {(films.length > 0 || visual.length > 0) && (
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {films.length > 0 && (
              <div>
                <p className="label">Film references</p>
                <p className="mt-2 text-sm text-paper">{films.join(" · ")}</p>
              </div>
            )}
            {visual.length > 0 && (
              <div>
                <p className="label">Visual references</p>
                <ul className="mt-2 space-y-1">
                  {visual.map((line) => (
                    <li key={line} className="text-sm text-muted">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </header>

      <section className="border-b border-line py-12">
        <p className="label">01 — Creative direction</p>
        <dl className="mt-7 grid gap-x-12 gap-y-8 md:grid-cols-2">
          <Row label="Palette" value={direction.palette} />
          <Row label="Lighting" value={direction.light} />
          <Row label="Cinematography" value={direction.camera} />
          <Row label="Production design" value={direction.design} />
          <Row label="Sound" value={direction.sound} />
          <Row label="What to withhold" value={direction.withhold} />
        </dl>
      </section>

      <section className="border-b border-line py-12">
        <p className="label">02 — Storyboard</p>
        <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {shots.map((shot) => (
            <div
              key={shot.n}
              className="rounded-lg border border-line bg-ink-raised p-5"
            >
              <p className="font-sans text-xs text-faint tabular-nums">
                Shot {String(shot.n).padStart(2, "0")}
              </p>
              <p className="mt-3 text-sm text-paper">{shot.shot}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                {shot.note}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-line py-12">
        <p className="label">03 — Trailer script</p>
        <div className="mt-7 max-w-3xl">
          {BEATS.map((beat) => (
            <div
              key={beat.label}
              className="grid grid-cols-[7rem_1fr] gap-6 border-b border-line py-5 last:border-0"
            >
              <span className="font-sans text-xs text-gold tabular-nums">
                {beat.from}–{beat.to}
              </span>
              <div>
                <p className="text-sm text-paper">{beat.label}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {beat.intent}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-12">
        <p className="label">04 — Concept trailer</p>
        <div className="mt-7 max-w-2xl rounded-xl border border-dashed border-line p-8">
          <p className="font-display text-3xl leading-tight">
            This is where it stops being a document.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Everything above is a starting structure — genre craft, not a
            creative decision, and it is meant to be argued with. Turning it
            into sixty to a hundred and twenty seconds of finished film is a
            production job, and it is the one thing on xine we do with people
            rather than software.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/develop/concept-trailer">
              Get it made →
            </ButtonLink>
            <ButtonLink href="/develop" variant="outline">
              All services
            </ButtonLink>
          </div>
        </div>
      </section>
    </Container>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-2 text-sm leading-relaxed text-paper/90">{value}</dd>
    </div>
  );
}
