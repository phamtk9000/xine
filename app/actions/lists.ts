"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export type ListState = { error?: string } | null;

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

  const films = formData.getAll("films").map(String).filter(Boolean);

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
