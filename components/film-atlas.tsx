"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { COUNTRIES } from "@/lib/atlas";
import type { CountryStat } from "@/lib/geography";

/**
 * Cinema without borders — real geography, on Leaflet + CARTO raster tiles.
 *
 * Raster tiles rather than Mapbox or Google: no API key, no billing account,
 * nothing to leak into the client bundle, and the tiles are free under
 * attribution. The trade is that they arrive pre-styled, so the palette is
 * matched with a CSS grade over the tile pane rather than a style JSON —
 * which is also why the dark basemap is the one to start from here.
 *
 * Leaflet touches `window` at import time, so it is imported dynamically
 * inside the mount effect. The server renders the frame and the country list;
 * the map itself arrives after hydration. The list beside it is the same data
 * in a form that works without any of this.
 *
 * Markers are circles sized by film count, not pins. A pin points at a spot,
 * and "France, 25 films" is not a spot — it is a whole country's output.
 */

const TILES = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
};

export function FilmAtlas({
  countries,
  unplaced,
}: {
  countries: CountryStat[];
  unplaced: number;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const [active, setActive] = useState<string | null>(countries[0]?.code ?? null);
  // Mirrors `active` for the Leaflet layer, which lives outside React and
  // would otherwise close over the value from the render that built it.
  const activeRef = useRef(active);

  const peak = Math.max(...countries.map((c) => c.films), 1);
  const selected = countries.find((c) => c.code === active) ?? null;

  useEffect(() => {
    if (!elRef.current || mapRef.current || countries.length === 0) return;
    let cancelled = false;

    import("leaflet").then(({ default: L }) => {
      if (cancelled || !elRef.current || mapRef.current) return;

      const map = L.map(elRef.current, {
        center: [24, 12],
        zoom: 2,
        minZoom: 1,
        zoomControl: true,
        // Never hijack the page's scroll — the map is inside a long article.
        scrollWheelZoom: false,
        worldCopyJump: true,
        attributionControl: true,
      });
      L.tileLayer(TILES.url, {
        attribution: TILES.attribution,
        subdomains: TILES.subdomains,
        maxZoom: 8,
        detectRetina: true,
      }).addTo(map);
      map.zoomControl.setPosition("bottomright");
      mapRef.current = map;

      const layer = L.layerGroup().addTo(map);
      const points: [number, number][] = [];

      for (const c of countries) {
        const place = COUNTRIES[c.code];
        if (!place) continue;
        const [, lat, lon] = place;
        points.push([lat, lon]);

        // Radius on sqrt so area tracks the count — twice the films looks
        // like twice the ink, not four times.
        const r = 5 + Math.sqrt(c.films / peak) * 17;
        const marker = L.circleMarker([lat, lon], {
          radius: r,
          color: "#c9a227",
          weight: 1.25,
          fillColor: "#c9a227",
          fillOpacity: 0.28,
        });

        marker.bindTooltip(
          `${c.name} · ${c.films} film${c.films === 1 ? "" : "s"}`,
          { direction: "top", className: "xine-map-tip" },
        );
        marker.on("click", () => setActive(c.code));
        marker.addTo(layer);
        (marker as L.CircleMarker & { _code?: string })._code = c.code;
      }

      if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 5 });
      }

      // Re-style on selection without rebuilding the layer.
      const paint = () => {
        layer.eachLayer((l) => {
          const m = l as L.CircleMarker & { _code?: string };
          const on = m._code === activeRef.current;
          m.setStyle({
            fillOpacity: on ? 0.75 : 0.28,
            weight: on ? 2 : 1.25,
          });
        });
      };
      paint();
      (map as unknown as { _xinePaint?: () => void })._xinePaint = paint;
    });

    return () => {
      cancelled = true;
    };
  }, [countries, peak]);

  // Repaint whenever the selection changes, from the map or the list.
  useEffect(() => {
    activeRef.current = active;
    const map = mapRef.current as { _xinePaint?: () => void } | null;
    map?._xinePaint?.();
  }, [active]);

  if (countries.length === 0) return null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
      <div>
        <div
          ref={elRef}
          className="xine-map w-full overflow-hidden rounded-xl border border-line bg-ink-sunk"
          style={{ height: 420 }}
        />
        <p className="mt-4 font-sans text-[0.625rem] tracking-[0.16em] uppercase text-faint">
          Circle area is films watched
          {unplaced > 0 && ` · ${unplaced} without production data`}
        </p>
      </div>

      <aside>
        {selected && (
          <div className="rounded-xl border border-line p-6">
            <p className="font-display text-3xl leading-none">{selected.name}</p>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Films</dt>
                <dd className="tabular-nums">{selected.films}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Mean</dt>
                <dd className="tabular-nums text-gold">
                  {selected.mean?.toFixed(1) ?? "—"}
                </dd>
              </div>
            </dl>
            {selected.favourite && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="label">Favourite</p>
                <Link
                  href={`/films/${selected.favourite.slug}`}
                  className="mt-2 block font-display text-xl leading-tight transition-colors hover:text-gold"
                >
                  {selected.favourite.title}
                </Link>
                <p className="mt-1 font-sans text-xs text-faint tabular-nums">
                  {selected.favourite.score.toFixed(1)}
                </p>
              </div>
            )}
          </div>
        )}

        <ul className="mt-5 max-h-56 space-y-1 overflow-y-auto pr-2">
          {countries.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onClick={() => setActive(c.code)}
                className={`flex w-full justify-between rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-ink-raised ${
                  c.code === active ? "text-gold" : "text-muted"
                }`}
              >
                <span>{c.name}</span>
                <span className="tabular-nums text-faint">{c.films}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
