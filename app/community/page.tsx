import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink, Container, PageHeader, relativeTime } from "@/components/ui";
import { listMembers, recentActivity } from "@/lib/profile";
import { parseJson } from "@/lib/serialize";
import { getCurrentUser } from "@/lib/session";
import { Avatar } from "@/components/avatar";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Community",
  description:
    "What people are watching, rating and arguing about on xine right now.",
};

const VERBS: Record<string, string> = {
  rated: "rated",
  reviewed: "reviewed",
  watchlisted: "added to their watchlist",
  watched: "watched",
  liked: "liked",
  listed: "published a list",
  pitched: "started a film",
};

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

  const [activity, members] = await Promise.all([
    recentActivity(50, following ? { followedBy: viewer!.id } : {}),
    listMembers(),
  ]);

  return (
    <>
      <PageHeader
        label="Community"
        title="What everyone is watching."
        lede="Ratings, reviews and lists as they happen. Follow the arguments, not the algorithm."
        action={<ButtonLink href="/sign-up" variant="outline">Join</ButtonLink>}
      />

      <Container className="py-14">
        <div className="grid gap-14 lg:grid-cols-[1fr_20rem]">
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
            {following && activity.length === 0 && (
              <p className="py-10 text-sm leading-relaxed text-muted">
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
              </p>
            )}

            <ul className="mt-2">
              {activity.map((item) => {
                const payload = parseJson<{ overall?: number; title?: string }>(
                  item.payload,
                  {},
                );
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line py-4 text-sm last:border-0"
                  >
                    <Link
                      href={`/community/${item.user.username}`}
                      className="flex items-center gap-2 font-medium transition-colors hover:text-gold"
                    >
                      <Avatar user={item.user} size={20} />
                      {item.user.displayName}
                    </Link>
                    <span className="text-muted">
                      {VERBS[item.type] ?? item.type}
                    </span>
                    {item.film && (
                      <Link
                        href={`/films/${item.film.slug}`}
                        className="text-paper transition-colors hover:text-gold"
                      >
                        {item.film.title}
                      </Link>
                    )}
                    {item.type === "listed" && payload.title && (
                      <span className="text-paper">{payload.title}</span>
                    )}
                    {item.type === "pitched" && payload.title && (
                      <span className="text-paper">{payload.title}</span>
                    )}
                    {payload.overall !== undefined && (
                      <span className="font-sans text-xs text-gold tabular-nums">
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
          </section>

          <aside>
            <div className="flex items-baseline justify-between border-b border-line pb-3">
              <h2 className="label">Members</h2>
              <Link href="/community/members" className="label hover:text-paper">
                All →
              </Link>
            </div>
            <ul className="mt-5 space-y-5">
              {members.map((member) => (
                <li key={member.username}>
                  <Link
                    href={`/community/${member.username}`}
                    className="group block"
                  >
                    <p className="text-sm font-medium transition-colors group-hover:text-gold">
                      {member.displayName}
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      {member.watched} films
                      {member.average !== null &&
                        ` · avg ${member.average.toFixed(1)}`}
                      {member.location ? ` · ${member.location}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </Container>
    </>
  );
}
