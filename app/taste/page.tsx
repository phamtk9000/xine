import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Poster } from "@/components/poster";
import { Container, EmptyState, ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import {
  getDossier,
  isMonthKey,
  monthKey,
  monthRange,
  shiftMonth,
  type Dossier,
} from "@/lib/month";
import { formatScore } from "@/lib/scores";

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

  const dossier = await getDossier(user.id, key);
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
          <Ledger dossier={dossier} />
          <Lean dossier={dossier} />
          <GutAndJudgement dossier={dossier} />
          <Contrarian dossier={dossier} />
          <TheMap dossier={dossier} />
          <Reel dossier={dossier} />
          <Prescription dossier={dossier} />
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

function Band({
  label,
  children,
  light = false,
}: {
  label: string;
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <section
      className={`border-b border-line py-14 ${light ? "section-light" : ""}`}
    >
      <Container>
        <h2 className="label border-b border-line pb-3">{label}</h2>
        <div className="mt-8">{children}</div>
      </Container>
    </section>
  );
}

function Ledger({ dossier }: { dossier: Dossier }) {
  const { counts } = dossier;
  // Rounded, not floored — the standfirst rounds, and the two numbers
  // sit inches apart on the page.
  const hours = Math.round(counts.minutes / 60);
  const stats = [
    { value: String(counts.watched), label: "Watched" },
    { value: `${hours}h`, label: "In the dark" },
    { value: String(counts.liked), label: "Liked" },
    { value: String(counts.rated), label: "Rated" },
  ];

  return (
    <section className="border-b border-line py-12">
      <Container>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dd className="font-display text-6xl leading-none tracking-tight text-gold tabular-nums">
                {stat.value}
              </dd>
              <dt className="label mt-3">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

function Lean({ dossier }: { dossier: Dossier }) {
  if (!dossier.lean) {
    return (
      <Band label="What you rewarded">
        <p className="max-w-xl text-sm leading-relaxed text-muted">
          You rated this month, but not on the breakdown — so there is nothing
          yet to say <em>why</em> a film worked for you. Open the breakdown on
          your next rating and this section fills in.
        </p>
      </Band>
    );
  }

  const max = Math.max(
    ...dossier.axes.flatMap((a) => [a.month ?? 0, a.prior ?? 0]),
    1,
  );

  return (
    <Band label="What you rewarded">
      <div className="grid gap-12 lg:grid-cols-[1fr_20rem]">
        <div className="max-w-xl">
          <p className="font-display text-4xl leading-tight">
            {dossier.drift}
          </p>

          <div className="mt-10 space-y-5">
            {dossier.axes.map((axis) => (
              <div key={axis.key}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-paper">{axis.label}</span>
                  <span className="font-sans text-xs text-faint tabular-nums">
                    {formatScore(axis.month)}
                    <span className="ml-2 text-faint/60">
                      before {formatScore(axis.prior)}
                    </span>
                  </span>
                </div>
                {/* Two bars on one track: the month in gold, the all-time
                    average as a hairline behind it, so the drift is the
                    distance between them rather than a number to compare. */}
                <div className="relative mt-2 h-1.5 rounded-full bg-line">
                  {axis.prior !== null && (
                    <span
                      className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-faint"
                      style={{ left: `${(axis.prior / max) * 100}%` }}
                      aria-hidden="true"
                    />
                  )}
                  {axis.month !== null && (
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-gold"
                      style={{ width: `${(axis.month / max) * 100}%` }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-faint">
            Gold is this month. The notch is your average on that axis before
            this month began.
          </p>
        </div>

        <aside className="rounded-xl border border-line p-6">
          <p className="label">This month&rsquo;s lean</p>
          <p className="mt-4 font-display text-5xl leading-none text-gold">
            {dossier.lean.label}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            {dossier.lean.value > 0
              ? `Scored ${dossier.lean.value.toFixed(1)} above your own average across the other axes.`
              : "Barely ahead of the other axes — a balanced month."}
          </p>
        </aside>
      </div>
    </Band>
  );
}

function GutAndJudgement({ dossier }: { dossier: Dossier }) {
  const { guiltyPleasures, admired } = dossier;
  if (!guiltyPleasures.length && !admired.length) return null;

  return (
    <Band label="Gut against judgement">
      <p className="max-w-2xl text-base leading-relaxed text-muted">
        A like is a reflex; a rating is an argument. Where the two disagree is
        the only place this page can tell you something you didn&rsquo;t
        already know.
      </p>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <Split
          title="Liked anyway"
          note="You liked these, then scored them below your own average."
          films={guiltyPleasures}
          tone="var(--color-gold)"
          empty="Nothing this month your ratings couldn't justify."
        />
        <Split
          title="Admired, not loved"
          note="You scored these highly and still didn't reach for the heart."
          films={admired}
          tone="var(--color-accent)"
          empty="Everything you rated highly, you also liked."
        />
      </div>
    </Band>
  );
}

function Split({
  title,
  note,
  films,
  tone,
  empty,
}: {
  title: string;
  note: string;
  films: Dossier["guiltyPleasures"];
  tone: string;
  empty: string;
}) {
  return (
    <div>
      <p
        className="font-sans text-[0.625rem] tracking-[0.16em] uppercase"
        style={{ color: tone }}
      >
        {title}
      </p>
      <p className="mt-2 text-sm text-muted">{note}</p>
      {films.length === 0 ? (
        <p className="mt-5 text-sm text-faint">{empty}</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {films.map((film) => (
            <li key={film.slug}>
              <Link
                href={`/films/${film.slug}`}
                className="group flex items-baseline gap-4"
              >
                <span className="font-display text-2xl leading-tight transition-colors group-hover:text-gold">
                  {film.title}
                </span>
                <span className="text-xs text-faint">{film.year}</span>
                <span className="ml-auto font-sans text-sm tabular-nums" style={{ color: tone }}>
                  {formatScore(film.mine)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Contrarian({ dossier }: { dossier: Dossier }) {
  const c = dossier.contrarian;
  if (!c) return null;

  const above = c.gap > 0;
  const size = Math.abs(c.gap);
  const verdict =
    size < 0.3
      ? "You landed almost exactly where everyone else did."
      : above
        ? `You ran ${size.toFixed(1)} above the room.`
        : `You ran ${size.toFixed(1)} below the room.`;

  return (
    <Band label="Against the room" light>
      <div className="grid gap-12 lg:grid-cols-[1fr_22rem]">
        <p className="max-w-2xl font-display text-4xl leading-tight">
          {verdict}
        </p>

        {c.sharpest && c.sharpest.mine !== null && c.sharpest.room !== null && (
          <aside className="rounded-xl border border-line p-6">
            <p className="label">Sharpest disagreement</p>
            <Link
              href={`/films/${c.sharpest.slug}`}
              className="mt-3 block font-display text-3xl leading-tight transition-colors hover:text-gold"
            >
              {c.sharpest.title}
            </Link>
            <div className="mt-5 flex items-baseline gap-6">
              <span>
                <span className="font-display text-3xl text-gold tabular-nums">
                  {formatScore(c.sharpest.mine)}
                </span>
                <span className="label ml-2">You</span>
              </span>
              <span>
                <span className="font-display text-3xl text-muted tabular-nums">
                  {formatScore(c.sharpest.room)}
                </span>
                <span className="label ml-2">
                  {c.sharpest.roomCount} others
                </span>
              </span>
            </div>
          </aside>
        )}
      </div>
    </Band>
  );
}

function TheMap({ dossier }: { dossier: Dossier }) {
  const { decades, countries, directors } = dossier;
  const peak = Math.max(...decades.map((d) => d.count), 1);

  return (
    <Band label="Where you went">
      <div className="grid gap-12 lg:grid-cols-[1fr_18rem]">
        <div>
          <p className="label">By decade</p>
          {/* A column per decade the month actually touched — gaps are the
              point, so empty decades are not filled in. */}
          <ul className="mt-6 flex items-end gap-3">
            {decades.map((d) => (
              <li key={d.decade} className="flex-1 text-center">
                <span
                  className="block w-full rounded-t-sm bg-gold/70"
                  style={{ height: `${Math.max(8, (d.count / peak) * 140)}px` }}
                  aria-hidden="true"
                />
                <span className="mt-2 block font-sans text-[0.625rem] tracking-[0.1em] text-faint tabular-nums">
                  {d.decade}s
                </span>
                <span className="block font-sans text-xs text-paper tabular-nums">
                  {d.count}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="space-y-8">
          {countries.length > 0 && (
            <div>
              <p className="label">Countries</p>
              <ul className="mt-4 space-y-2">
                {countries.map((c) => (
                  <li
                    key={c.name}
                    className="flex justify-between text-sm text-muted"
                  >
                    <span>{c.name}</span>
                    <span className="tabular-nums text-faint">{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {directors.length > 0 && (
            <div>
              <p className="label">You went back to</p>
              <ul className="mt-4 space-y-2">
                {directors.map((d) => (
                  <li
                    key={d.name}
                    className="flex justify-between text-sm text-muted"
                  >
                    <span>{d.name}</span>
                    <span className="tabular-nums text-faint">
                      {d.count} films
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </Band>
  );
}

function Reel({ dossier }: { dossier: Dossier }) {
  return (
    <Band label={`The month · ${dossier.counts.watched} films`}>
      <ul className="grid grid-cols-3 gap-5 sm:grid-cols-4 lg:grid-cols-6">
        {dossier.entries.map((film) => (
          <li key={film.slug}>
            <Link href={`/films/${film.slug}`} className="group block">
              <div className="relative">
                <Poster film={{ ...film, director: film.director }} sizes="180px" />
                {film.liked && (
                  <span
                    className="absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink/80"
                    title="You liked this"
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="#e0452e" aria-hidden="true">
                      <path d="M10 17S2.5 12.4 2.5 7.4A4.1 4.1 0 0 1 10 5.2a4.1 4.1 0 0 1 7.5 2.2c0 5-7.5 9.6-7.5 9.6Z" />
                    </svg>
                    <span className="sr-only">Liked</span>
                  </span>
                )}
              </div>
              <p className="mt-2.5 text-sm leading-snug transition-colors group-hover:text-gold">
                {film.title}
              </p>
              {film.mine !== null && (
                <p className="font-sans text-xs text-faint tabular-nums">
                  {formatScore(film.mine)}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Band>
  );
}

function Prescription({ dossier }: { dossier: Dossier }) {
  const p = dossier.prescription;
  if (!p) return null;

  return (
    <section className="py-16">
      <Container>
        <div className="grid items-center gap-10 rounded-xl border border-line bg-ink-raised p-8 sm:grid-cols-[10rem_1fr]">
          <Link href={`/films/${p.slug}`} className="group block w-32 sm:w-40">
            <Poster
              film={{ ...p, director: "" }}
              sizes="160px"
            />
          </Link>
          <div>
            <p className="label">For next month</p>
            <Link
              href={`/films/${p.slug}`}
              className="mt-3 block font-display text-4xl leading-tight transition-colors hover:text-gold"
            >
              {p.title}{" "}
              <span className="text-muted">{p.year}</span>
            </Link>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
              {p.because}
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
