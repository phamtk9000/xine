"use client";

import { useActionState } from "react";
import { createBrief, type CreateState } from "@/app/actions/create";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";

const GENRES = [
  "Psychological thriller",
  "Horror",
  "Drama",
  "Science fiction",
  "Dark comedy",
  "Crime",
  "Romance",
  "Documentary",
];

export function BriefForm({
  projects,
  defaultProjectId,
}: {
  projects: { id: string; title: string }[];
  defaultProjectId?: string;
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(
    createBrief,
    null,
  );

  return (
    <form action={action} className="space-y-6">
      <Field label="Film title">
        <Input name="title" required placeholder="THE FOURTEENTH ROOM" />
      </Field>

      <Field label="Genre">
        <Select name="genre" required defaultValue="Psychological thriller">
          {GENRES.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Logline" hint="One sentence — this is what the trailer sells.">
        <Textarea
          name="logline"
          rows={3}
          required
          minLength={20}
          placeholder="A young architect discovers an undocumented room inside a Budapest apartment building."
        />
      </Field>

      <Field
        label="Film references"
        hint="Comma separated. Three is better than ten."
      >
        <Input
          name="filmReferences"
          placeholder="The Shining, Enemy, The Brutalist"
        />
      </Field>

      <Field
        label="Visual references"
        hint="One per line. Describe images, or paste URLs."
      >
        <Textarea
          name="visualReferences"
          rows={5}
          placeholder={"Interwar Budapest stairwell, brass handrail\nMeasured survey drawing with a hand annotation\nSealed window reading as a blank panel"}
        />
      </Field>

      {projects.length > 0 && (
        <Field label="Attach to a project" hint="Optional.">
          <Select name="projectId" defaultValue={defaultProjectId ?? ""}>
            <option value="">Not attached</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {state?.error && <Notice tone="error">{state.error}</Notice>}

      <Button type="submit" disabled={pending}>
        {pending ? "Building…" : "Build the trailer →"}
      </Button>
    </form>
  );
}
