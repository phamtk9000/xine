"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { STAGES, isStageKey } from "@/lib/stages";

export type CreateState = { error?: string } | null;

const pitchSchema = z.object({
  title: z.string().trim().min(1, "Give it a working title").max(120),
  genre: z.string().trim().min(1, "Pick a genre").max(60),
  premise: z
    .string()
    .trim()
    .min(40, "Say a little more — a sentence or two about what happens")
    .max(4000),
});

export async function startProject(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to start a project" };

  const parsed = pitchSchema.safeParse({
    title: formData.get("title"),
    genre: formData.get("genre"),
    premise: formData.get("premise"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const project = await db.project.create({
    data: {
      ownerId: user.id,
      ...parsed.data,
      stage: "idea",
      // Every stage row is created up front so the workspace can render the
      // full pipeline without a per-stage upsert dance later.
      stages: {
        create: STAGES.map((stage) => ({
          key: stage.key,
          content: stage.key === "idea" ? parsed.data.premise : "",
          status: stage.key === "idea" ? "draft" : "empty",
        })),
      },
    },
  });

  await db.activity.create({
    data: {
      userId: user.id,
      type: "pitched",
      payload: JSON.stringify({ title: project.title, id: project.id }),
    },
  });

  revalidatePath("/community");
  redirect(`/create/projects/${project.id}`);
}

export async function saveStage(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const projectId = String(formData.get("projectId") ?? "");
  const key = String(formData.get("key") ?? "");
  const content = String(formData.get("content") ?? "");
  if (!isStageKey(key)) return;

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project || project.ownerId !== user.id) return;

  await db.projectStage.upsert({
    where: { projectId_key: { projectId, key } },
    create: {
      projectId,
      key,
      content,
      status: content.trim() ? "draft" : "empty",
    },
    update: { content, status: content.trim() ? "draft" : "empty" },
  });

  // The logline gets promoted onto the project so it can appear in listings.
  if (key === "logline") {
    await db.project.update({
      where: { id: projectId },
      data: { logline: content.split("\n")[0].trim() || null },
    });
  }

  await db.project.update({
    where: { id: projectId },
    data: { stage: key },
  });

  revalidatePath(`/create/projects/${projectId}`);
}

export async function markStageComplete(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const projectId = String(formData.get("projectId") ?? "");
  const key = String(formData.get("key") ?? "");
  if (!isStageKey(key)) return;

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project || project.ownerId !== user.id) return;

  const stage = await db.projectStage.findUnique({
    where: { projectId_key: { projectId, key } },
  });
  if (!stage || !stage.content.trim()) return;

  await db.projectStage.update({
    where: { id: stage.id },
    data: { status: stage.status === "complete" ? "draft" : "complete" },
  });

  revalidatePath(`/create/projects/${projectId}`);
}

export async function setVisibility(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const projectId = String(formData.get("projectId") ?? "");
  const visibility =
    String(formData.get("visibility") ?? "private") === "community"
      ? "community"
      : "private";

  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project || project.ownerId !== user.id) return;

  await db.project.update({ where: { id: projectId }, data: { visibility } });
  revalidatePath(`/create/projects/${projectId}`);
  revalidatePath(`/community/${user.username}`);
}

const briefSchema = z.object({
  title: z.string().trim().min(1, "The film needs a title").max(120),
  genre: z.string().trim().min(1, "Pick a genre").max(60),
  logline: z.string().trim().min(20, "One sentence, but a full one").max(600),
  filmReferences: z.string().trim().max(400).default(""),
  visualReferences: z.string().trim().max(2000).default(""),
});

export async function createBrief(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to open a trailer brief" };

  const parsed = briefSchema.safeParse({
    title: formData.get("title"),
    genre: formData.get("genre"),
    logline: formData.get("logline"),
    filmReferences: formData.get("filmReferences") ?? "",
    visualReferences: formData.get("visualReferences") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const projectId = String(formData.get("projectId") ?? "") || null;

  const brief = await db.trailerBrief.create({
    data: { ownerId: user.id, projectId, ...parsed.data },
  });

  redirect(`/create/trailer/${brief.id}`);
}

const enquirySchema = z.object({
  service: z.string().trim().min(1),
  name: z.string().trim().min(1, "Your name, please").max(120),
  email: z.email("That email doesn't look right"),
  company: z.string().trim().max(160).default(""),
  budget: z.string().trim().max(60).default(""),
  message: z
    .string()
    .trim()
    .min(30, "Tell us a bit more about the project")
    .max(4000),
});

export async function submitEnquiry(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const parsed = enquirySchema.safeParse({
    service: formData.get("service"),
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company") ?? "",
    budget: formData.get("budget") ?? "",
    message: formData.get("message"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Deliberately not gated on an account: a producer with a deadline should
  // never have to sign up to start a conversation.
  await db.serviceEnquiry.create({ data: parsed.data });

  redirect(`/develop/${parsed.data.service}?sent=1`);
}
