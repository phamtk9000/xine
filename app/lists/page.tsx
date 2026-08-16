import Link from "next/link";
import type { Metadata } from "next";
import { Poster } from "@/components/poster";
import { ButtonLink, Container, PageHeader, SectionHeading } from "@/components/ui";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Lists",
  description:
    "Editorial collections and community lists — films grouped by an argument rather than a genre.",
};

async function loadLists(editorial: boolean) {
  return db.filmList.findMany({
    where: { editorial },
    orderBy: { createdAt: "desc" },
    include: {
      owner: { select: { username: true, displayName: true } },
      entries: {
        orderBy: { position: "asc" },
        take: 5,
        include: {
          film: {
            select: {
              slug: true,
              title: true,
              year: true,
              director: true,
              posterUrl: true,
            },
          },
        },
      },
      _count: { select: { entries: true } },
    },
  });
}

type ListWithEntries = Awaited<ReturnType<typeof loadLists>>[number];

export default async function ListsPage() {
  const [editorial, community] = await Promise.all([
    loadLists(true),
    loadLists(false),
  ]);

  return (
    <>
      <PageHeader
        label="Lists"
        title="Films grouped by an argument."
        lede="Editorial collections from us, and lists built by people who watch too much. Every list is a claim about what belongs next to what."
        action={
          <ButtonLink href="/lists/new" variant="outline">
            Build a list
          </ButtonLink>
        }
      />

      <Container className="py-14">
        <SectionHeading label="From us" title="Editorial collections" />
        <div className="grid gap-10 md:grid-cols-2">
          {editorial.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </div>

        <div className="mt-20">
          <SectionHeading
            label="From members"
            title="Community lists"
            href="/lists/new"
            hrefLabel="Build one"
          />
          <div className="grid gap-10 md:grid-cols-2">
            {community.map((list) => (
              <ListCard key={list.id} list={list} />
            ))}
          </div>
        </div>
      </Container>
    </>
  );
}

function ListCard({ list }: { list: ListWithEntries }) {
  return (
    <Link
      href={`/lists/${list.slug}`}
      className="group block rounded-xl border border-line p-6 transition-colors hover:border-line-bright"
    >
      <div className="flex items-center gap-3">
        {list.editorial ? (
          <span className="label !text-gold">Editorial</span>
        ) : (
          list.owner && (
            <span className="label">{list.owner.displayName}</span>
          )
        )}
        <span className="text-xs text-faint">{list._count.entries} films</span>
      </div>

      <h3 className="mt-3 font-display text-3xl leading-tight transition-colors group-hover:text-gold">
        {list.title}
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        {list.description}
      </p>

      <div className="mt-6 flex gap-2">
        {list.entries.map((entry) => (
          <div key={entry.id} className="w-1/5">
            <Poster film={entry.film} sizes="120px" />
          </div>
        ))}
      </div>
    </Link>
  );
}
