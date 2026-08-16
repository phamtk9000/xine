import Link from "next/link";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { listMembers } from "@/lib/profile";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const members = await listMembers();

  return (
    <>
      <PageHeader
        label="Community"
        title="Members."
        lede="Everyone keeping a record here, and what their ratings say about them."
      />

      <Container className="py-14">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <Link
              key={member.username}
              href={`/community/${member.username}`}
              className="group rounded-xl border border-line p-6 transition-colors hover:border-line-bright"
            >
              <p className="font-display text-3xl leading-none transition-colors group-hover:text-gold">
                {member.displayName}
              </p>
              <p className="label mt-2">@{member.username}</p>
              {member.bio && (
                <p className="mt-4 text-sm leading-relaxed text-muted">
                  {member.bio}
                </p>
              )}
              <dl className="mt-6 flex gap-6 border-t border-line pt-4">
                <Stat label="Films" value={String(member.watched)} />
                <Stat
                  label="Average"
                  value={member.average === null ? "—" : member.average.toFixed(1)}
                />
                <Stat label="Reviews" value={String(member.reviews)} />
                <Stat label="Lists" value={String(member.lists)} />
              </dl>
            </Link>
          ))}
        </div>
      </Container>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-paper tabular-nums">{value}</dd>
    </div>
  );
}
