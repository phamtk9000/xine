import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Avatar } from "@/components/avatar";
import { DossierBody } from "@/components/dossier";
import { Container, EmptyState, ButtonLink } from "@/components/ui";
import { getDossier, isMonthKey, monthKey, monthRange, shiftMonth } from "@/lib/month";
import { readingFor } from "@/lib/archetype-members";
import { db } from "@/lib/db";

/**
 * One member's month, in public.
 *
 * `/taste` computes this reading and has always been a private page with a
 * query string — which means the most personal, most quotable thing the site
 * writes had no address anybody could send. This is the same dossier at a
 * real URL: no month navigation, because it is not somebody's dashboard, it
 * is one issue about one reader that happens to be readable by anyone.
 *
 * Nothing new becomes public here. Watched films, ratings and reviews are
 * already on the profile this hangs off; the dossier is a reading of them.
 */

async function member(username: string) {
  return db.user.findUnique({
    where: { username },
    select: { id: true, username: true, displayName: true, avatar: true },
  });
}

export async function generateMetadata({
  params,
}: PageProps<"/community/[username]/[month]">): Promise<Metadata> {
  const { username, month } = await params;
  if (!isMonthKey(month)) return {};
  const user = await member(username);
  if (!user) return {};

  return {
    title: `${user.displayName} · ${monthRange(month).label}`,
    description: `What ${user.displayName} watched in ${monthRange(month).label}, and what it says about them.`,
  };
}

export default async function PublicMonthPage({
  params,
}: PageProps<"/community/[username]/[month]">) {
  const { username, month } = await params;
  if (!isMonthKey(month)) notFound();

  const user = await member(username);
  if (!user) notFound();

  // A month that has not happened yet is a 404 rather than an empty issue.
  if (month > monthKey(new Date())) notFound();

  const [dossier, reading] = await Promise.all([
    getDossier(user.id, month),
    readingFor(user.username),
  ]);

  return (
    <div>
      <header className="lifted border-b border-line py-14 sm:py-20">
        <Container>
          <div className="flex flex-wrap items-center gap-5">
            <Avatar user={user} size={56} className="shrink-0" />
            <div>
              <p className="label">
                <Link
                  href={`/community/${user.username}`}
                  className="transition-colors hover:text-paper"
                >
                  {user.displayName}
                </Link>{" "}
                · Issue {month.replace("-", ".")}
              </p>
              <p className="readout mt-1 text-xs text-faint">
                {monthRange(month).label}
              </p>
            </div>
          </div>

          <h1 className="mt-8 max-w-4xl font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
            {dossier.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
            {dossier.standfirst}
          </p>

          <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            <Link
              href={`/community/${user.username}/${shiftMonth(month, -1)}`}
              className="label transition-colors hover:text-paper"
            >
              ← {monthRange(shiftMonth(month, -1)).label}
            </Link>
            <Link
              href={`/community/${user.username}`}
              className="label transition-colors hover:text-paper"
            >
              Their profile →
            </Link>
          </p>
        </Container>
      </header>

      {dossier.any ? (
        <DossierBody dossier={dossier} reading={reading} />
      ) : (
        <Container className="py-20">
          <EmptyState
            title="Nothing logged that month"
            body={`${user.displayName} did not mark anything watched in ${monthRange(month).label}.`}
            action={
              <ButtonLink href={`/community/${user.username}`}>
                Their profile
              </ButtonLink>
            }
          />
        </Container>
      )}
    </div>
  );
}
