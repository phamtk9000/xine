import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { genreColor, kickerColor } from "@/lib/colors";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-[1400px] px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  label,
  title,
  lede,
  action,
}: {
  label: string;
  title: string;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <header className="border-b border-line py-14 sm:py-20">
      <Container>
        <p className="label">{label}</p>
        <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="max-w-3xl font-display text-5xl leading-[0.95] tracking-tight sm:text-7xl">
            {title}
          </h1>
          {action}
        </div>
        {lede && (
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-muted">
            {lede}
          </p>
        )}
      </Container>
    </header>
  );
}

export function SectionHeading({
  label,
  title,
  href,
  hrefLabel = "See all",
}: {
  label: string;
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-6 border-b border-line pb-4">
      <div>
        <p className="label">{label}</p>
        <h2 className="mt-2 font-display text-3xl leading-none sm:text-4xl">
          {title}
        </h2>
      </div>
      {href && (
        <Link
          href={href}
          className="label shrink-0 transition-colors hover:text-paper"
        >
          {hrefLabel} →
        </Link>
      )}
    </div>
  );
}

type ButtonVariant = "accent" | "outline" | "ghost";

const VARIANTS: Record<ButtonVariant, string> = {
  accent:
    "bg-accent text-paper hover:-translate-y-px disabled:bg-accent-dim disabled:translate-y-0",
  outline:
    "border border-line-bright text-paper hover:border-paper disabled:opacity-50",
  ghost: "text-muted hover:text-paper disabled:opacity-50",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed";

export function Button({
  variant = "accent",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function ButtonLink({
  variant = "accent",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link
      {...props}
      className={`${BUTTON_BASE} ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label block">{label}</span>
      {hint && <span className="mt-1.5 block text-xs text-faint">{hint}</span>}
      <div className="mt-2.5">{children}</div>
      {error && <span className="mt-2 block text-xs text-gold">{error}</span>}
    </label>
  );
}

const CONTROL =
  "w-full rounded-lg border border-line bg-ink-raised px-4 py-3 text-[0.9375rem] text-paper placeholder:text-faint focus:border-line-bright focus:outline-none";

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function Textarea({
  className = "",
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={`${CONTROL} resize-y leading-relaxed ${className}`}
    />
  );
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${CONTROL} ${className}`} />;
}

/**
 * A Journal kicker (Review, Essay, Analysis...), coloured per category
 * rather than the flat gold every kicker used to render in — see
 * lib/colors.ts for why each one is what it is.
 */
export function KickerLabel({
  kicker,
  href,
  className = "",
}: {
  kicker: string;
  href?: string;
  className?: string;
}) {
  const style = { color: kickerColor(kicker) };
  const cls = `label ${className}`;
  return href ? (
    <Link href={href} style={style} className={cls}>
      {kicker}
    </Link>
  ) : (
    <span style={style} className={cls}>
      {kicker}
    </span>
  );
}

/**
 * A genre pill, tinted deterministically per genre — see lib/colors.ts.
 *
 * The hover state (border brightens to the full colour) is plain CSS on
 * `.genre-tag` in globals.css rather than a mouse-event handler, because
 * this file has no "use client" directive and is shared with several
 * server-rendered pages — an event handler here would force the whole
 * module into a client boundary.
 */
export function GenreTag({ genre, href }: { genre: string; href?: string }) {
  const style = { "--tag-color": genreColor(genre) } as React.CSSProperties;
  return href ? (
    <Link href={href} style={style} className="genre-tag">
      {genre}
    </Link>
  ) : (
    <span style={style} className="genre-tag">
      {genre}
    </span>
  );
}

export function Tag({
  children,
  href,
  color,
}: {
  children: ReactNode;
  href?: string;
  /** Raw CSS colour, for the rare tag that needs to stand apart from the
   *  rest — e.g. distinguishing an audience number from XINE's own. Most
   *  callers omit this and get the plain grey pill. */
  color?: string;
}) {
  const className = `inline-block rounded-full border px-3 py-1 text-xs transition-colors ${
    color ? "" : "border-line text-muted"
  }`;
  const style = color
    ? { color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }
    : undefined;
  return href ? (
    <Link
      href={href}
      style={style}
      className={`${className} ${color ? "" : "hover:border-line-bright hover:text-paper"}`}
    >
      {children}
    </Link>
  ) : (
    <span style={style} className={className}>
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line px-8 py-16 text-center">
      <p className="font-display text-2xl">{title}</p>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        {body}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error";
  children: ReactNode;
}) {
  return (
    <p
      className={`rounded-lg border px-4 py-3 text-sm ${
        tone === "error"
          ? "border-accent/40 bg-accent/5 text-accent"
          : "border-line bg-ink-raised text-muted"
      }`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}

export function formatRuntime(minutes: number | null | undefined) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

export function formatDate(date: Date | string | null | undefined) {
  // A malformed date in article frontmatter should show as a dash, not throw
  // an "Invalid time value" and take the whole page down with it.
  const value = date instanceof Date ? date : new Date(date ?? "");
  if (Number.isNaN(value.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

export function relativeTime(date: Date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(-Math.round(seconds / size), unit);
    }
  }
  return "just now";
}
