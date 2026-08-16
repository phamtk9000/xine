"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "@/app/actions/auth";
import { Button, Container, Field, Input, Notice } from "@/components/ui";

export default function SignInPage() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signIn,
    null,
  );

  return (
    <Container className="py-20">
      <div className="mx-auto max-w-sm">
        <p className="label">Community</p>
        <h1 className="mt-4 font-display text-5xl leading-none">Sign in</h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Rate films across six axes, keep a watchlist, build lists, and start a
          project in Create.
        </p>

        <form action={action} className="mt-10 space-y-5">
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

        <p className="mt-8 text-sm text-muted">
          No account?{" "}
          <Link href="/sign-up" className="text-gold underline underline-offset-4">
            Create one
          </Link>
          .
        </p>

        <div className="mt-10 rounded-lg border border-line bg-ink-raised px-4 py-4">
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
