import Link from "next/link";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { SERVICES } from "@/lib/stages";

export const metadata: Metadata = {
  title: "Develop My Film",
  description:
    "Professional development for projects going in front of money: story, visual identity, concept trailer, pitch package, business plan, production strategy.",
};

export default function DevelopPage() {
  return (
    <>
      <PageHeader
        label="Develop"
        title="For the projects that are actually going out."
        lede="Create is a workspace. This is a team. Fixed scopes, fixed price bands, and deliverables built for the room the project is going into."
      />

      <Container className="py-14">
        <div className="border-t border-line-bright">
          {SERVICES.map((service) => (
            <Link
              key={service.key}
              href={`/develop/${service.key}`}
              className="group grid gap-x-8 gap-y-4 border-b border-line py-8 md:grid-cols-[1fr_1fr_10rem_7rem] md:items-baseline"
            >
              <div>
                <h2 className="font-display text-3xl leading-none transition-colors group-hover:text-gold">
                  {service.title}
                </h2>
                <p className="mt-2 text-sm text-muted">{service.output}</p>
              </div>

              <p className="max-w-md text-sm leading-relaxed text-muted">
                {service.detail}
              </p>

              <p className="font-mono text-sm text-paper tabular-nums">
                {service.band}
              </p>

              <p className="text-sm text-faint md:text-right">
                {service.duration}
              </p>
            </Link>
          ))}
        </div>

        <section className="mt-16 grid gap-10 border-t border-line pt-12 md:grid-cols-3">
          <div>
            <p className="label">How it works</p>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              You send the project. We come back within two working days with a
              scope, a fixed price inside the band, and a start date. Nothing
              begins until both are signed.
            </p>
          </div>
          <div>
            <p className="label">Who this is for</p>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Producers, production companies, agencies and directors with a
              project going in front of financiers, a commissioner, a fund or a
              festival lab. Not a first draft with no route to market.
            </p>
          </div>
          <div>
            <p className="label">Your material stays yours</p>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              We take no ownership, no option and no credit by default. Anything
              you send is held in confidence, and we do not develop competing
              projects in the same premise space while yours is live.
            </p>
          </div>
        </section>
      </Container>
    </>
  );
}
