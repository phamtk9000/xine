"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "@/app/actions/auth";
import { Button, Field, Input, Notice } from "@/components/ui";

/**
 * Changing your password.
 *
 * Uncontrolled on purpose. React resets a form's uncontrolled fields after
 * its action runs, so no password — current or new — survives in the DOM
 * once the request is done, and nothing in component state ever held one.
 *
 * The autocomplete hints are not decoration: `current-password` and
 * `new-password` are what tell a password manager to fill the first field
 * and offer to generate and save the other two.
 */
export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(
    changePassword,
    null,
  );

  return (
    <form action={action} className="space-y-6">
      <Field label="Current password">
        <Input
          type="password"
          name="current"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field label="New password" hint="At least 8 characters.">
        <Input
          type="password"
          name="next"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <Field label="New password, again">
        <Input
          type="password"
          name="confirm"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && (
        <Notice>
          Password changed. Every other device signed in to this account has
          been signed out.
        </Notice>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
