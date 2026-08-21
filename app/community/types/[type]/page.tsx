import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container, EmptyState, ButtonLink } from "@/components/ui";
import { ArchetypeCard, ArchetypeGlyph } from "@/components/archetype-card";
import { RevealGroup } from "@/components/reveal-group";
import { ARCHETYPES, type ArchetypeKey } from "@/lib/archetype";
import { membersOfType, typeCensus } from "@/lib/archetype-members";
import { getCurrentUser } from "@/lib/session";
import { readingFor } from "@/lib/archetype-members";

function isKey(value: string): value is ArchetypeKey {
  return value in ARCHETYPES;
}

export async function generateMetadata({
  params,
}: PageProps<"/community/types/[type]">): Promise<Metadata> {
  const { type } = await params;
  if (!isKey(type)) return {};
  const a = ARCHETYPES[type];
  return { title: a.name, description: a.epithet };
}

export default async function TypePage({
  params,
}: PageProps<"/community/types/[type]">) {
  const { type } = await params;
  if (!isKey(type)) notFound();

  const a = ARCHETYPES[type];
  const viewer = await getCurrentUser();

  const [members, census, mine] = await Promise.all([
    membersOfType(type, viewer?.username),
    typeCensus(),
    viewer ? readingFor(viewer.username) : Promise.resolve(null),
  ]);

  const isMyType = mine?.archetype.key === type;
  const total = census.find((c) => c.key === type)?.count ?? 0;

  return (
    <div>
      <header className="border-b border-line py-14 sm:py-20">
        <Container>
          <Link href="/community/types" className="label hover:text-paper">
            ← All types
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <ArchetypeGlyph archetype={a} size={72} />
            <div>
              <h1
                className="font-display text-5xl leading-none tracking-tight sm:text-7xl"
                style={{ color: a.color }}
              >
                {a.name}
              </h1>
              <p className="mt-3 font-display text-2xl text-muted italic">
                &ldquo;{a.epithet}&rdquo;
              </p>
            </div>
          </div>

          <p className="mt-8 max-w-2xl text-base leading-relaxed text-muted">
            {a.blurb}
          </p>
          <p
            className="mt-5 max-w-2xl border-l-2 pl-5 text-base leading-relaxed text-faint"
            style={{ borderColor: a.color }}
          >
            {a.blindSpot}
          </p>

          <p className="mt-8 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint">
            {total} {total === 1 ? "reader reads" : "readers read"} this way
            {isMyType && " · including you"}
          </p>
        </Container>
      </header>

      <Container className="py-14">
        {isMyType && mine && (
          <div className="mb-12 max-w-xl">
            <ArchetypeCard reading={mine} />
          </div>
        )}

        <h2 className="label border-b border-line pb-3">
          {isMyType ? "Others of your type" : "Readers of this type"} ·{" "}
          {members.length}
        </h2>

        {members.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="Nobody else yet"
              body={
                isMyType
                  ? "You are the only one reading this way so far. As more people rate on the breakdown, this fills in."
                  : "No one has rated enough on the breakdown to read as this type yet."
              }
              action={<ButtonLink href="/community">Browse the community</ButtonLink>}
            />
          </div>
        ) : (
          <>
            <RevealGroup selector="[data-type-members]" />
            <ul
              data-type-members
              className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {members.map((m) => (
                <li key={m.username}>
                  <Link
                    href={`/community/${m.username}`}
                    className="group block h-full rounded-xl border border-line p-6 transition-colors hover:border-faint"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-display text-2xl leading-tight transition-colors group-hover:text-gold">
                        {m.displayName}
                      </p>
                      <span
                        className="font-sans text-xs tabular-nums"
                        style={{ color: a.color }}
                      >
                        {m.lean > 0 ? `+${m.lean.toFixed(1)}` : "—"}
                      </span>
                    </div>
                    <p className="mt-1 label">@{m.username}</p>
                    {m.bio && (
                      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">
                        {m.bio}
                      </p>
                    )}
                    <p className="mt-4 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint">
                      {m.watched} rated
                      {m.average !== null && ` · averages ${m.average.toFixed(1)}`}
                      {m.location && ` · ${m.location}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Container>
    </div>
  );
}
