"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/session";

const NAV = [
  { href: "/films", label: "Films" },
  { href: "/journal", label: "Journal" },
  { href: "/lists", label: "Lists" },
  { href: "/community", label: "Community" },
  { href: "/create", label: "Create" },
];

export function SiteHeader({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // The sheet closes on tap rather than in an effect keyed to the pathname —
  // same result, no cascading render, and it also closes when you tap the
  // route you are already on.
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-8 px-5 sm:px-8">
        <Link
          href="/"
          className="font-display text-3xl leading-none tracking-tight"
          aria-label="xine, home"
        >
          xine
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`label transition-colors hover:text-paper ${
                  active ? "!text-paper" : ""
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link
            href="/create/pitch"
            className="hidden rounded-full bg-accent px-5 py-2 text-[0.8125rem] font-medium text-paper transition-transform hover:-translate-y-px sm:block"
          >
            Pitch Your Film →
          </Link>

          {user ? (
            <>
              <Link
                href="/taste"
                className="label hidden transition-colors hover:text-paper md:block"
              >
                Your month
              </Link>
              <Link
                href={`/community/${user.username}`}
                className="label hidden transition-colors hover:text-paper md:block"
              >
                {user.displayName}
              </Link>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="label hidden transition-colors hover:text-paper md:block"
            >
              Sign in
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="label -mr-2 px-2 py-2 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-line bg-ink lg:hidden">
          <nav className="mx-auto max-w-[1400px] px-5 py-4 sm:px-8" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="block border-b border-line py-3 font-display text-3xl last:border-0"
              >
                {item.label}
              </Link>
            ))}
            <div className="flex flex-wrap items-center gap-3 pt-5">
              <Link
                href="/create/pitch"
                onClick={close}
                className="rounded-full bg-accent px-5 py-2 text-[0.8125rem] font-medium text-paper"
              >
                Pitch Your Film →
              </Link>
              {user && (
                <Link href="/taste" onClick={close} className="label px-1">
                  Your month
                </Link>
              )}
              <Link
                href={user ? `/community/${user.username}` : "/sign-in"}
                onClick={close}
                className="label px-1"
              >
                {user ? user.displayName : "Sign in"}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
