"use client";

import { useActionState } from "react";
import { resendVerification, type AuthState } from "@/app/actions/auth";
import { Button, Field, Input, Notice } from "@/components/ui";

/**
 * Ask for another confirmation link.
 *
 * The reply is deliberately the same whether the address is a member, was
 * confirmed years ago, or has never been seen here — see the note on the
 * action. The form asks for the address again rather than carrying it in the
 * URL from the previous page, which keeps somebody's email out of their
 * browser history and out of any link they paste.
 */
export function ResendVerification({ label = "Send another link" }: { label?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    resendVerification,
    null,
  );

  if (state?.resent) {
    return (
      <div className="mt-4">
        <Notice tone="info">
          If that address has an account waiting to be confirmed, a new link is
          on its way.
        </Notice>
        {state.sent?.devUrl && <DevLink url={state.sent.devUrl} />}
      </div>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-4">
      <Field label="Email">
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </Field>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Sending…" : label}
      </Button>
    </form>
  );
}

/**
 * The link itself, on a laptop with no mail provider configured.
 *
 * Never rendered in production: the server only returns a URL when
 * NODE_ENV is not production, so there is nothing here to leak.
 */
export function DevLink({ url }: { url: string }) {
  return (
    <div className="mt-4 rounded-[3px] border border-dashed border-line px-4 py-3">
      <p className="label">Development</p>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        No mail provider is configured, so the link is here instead of in an
        inbox.
      </p>
      <a
        href={url}
        className="mt-2 block break-all font-mono text-xs text-gold underline underline-offset-4"
      >
        {url}
      </a>
    </div>
  );
}
