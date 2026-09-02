import Link from "next/link";
import type { Metadata } from "next";
import { Poster } from "@/components/poster";
import {
  ButtonLink,
  Container,
  PageHeader,
  SectionHeading,
} from "@/components/ui";
import { db } from "@/lib/db";
import { SHELVES } from "@/lib/collections";

export const metadata: Metadata = {
  title: "Lists",
  description:
    "Ten editorial collections, seventy-two lists, and whatever the members have built — films grouped by an argument rather than a genre.",
};

/**
 * The lists hub, in three tiers.
 *
 * The shelves come first and take the most room, because seventy-two lists
 * rendered flat is a directory rather than a page — nobody scrolls a
 * directory looking for something to watch tonight. A shelf is the unit a
 * reader arrives with ("something dark", "something about money") and the
 * eight lists inside it are the ways of answering that.
 *
 * The one-off editorial lists that belong to no shelf keep their own row
 * rather than being forced onto one, and member lists close the page.
 */

async function loadShelves() {
  const lists = await db.filmList.findMany({
    where: { collection: { not: null } },
    orderBy: [{ collection: "asc" }, { position: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      collection: true,
      _count: { select: { entries: true } },
      entries: {
        orderBy: { position: "asc" },
        // Four deep so the strip below can skip a film another list on the
        // same shelf already used — the lists overlap heavily by design.
        take: 4,
        select: {
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
    },
  });

  return SHELVES.map((shelf) => {
    const mine = lists.filter((list) => list.collection === shelf.slug);
    // One poster per list, so the strip samples the whole shelf rather than
    // showing eight frames of whichever list comes first — and never the
    // same film twice. Half the lists on a shelf open with the same title
    // (three of the eight crime lists start with The Godfather), so taking
    // entry zero from each would draw the strip as a stutter.
    const used = new Set<string>();
    const posters = mine
      .map((list) => {
        const pick = list.entries.find((entry) => !used.has(entry.film.slug));
        if (pick) used.add(pick.film.slug);
        return pick?.film ?? null;
      })
      .filter((film): film is NonNullable<typeof film> => film !== null);

    return {
      ...shelf,
      lists: mine,
      films: mine.reduce((sum, list) => sum + list._count.entries, 0),
      posters,
    };
  }).filter((shelf) => shelf.lists.length > 0);
}

async function loadLoose(editorial: boolean) {
  return db.filmList.findMany({
    where: { editorial, collection: null },
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

type ListWithEntries = Awaited<ReturnType<typeof loadLoose>>[number];

export default async function ListsPage() {
  const [shelves, editorial, community] = await Promise.all([
    loadShelves(),
    loadLoose(true),
    loadLoose(false),
  ]);

  const totalLists = shelves.reduce((sum, shelf) => sum + shelf.lists.length, 0);

  return (
    <>
      <PageHeader
        label="Lists"
        title="Films grouped by an argument."
        lede="Ten collections and the lists inside them, plus whatever the members have built. Every list is a claim about what belongs next to what — not a genre, not a decade, and never a ranking of everything."
        action={
          <ButtonLink href="/lists/new" variant="outline">
            Build a list
          </ButtonLink>
        }
      />

      <Container className="py-14">
        <SectionHeading
          label="From us"
          title={`${shelves.length} collections, ${totalLists} lists`}
        />

        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
          {shelves.map((shelf) => (
            <Link
              key={shelf.slug}
              href={`/collections/${shelf.slug}`}
              className="group block"
            >
              {/* A row of spines, one per list on the shelf. */}
              <div className="flex gap-1.5">
                {shelf.posters.map((film, i) => (
                  <div key={`${film.slug}-${i}`} className="w-[12.5%]">
                    <Poster film={film} sizes="90px" />
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-line pt-4">
                <h3 className="font-display text-2xl leading-tight transition-colors group-hover:text-gold sm:text-3xl">
                  {shelf.name}
                </h3>
                <p className="label shrink-0">
                  {shelf.lists.length} lists · {shelf.films} films
                </p>
              </div>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
                {shelf.blurb}
              </p>
              {/* The eight arguments, named. The posters say what the shelf
                  looks like and the blurb says what it is about, but the
                  lists themselves are the thing somebody is choosing
                  between — and they were invisible until you clicked. */}
              <p className="mt-3 text-xs leading-relaxed text-faint">
                {shelf.lists.map((list) => list.title).join("  ·  ")}
              </p>
            </Link>
          ))}
        </div>

        {editorial.length > 0 && (
          <div className="mt-24">
            <SectionHeading label="Also from us" title="One-off lists" />
            <div className="grid gap-10 md:grid-cols-2">
              {editorial.map((list) => (
                <ListCard key={list.id} list={list} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-24">
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
      className="group block rounded-[4px] border border-line p-6 transition-colors hover:border-line-bright"
    >
      <div className="flex items-center gap-3">
        {list.editorial ? (
          <span className="label !text-gold">Editorial</span>
        ) : (
          list.owner && <span className="label">{list.owner.displayName}</span>
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
