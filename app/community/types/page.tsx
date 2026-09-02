import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { ArchetypeGlyph } from "@/components/archetype-card";
import { RevealGroup } from "@/components/reveal-group";
import { ARCHETYPES, type ArchetypeKey } from "@/lib/archetype";
import { typeCensus, readingFor } from "@/lib/archetype-members";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "The six types",
  description:
    "Six ways of watching, derived from how people rate rather than what they say.",
};

export default async function TypesPage() {
  const viewer = await getCurrentUser();
  const [census, mine] = await Promise.all([
    typeCensus(),
    viewer ? readingFor(viewer.username) : Promise.resolve(null),
  ]);

  return (
    <div>
      <header className="border-b border-line py-14 sm:py-20">
        <Container>
          <p className="label">Community</p>
          <h1 className="mt-5 max-w-3xl font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
            Six ways of watching
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted">
            Nobody picks a type. Each one is read off how you actually score
            films on the five axes, so it shifts as your taste does — and every
            figure comes with the thing that taste costs you.
          </p>
        </Container>
      </header>

      <Container className="py-14">
        <RevealGroup selector="[data-types]" />
        <ul data-types className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(ARCHETYPES) as ArchetypeKey[]).map((key) => {
            const a = ARCHETYPES[key];
            const count = census.find((c) => c.key === key)?.count ?? 0;
            const isMine = mine?.archetype.key === key;
            return (
              <li key={key}>
                <Link
                  href={`/community/types/${key}`}
                  className="group block h-full rounded-[4px] border p-6 transition-colors hover:bg-ink-raised"
                  style={{ borderColor: isMine ? a.color : "var(--color-line)" }}
                >
                  <div className="flex items-center justify-between">
                    <ArchetypeGlyph archetype={a} size={44} />
                    {isMine && (
                      <span
                        className="font-sans text-[0.625rem] tracking-[0.16em] uppercase"
                        style={{ color: a.color }}
                      >
                        You
                      </span>
                    )}
                  </div>
                  <p className="mt-5 font-display text-3xl leading-none">
                    {a.name}
                  </p>
                  <p className="mt-3 font-display text-lg leading-snug text-muted italic">
                    &ldquo;{a.epithet}&rdquo;
                  </p>
                  <p className="mt-5 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint">
                    {count} {count === 1 ? "reader" : "readers"}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </div>
  );
}
