import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container, EmptyState, ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import {
  getDossier,
  isMonthKey,
  monthKey,
  monthRange,
  shiftMonth,
} from "@/lib/month";
import { readingFor } from "@/lib/archetype-members";
import { DossierBody } from "@/components/dossier";

export const metadata: Metadata = {
  title: "Your month in film",
  description: "A monthly read on what you watched and what it says about you.",
};

export default async function TastePage({
  searchParams,
}: PageProps<"/taste">) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?next=/taste");

  const { m } = await searchParams;
  const requested = typeof m === "string" && isMonthKey(m) ? m : null;
  const thisMonth = monthKey(new Date());
  const key = requested ?? thisMonth;

  const [dossier, reading] = await Promise.all([
    getDossier(user.id, key),
    readingFor(user.username),
  ]);
  const previous = shiftMonth(key, -1);
  const next = shiftMonth(key, 1);
  // Never offer a month that hasn't happened.
  const canGoForward = next <= thisMonth;

  return (
    <div>
      {/* The cover. An issue of a magazine about one reader. */}
      <header className="border-b border-line py-14 sm:py-20">
        <Container>
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <p className="label">
              {user.displayName} · Issue {key.replace("-", ".")}
            </p>
            <nav className="flex items-center gap-4" aria-label="Month">
              <MonthLink to={previous} label="← Previous" />
              {key !== thisMonth && <MonthLink to={thisMonth} label="This month" />}
              {canGoForward && key !== thisMonth && (
                <MonthLink to={next} label="Next →" />
              )}
            </nav>
          </div>

          <h1 className="mt-6 max-w-4xl font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
            {dossier.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
            {dossier.standfirst}
          </p>
          <p className="mt-4 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint">
            {monthRange(key).label}
          </p>

          {/* The private read is this page; the version with a URL somebody
              else can open is the public one, which shows the same dossier
              without the month navigation. */}
          {dossier.any && (
            <p className="mt-6 text-xs text-faint">
              Shareable:{" "}
              <Link
                href={`/community/${user.username}/${key}`}
                className="text-gold underline underline-offset-4"
              >
                /community/{user.username}/{key}
              </Link>
            </p>
          )}
        </Container>
      </header>

      {!dossier.any ? (
        <Container className="py-20">
          <EmptyState
            title="Nothing logged this month"
            body="Mark films watched as you go and this page writes itself — what you rewarded, where you disagreed with everyone else, and which of your likes your own ratings can't justify."
            action={<ButtonLink href="/films">Browse the catalogue</ButtonLink>}
          />
        </Container>
      ) : (
        <>
          <DossierBody dossier={dossier} reading={reading} />
        </>
      )}
    </div>
  );
}

function MonthLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      href={`/taste?m=${to}`}
      className="label transition-colors hover:text-paper"
    >
      {label}
    </Link>
  );
}

