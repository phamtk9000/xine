"use client";

import { useState, useTransition } from "react";
import { markStageComplete, saveStage } from "@/app/actions/create";
import { Button, Textarea } from "@/components/ui";
import type { STAGES } from "@/lib/stages";

type Stage = (typeof STAGES)[number];

export function StageEditor({
  projectId,
  stage,
  content,
  status,
  editable,
}: {
  projectId: string;
  stage: Stage;
  content: string;
  status: string;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(content);
  const [pending, startTransition] = useTransition();

  const filled = content.trim().length > 0;

  function save(formData: FormData) {
    formData.set("projectId", projectId);
    formData.set("key", stage.key);
    startTransition(async () => {
      await saveStage(formData);
      setEditing(false);
    });
  }

  function toggleComplete() {
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("key", stage.key);
    startTransition(() => markStageComplete(formData));
  }

  return (
    <section id={stage.key} className="scroll-mt-24">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-line pb-3">
        <span className="font-sans text-xs text-faint tabular-nums">
          {String(stage.index).padStart(2, "0")}
        </span>
        <h2 className="font-display text-3xl leading-none">{stage.label}</h2>
        {status === "complete" && (
          <span className="font-sans text-[0.625rem] tracking-[0.16em] uppercase text-gold">
            Complete
          </span>
        )}
        {editable && (
          <div className="ml-auto flex gap-4">
            {filled && (
              <button
                type="button"
                onClick={toggleComplete}
                disabled={pending}
                className="label transition-colors hover:text-paper"
              >
                {status === "complete" ? "Reopen" : "Mark complete"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setValue(content);
                setEditing((v) => !v);
              }}
              className="label transition-colors hover:text-paper"
            >
              {editing ? "Cancel" : filled ? "Edit" : "Write"}
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-faint">
        {stage.prompt}
      </p>

      {editing ? (
        <form action={save} className="mt-5">
          <Textarea
            name="content"
            rows={14}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={stage.prompt}
            autoFocus
          />
          <div className="mt-4 flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : filled ? (
        <div className="mt-6 max-w-2xl space-y-4">
          {content.split("\n\n").map((para, i) => (
            <p
              key={i}
              className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-paper/90"
            >
              {para}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-6 text-sm text-faint">
          {editable
            ? "Nothing here yet."
            : "The writer hasn't published this stage."}
        </p>
      )}
    </section>
  );
}
