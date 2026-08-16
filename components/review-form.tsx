"use client";

import { useState, useTransition } from "react";
import { postReview, type ActionResult } from "@/app/actions/films";
import { Button, Notice, Textarea } from "@/components/ui";

export function ReviewForm({
  filmId,
  slug,
  existing,
}: {
  filmId: string;
  slug: string;
  existing: { body: string; spoilers: boolean } | null;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    formData.set("filmId", filmId);
    formData.set("slug", slug);
    startTransition(async () => {
      const res = await postReview(formData);
      setResult(res);
      if (res.ok) setOpen(false);
    });
  }

  if (!open) {
    return (
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          {existing ? "Edit your review" : "Write a review"}
        </Button>
        {result?.ok && (
          <p className="mt-3 text-xs text-muted">Review saved.</p>
        )}
      </div>
    );
  }

  return (
    <form action={submit} className="rounded-xl border border-line bg-ink-raised p-6">
      <Textarea
        name="body"
        rows={8}
        required
        minLength={20}
        defaultValue={existing?.body ?? ""}
        placeholder="What did it do, and how did it do it? Blank lines make paragraphs."
      />

      <label className="mt-4 flex items-center gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          name="spoilers"
          defaultChecked={existing?.spoilers}
          className="accent-[var(--color-accent)]"
        />
        This review contains spoilers
      </label>

      {result?.message && (
        <div className="mt-4">
          <Notice tone={result.ok ? "info" : "error"}>{result.message}</Notice>
        </div>
      )}

      <div className="mt-5 flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Publishing…" : "Publish"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
