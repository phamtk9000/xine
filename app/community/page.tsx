import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink, Container, PageHeader, relativeTime } from "@/components/ui";
import { listMembers, recentActivity, weekPulse } from "@/lib/profile";
import { parseJson } from "@/lib/serialize";
import { getCurrentUser } from "@/lib/session";
import { Avatar } from "@/components/avatar";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Community",
  description:
    "What people are watching, rating and arguing about on xine right now.",
};

/**
 * The community page, grouped rather than streamed.
 *
 * It used to be fifty rows in one undifferentiated column: a rating, a
 * review, a published list and a film someone started making all rendered
 * identically, in one unbroken run, with nothing to tell you whether the
 * thing at the top happened an hour ago or in March. A feed that long with
 * no structure is not a feed, it is a log — you read the first three rows
 * and stop.
 *
 * Three things give it a shape. A pulse at the top says whether anything is
 * going on at all, which is the question somebody arriving actually has.
 * The rows are cut into days, so "today" is a place rather than a
 * calculation. And each kind of activity is marked, because "rated" and
 * "published a list" are different events and looking identical was the
 * reason none of them registered.
 */

/** What each activity type is called, and the colour it is marked in. */
const KINDS: Record<string, { verb: string; tone: string }> = {
  rated: { verb: "rated", tone: "text-gold" },
  reviewed: { verb: "reviewed", tone: "text-accent" },
  listed: { verb: "published", tone: "text-paper" },
  pitched: { verb: "started making", tone: "text-paper" },
  watched: { verb: "watched", tone: "text-muted" },
  liked: { verb: "liked", tone: "text-muted" },
  watchlisted: { verb: "saved", tone: "text-muted" },
};

/**
 * Time buckets that coarsen with age.
 *
 * Grouping strictly by day is right for a busy feed and absurd for a quiet
 * one — the first version of this produced forty-one headers for sixty rows,
 * which is more chrome than content and reads as a site pretending to be
 * busier than it is. So recent activity keeps its day, and anything past this
 * week collapses into its month. A reader scanning for "what happened lately"
 * gets precision where it matters and a shape everywhere else.
 */
function bucketLabel(date: Date) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor((midnight.getTime() - date.getTime()) / 86400000) + 1;

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString("en-GB", { weekday: "long" });

  return date.toLocaleDateString("en-GB", {
    month: "long",
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

export default async function CommunityPage({
  searchParams,
}: PageProps<"/community">) {
  const params = await searchParams;
  const wantsFollowing =
    (Array.isArray(params.feed) ? params.feed[0] : params.feed) === "following";

  const viewer = await getCurrentUser();
  const followingCount = viewer
    ? await db.follow.count({ where: { followerId: viewer.id } })
    : 0;
  const following = wantsFollowing && !!viewer;

  const [activity, members, pulse] = await Promise.all([
    recentActivity(60, following ? { followedBy: viewer!.id } : {}),
    listMembers(),
    weekPulse(),
  ]);

  // Cut into days in one pass, preserving the order the query returned.
  const days: { label: string; items: typeof activity }[] = [];
  for (const item of activity) {
    const label = bucketLabel(item.createdAt);
    const current = days.at(-1);
    if (current?.label === label) current.items.push(item);
    else days.push({ label, items: [item] });
  }

  return (
    <>
      <PageHeader
        label="Community"
        title="What everyone is watching."
        lede="Ratings, reviews and lists as they happen. Follow the arguments, not the algorithm."
        action={
          viewer ? null : (
            <ButtonLink href="/sign-up" variant="outline">
              Join
            </ButtonLink>
          )
        }
      />

      <Container className="py-14">
        {/* The pulse. Four numbers whose shape says more than their size — a
            week of forty ratings and no reviews is a different room from one
            with four of each. */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-b border-line pb-10 sm:grid-cols-4">
          {[
            { n: pulse.rated, label: "ratings", note: "this week" },
            { n: pulse.reviewed, label: "reviews", note: "written" },
            { n: pulse.listed, label: "lists", note: "published" },
            { n: pulse.people, label: "members", note: "active" },
          ].map((stat) => (
            <div key={stat.label}>
              <dt className="font-display text-4xl leading-none tabular-nums">
                {stat.n}
              </dt>
              <dd className="label mt-2">{stat.label}</dd>
              <dd className="mt-1 text-xs text-faint">{stat.note}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-12 grid gap-14 lg:grid-cols-[1fr_18rem]">
          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-3">
              <h2 className="label">
                {following ? "From people you follow" : "Recent activity"}
              </h2>
              {viewer && (
                <div className="flex items-center gap-4">
                  <Link
                    href="/community"
                    className={`label transition-colors hover:text-paper ${
                      following ? "" : "!text-paper"
                    }`}
                  >
                    Everyone
                  </Link>
                  <Link
                    href="/community?feed=following"
                    className={`label transition-colors hover:text-paper ${
                      following ? "!text-paper" : ""
                    }`}
                  >
                    Following
                    <span className="readout ml-2 text-faint">
                      {followingCount}
                    </span>
                  </Link>
                </div>
              )}
            </div>

            {activity.length === 0 && (
              <p className="py-10 text-sm leading-relaxed text-muted">
                {following ? (
                  <>
                    Nobody you follow has done anything yet. Find people whose
                    taste is close to yours on{" "}
                    <Link
                      href="/community/members"
                      className="text-gold underline underline-offset-4"
                    >
                      the members page
                    </Link>
                    , or read{" "}
                    <Link
                      href="/community"
                      className="text-gold underline underline-offset-4"
                    >
                      everyone
                    </Link>
                    .
                  </>
                ) : (
                  "Nothing yet. Rate something and you will be the first."
                )}
              </p>
            )}

            {days.map((day) => (
              <div key={day.label} className="mt-8 first:mt-6">
                <h3 className="label sticky top-16 z-10 bg-ink/90 py-2 !text-[0.5625rem] backdrop-blur">
                  {day.label}
                </h3>

                <ul>
                  {day.items.map((item) => {
                    const payload = parseJson<{
                      overall?: number;
                      title?: string;
                    }>(item.payload, {});
                    const kind = KINDS[item.type] ?? {
                      verb: item.type,
                      tone: "text-muted",
                    };

                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line py-3.5 text-sm last:border-0"
                      >
                        <Link
                          href={`/community/${item.user.username}`}
                          className="flex items-center gap-2 font-medium transition-colors hover:text-gold"
                        >
                          <Avatar user={item.user} size={20} />
                          {item.user.displayName}
                        </Link>

                        <span className={`font-sans text-xs ${kind.tone}`}>
                          {kind.verb}
                        </span>

                        {item.film && (
                          <Link
                            href={`/films/${item.film.slug}`}
                            className="text-paper transition-colors hover:text-gold"
                          >
                            {item.film.title}
                          </Link>
                        )}
                        {(item.type === "listed" || item.type === "pitched") &&
                          payload.title && (
                            <span className="text-paper">{payload.title}</span>
                          )}
                        {payload.overall !== undefined && (
                          <span className="readout text-xs text-gold tabular-nums">
                            {payload.overall.toFixed(1)}
                          </span>
                        )}

                        <span className="ml-auto text-xs text-faint">
                          {relativeTime(item.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <h2 className="label">Members</h2>
              <Link href="/community/members" className="label hover:text-paper">
                All →
              </Link>
            </div>
            <ul className="mt-5 space-y-4">
              {members.slice(0, 8).map((member) => (
                <li key={member.username}>
                  <Link
                    href={`/community/${member.username}`}
                    className="group flex items-center gap-3"
                  >
                    <Avatar user={member} size={32} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium transition-colors group-hover:text-gold">
                        {member.displayName}
                      </span>
                      <span className="block truncate text-xs text-faint">
                        {member.watched} films
                        {member.average !== null &&
                          ` · avg ${member.average.toFixed(1)}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {!viewer && (
              <div className="mt-8 border-t border-line pt-6">
                <p className="text-sm leading-relaxed text-muted">
                  Rate on six axes, keep a watchlist, build lists and argue
                  with the ones already here.
                </p>
                <ButtonLink href="/sign-up" variant="outline" className="mt-4">
                  Join
                </ButtonLink>
              </div>
            )}
          </aside>
        </div>
      </Container>
    </>
  );
}
