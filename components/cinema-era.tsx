import type { Era } from "@/lib/era";
import { describeEra } from "@/lib/era";

/**
 * The viewer's place in film history, as a hairline.
 *
 * One rule keeps it restrained: the timeline spans the whole history their
 * viewing touches, and every film is a single thin tick on it. The core range
 * is a lit band behind those ticks and the centre of gravity is one bright
 * stem. Nothing is a bar chart, nothing is labelled except the two ends and
 * the centre, and the shape of somebody's history is legible in a strip a few
 * millimetres tall.
 *
 * The axis is padded out to whole decades so the end labels are round numbers
 * and two people's strips can be compared without reading the scale.
 */
export function CinemaEra({ era }: { era: Era }) {
  const start = Math.floor(era.earliest / 10) * 10;
  const end = Math.ceil((era.latest + 1) / 10) * 10;
  const span = Math.max(1, end - start);
  const at = (year: number) => ((year - start) / span) * 100;

  const peak = Math.max(...era.spread.map((s) => s.count), 1);
  const decades: number[] = [];
  for (let d = start; d <= end; d += 10) decades.push(d);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="label">Your cinema era</p>
          <p className="mt-3 font-display text-5xl leading-none tracking-tight sm:text-6xl">
            {era.from}
            <span className="mx-2 text-muted">–</span>
            {era.to}
          </p>
        </div>
        <div className="text-right">
          <p className="label">Centre of gravity</p>
          <p className="mt-3 font-display text-5xl leading-none tracking-tight text-gold sm:text-6xl">
            {era.centre}
          </p>
        </div>
      </div>

      <div className="relative mt-10 h-20">
        {/* The core range, lit. */}
        <div
          className="absolute inset-y-0 rounded-sm bg-gold/10"
          style={{ left: `${at(era.from)}%`, width: `${at(era.to) - at(era.from)}%` }}
          aria-hidden="true"
        />

        {/* Decade rules, faint. */}
        {decades.map((d) => (
          <div
            key={d}
            className="absolute inset-y-0 w-px bg-line"
            style={{ left: `${at(d)}%` }}
            aria-hidden="true"
          />
        ))}

        {/* One tick per film. Height carries how many landed on that year, so
            a year they returned to repeatedly stands taller. */}
        {era.spread
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.year}
              className="absolute bottom-0 w-px bg-paper/70"
              style={{
                left: `${at(s.year)}%`,
                height: `${28 + (s.count / peak) * 60}%`,
              }}
              aria-hidden="true"
            />
          ))}

        {/* Centre of gravity. */}
        <div
          className="absolute inset-y-0 w-px bg-gold"
          style={{ left: `${at(era.centre)}%` }}
          aria-hidden="true"
        />
        <div
          className="absolute h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-gold"
          style={{ left: `${at(era.centre)}%`, top: "-3px" }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-2 flex justify-between font-sans text-[0.625rem] tracking-[0.16em] text-faint tabular-nums">
        <span>{start}</span>
        <span>{end}</span>
      </div>

      <p className="mt-7 max-w-xl text-base leading-relaxed text-muted">
        {describeEra(era)}
      </p>
    </div>
  );
}
