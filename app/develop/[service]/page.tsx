import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container, Notice } from "@/components/ui";
import { EnquiryForm } from "@/components/enquiry-form";
import { SERVICES, getService } from "@/lib/stages";

export function generateStaticParams() {
  return SERVICES.map((service) => ({ service: service.key }));
}

export async function generateMetadata({
  params,
}: PageProps<"/develop/[service]">): Promise<Metadata> {
  const { service } = await params;
  const found = getService(service);
  if (!found) return {};
  return { title: found.title, description: found.detail };
}

export default async function ServicePage({
  params,
  searchParams,
}: PageProps<"/develop/[service]">) {
  const { service } = await params;
  const query = await searchParams;
  const found = getService(service);
  if (!found) notFound();

  const sent = query.sent === "1";

  return (
    <Container className="py-16">
      <div className="grid gap-14 lg:grid-cols-[1fr_24rem]">
        <div className="max-w-2xl">
          <Link href="/develop" className="label hover:text-paper">
            ← Develop
          </Link>

          <h1 className="mt-5 font-display text-5xl leading-[0.95] tracking-tight sm:text-6xl">
            {found.title}
          </h1>
          <p className="mt-4 font-mono text-sm text-gold">{found.output}</p>

          <p className="mt-7 text-base leading-relaxed text-muted">
            {found.detail}
          </p>

          <section className="mt-10 border-t border-line pt-8">
            <p className="label">Deliverables</p>
            <ul className="mt-5 space-y-3">
              {found.deliverables.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-paper">
                  <span className="text-faint" aria-hidden>
                    —
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <dl className="mt-10 flex gap-12 border-t border-line pt-8">
            <div>
              <dt className="label">Price band</dt>
              <dd className="mt-2 font-mono text-lg text-paper tabular-nums">
                {found.band}
              </dd>
            </div>
            <div>
              <dt className="label">Typical duration</dt>
              <dd className="mt-2 font-mono text-lg text-paper">
                {found.duration}
              </dd>
            </div>
          </dl>

          <p className="mt-8 text-xs leading-relaxed text-faint">
            Bands, not quotes. The fixed price comes back with the scope, and
            depends on material length, number of routes and whether the
            deliverable needs to be production-ready or presentation-ready.
          </p>
        </div>

        <aside>
          <div className="rounded-xl border border-line bg-ink-raised p-6 lg:sticky lg:top-24">
            <p className="label">Start a conversation</p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              No account needed. We reply within two working days with a scope
              and a price.
            </p>

            {sent ? (
              <div className="mt-6">
                <Notice>
                  Sent. We&rsquo;ll come back to you within two working days —
                  check the address you gave us.
                </Notice>
              </div>
            ) : (
              <div className="mt-6">
                <EnquiryForm service={found.key} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </Container>
  );
}
