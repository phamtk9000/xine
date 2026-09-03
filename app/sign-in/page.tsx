"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { signIn, type AuthState } from "@/app/actions/auth";
import { ResendVerification } from "@/components/resend-verification";
import { Button, Container, Field, Input, Notice } from "@/components/ui";

export default function SignInPage() {
  // useSearchParams needs a Suspense boundary above it.
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signIn,
    null,
  );
  // Carries through from links like /sign-in?next=/taste. The action
  // validates it before redirecting.
  const next = useSearchParams().get("next");

  return (
    <Container className="py-20">
      <div className="mx-auto max-w-sm">
        <p className="label">Community</p>
        <h1 className="mt-4 font-display text-5xl leading-none">Sign in</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Rate films on five axes plus an overall, keep a watchlist, build lists,
          and start a
          project in Create.
        </p>

        <form action={action} className="mt-10 space-y-5">
          {next && <input type="hidden" name="next" value={next} />}
          <Field label="Email">
            <Input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password">
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>

          {state?.error && <Notice tone="error">{state.error}</Notice>}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {/* An unconfirmed account is the one sign-in failure with something
            to do about it, so the way out is offered on the spot rather than
            somewhere the reader has to go and find. */}
        {state?.unverified && (
          <div className="mt-6 border-t border-line pt-6">
            <p className="text-sm leading-relaxed text-faint">
              The link expires after a day. Ask for a fresh one and it will be
              in your inbox in a moment.
            </p>
            <ResendVerification />
          </div>
        )}

        <p className="mt-8 text-sm text-muted">
          No account?{" "}
          <Link href="/sign-up" className="text-gold underline underline-offset-4">
            Create one
          </Link>
          .
        </p>

        <div className="mt-10 rounded-[3px] border border-line bg-ink-raised px-4 py-4">
          <p className="label">Seeded accounts</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The local database ships with four members. Sign in as{" "}
            <code className="font-mono text-paper">huy@xine.test</code> with the
            password <code className="font-mono text-paper">xine1234</code> to
            see a populated profile and a project in progress.
          </p>
        </div>
      </div>
    </Container>
  );
}
