"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { externalMatches, type FilmPick } from "@/lib/catalogue-pick";

export type ListState = { error?: string } | null;

export type { FilmPick };

const PICK_FIELDS = {
  id: true,
  slug: true,
  title: true,
  year: true,
  director: true,
  posterUrl: true,
  kind: true,
} as const;

/** How many hits the picker shows, and how deep it looks to rank them. */
const PICKER_LIMIT = 24;
const PICKER_SCAN = 80;

/**
 * How thin a local result has to be before the search leaves the building.
 *
 * Not zero. A search for "solaris" that finds one Tarkovsky is not a search
 * that failed, but it is one where the reader may well have meant the
 * Soderbergh — and the whole complaint being answered here is that films
 * this site has not imported look, from the outside, like films that do not
 * exist. Asking TMDB whenever the local answer is thin costs one request on
 * a debounced keystroke and nothing at all once the catalogue is deep in
 * that corner.
 */
const LOCAL_ENOUGH = 6;

/**
 * Catalogue search for the list builder.
 *
 * The builder used to be handed the first 300 films alphabetically and filter
 * them in the browser, which meant that in a catalogue of fifteen hundred
 * titles everything past the letter C simply did not exist as far as anyone
 * building a list was concerned. Search belongs on the server for the same
 * reason the catalogue page does it there: the answer depends on rows the
 * browser was never sent.
 *
 * Ranked here rather than by the database, because SQL orders on columns and
 * what matters is *where* the match landed — someone typing "heat" wants
 * Heat, not the eleven films with a cinematographer called Heather. Title
 * beats director, the front of a title beats the middle, and reviewed films
 * edge out imported ones at equal footing, since those are the ones this site
 * has actually written about.
 */
export async function searchCatalogue(query: string): Promise<FilmPick[]> {
  const q = query.trim();

  if (q.length === 0) {
    // The opening shelf: recognisable titles with art, so the picker reads as
    // a catalogue rather than an empty box waiting to be typed into.
    return db.film.findMany({
      where: { posterUrl: { not: null } },
      orderBy: [{ tmdbVotes: "desc" }],
      take: 12,
      select: PICK_FIELDS,
    });
  }

  const rows = await db.film.findMany({
    where: {
      OR: [
        { title: { contains: q } },
        { originalTitle: { contains: q } },
        { director: { contains: q } },
      ],
    },
    orderBy: [{ tmdbVotes: "desc" }],
    take: PICKER_SCAN,
    select: { ...PICK_FIELDS, originalTitle: true, reviewed: true, tmdbVotes: true },
  });

  const needle = q.toLowerCase();
  const rank = (row: (typeof rows)[number]) => {
    const title = row.title.toLowerCase();
    const original = row.originalTitle?.toLowerCase() ?? "";
    if (title === needle || original === needle) return 4;
    if (title.startsWith(needle) || original.startsWith(needle)) return 3;
    if (title.includes(needle) || original.includes(needle)) return 2;
    return 1;
  };

  const local = rows
    .sort(
      (a, b) =>
        rank(b) - rank(a) ||
        Number(b.reviewed) - Number(a.reviewed) ||
        b.tmdbVotes - a.tmdbVotes,
    )
    .slice(0, PICKER_LIMIT)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      year: row.year,
      director: row.director,
      posterUrl: row.posterUrl,
      kind: row.kind,
    }));

  if (local.length >= LOCAL_ENOUGH) return local;

  // Always after the local rows, never mixed in: what this site holds — and
  // has ratings, lists and sometimes a review for — is a better answer than
  // a title it would have to go and fetch, even when the fetched one matches
  // the letters more exactly.
  const external = await externalMatches(q, PICKER_LIMIT - local.length);
  return [...local, ...external];
}

const schema = z.object({
  title: z.string().trim().min(3, "Give the list a title").max(120),
  description: z.string().trim().max(600).default(""),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks so Vietnamese titles slug cleanly
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function createList(
  _prev: ListState,
  formData: FormData,
): Promise<ListState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to build a list" };

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const base = slugify(parsed.data.title) || "list";
  // Slugs are global, so a popular title needs disambiguating.
  let slug = base;
  for (let n = 2; await db.filmList.findUnique({ where: { slug } }); n++) {
    slug = `${base}-${n}`;
  }

  // The ids arrive from a form, so they are a claim rather than a fact:
  // check them against the catalogue and drop duplicates, or one stale id
  // fails the whole write on a foreign key.
  const claimed = [...new Set(formData.getAll("films").map(String).filter(Boolean))];
  const known = new Set(
    (
      await db.film.findMany({
        where: { id: { in: claimed } },
        select: { id: true },
      })
    ).map((film) => film.id),
  );
  const films = claimed.filter((id) => known.has(id));

  const list = await db.filmList.create({
    data: {
      slug,
      title: parsed.data.title,
      description: parsed.data.description,
      ownerId: user.id,
      entries: {
        create: films.map((filmId, i) => ({ filmId, position: i })),
      },
    },
  });

  await db.activity.create({
    data: {
      userId: user.id,
      listId: list.id,
      type: "listed",
      payload: JSON.stringify({ title: list.title, count: films.length }),
    },
  });

  revalidatePath("/lists");
  revalidatePath("/community");
  redirect(`/lists/${slug}`);
}

export async function removeFromList(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const entryId = String(formData.get("entryId") ?? "");
  const entry = await db.listEntry.findUnique({
    where: { id: entryId },
    include: { list: true },
  });
  if (!entry || entry.list.ownerId !== user.id) return;

  await db.listEntry.delete({ where: { id: entryId } });
  revalidatePath(`/lists/${entry.list.slug}`);
}

/**
 * The one-line argument for why a film is on a list.
 *
 * `ListEntry.note` has been in the schema since the beginning and nothing
 * ever wrote to it, which left every list an enumeration: eight posters and
 * no reason. A sentence per entry is what makes a list a claim — it is the
 * difference between "films about money" and "the one where the money is
 * the antagonist" — so it is editable in place by whoever owns the list.
 *
 * Empty clears it rather than storing an empty string, so a note either
 * exists and is worth rendering or does not exist at all.
 */
export async function setEntryNote(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const entryId = String(formData.get("entryId") ?? "");
  const note = String(formData.get("note") ?? "")
    .trim()
    .slice(0, 280);

  const entry = await db.listEntry.findUnique({
    where: { id: entryId },
    include: { list: { select: { ownerId: true, slug: true } } },
  });
  if (!entry || entry.list.ownerId !== user.id) return;

  await db.listEntry.update({
    where: { id: entryId },
    data: { note: note || null },
  });

  revalidatePath(`/lists/${entry.list.slug}`);
}
