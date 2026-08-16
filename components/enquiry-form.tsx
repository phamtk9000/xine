"use client";

import { useActionState } from "react";
import { submitEnquiry, type CreateState } from "@/app/actions/create";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";

const BUDGETS = [
  "Not decided yet",
  "Under €5,000",
  "€5,000 – €15,000",
  "€15,000 – €50,000",
  "Over €50,000",
];

export function EnquiryForm({ service }: { service: string }) {
  const [state, action, pending] = useActionState<CreateState, FormData>(
    submitEnquiry,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="service" value={service} />

      <Field label="Name">
        <Input name="name" required autoComplete="name" />
      </Field>

      <Field label="Email">
        <Input name="email" type="email" required autoComplete="email" />
      </Field>

      <Field label="Company" hint="Optional.">
        <Input name="company" autoComplete="organization" />
      </Field>

      <Field label="Budget">
        <Select name="budget" defaultValue={BUDGETS[0]}>
          {BUDGETS.map((budget) => (
            <option key={budget} value={budget}>
              {budget}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="The project" hint="What it is, and where it's going.">
        <Textarea
          name="message"
          rows={6}
          required
          minLength={30}
          placeholder="Feature, psychological thriller, shooting in Budapest. We have a treatment and need a pitch package for a fund application in November."
        />
      </Field>

      {state?.error && <Notice tone="error">{state.error}</Notice>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send enquiry"}
      </Button>

      <p className="text-xs leading-relaxed text-faint">
        Your material stays yours. We take no ownership, option or credit by
        default, and hold everything you send in confidence.
      </p>
    </form>
  );
}
