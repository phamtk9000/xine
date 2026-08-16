"use client";

import { useActionState } from "react";
import { startProject, type CreateState } from "@/app/actions/create";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";

const GENRES = [
  "Psychological thriller",
  "Drama",
  "Horror",
  "Science fiction",
  "Comedy",
  "Dark comedy",
  "Romance",
  "Crime",
  "Documentary",
  "Period",
  "Musical",
  "Animation",
  "Something else",
];

export function PitchForm() {
  const [state, action, pending] = useActionState<CreateState, FormData>(
    startProject,
    null,
  );

  return (
    <form action={action} className="space-y-6">
      <Field label="Working title" hint="It can be terrible. It usually is.">
        <Input name="title" required placeholder="The Fourteenth Room" />
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

      <Field
        label="The idea"
        hint="A paragraph or two. What happens, and why it has to be a film."
      >
        <Textarea
          name="premise"
          rows={8}
          required
          minLength={40}
          placeholder="A psychological thriller about a Vietnamese architect who discovers that the apartment building he designed contains a room that doesn't exist on the original plans…"
        />
      </Field>

      {state?.error && <Notice tone="error">{state.error}</Notice>}

      <Button type="submit" disabled={pending}>
        {pending ? "Opening the workspace…" : "Start the project →"}
      </Button>
    </form>
  );
}
