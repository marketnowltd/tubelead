"use client";
import { geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { COUNTRIES, countryByCode, countryName, flag } from "@/lib/countries";

export interface MapDatum { country: string; count: number; avg_score?: number; extra?: string }
const W = 960, H = 500;

export function WorldMap({ data, selected = [], onSelect, height = 420, compare }: {
  data: MapDatum[]; selected?: string[]; onSelect?: (code: string) => void; height?: number; compare?: string[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [k, setK] = useState(1);
  const [hover, setHover] = useState<{ code: string; x: number; y: number } | null>(null);

  const { paths, graticule, proj } = useMemo(() => {
    const topo = world as unknown as Topology;
    const fc = feature(topo, topo.objects.countries as any) as any;
    const proj = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: "Sphere" } as any);
    const path = geoPath(proj);
    const byAtlas = new Map(COUNTRIES.map((c) => [c.atlas, c.code]));
    return {
      proj,
      graticule: path(geoGraticule10()) ?? "",
      paths: fc.features.map((f: any) => ({ d: path(f) ?? "", code: byAtlas.get(f.properties.name) as string | undefined, name: f.properties.name as string })),
    };
  }, []);

  const byCode = useMemo(() => new Map(data.map((d) => [d.country, d])), [data]);
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([1, 8]).translateExtent([[0, 0], [W, H]])
      .on("zoom", (e) => { gRef.current!.setAttribute("transform", e.transform.toString()); setK(e.transform.k); });
    zoomRef.current = z;
    select(svgRef.current).call(z).on("dblclick.zoom", null);
    return () => { select(svgRef.current!).on(".zoom", null); };
  }, []);

  const fill = (code?: string) => {
    const d = code ? byCode.get(code) : undefined;
    if (!d) return "#E4DED2";
    const t = Math.sqrt(d.count / max);
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t);  // sage-100 -> forest
    return `rgb(${mix(205, 36)},${mix(214, 74)},${mix(198, 58)})`;
  };
  const hov = hover ? byCode.get(hover.code) : undefined;
  const move = (code: string, e: React.MouseEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    setHover({ code, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  return (
    <div className="relative w-full overflow-hidden rounded-xl bg-[#EFEAE0]/80" style={{ height }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="h-full w-full cursor-grab touch-pan-y active:cursor-grabbing" role="img" aria-label="Interactive world map of creator discovery distribution. Use the country list below for a text alternative.">
        <defs>
          <radialGradient id="mapGlow" cx=".5" cy=".5" r=".6"><stop offset="0" stopColor="#244A3A" stopOpacity=".18" /><stop offset="1" stopColor="#F7F4EC" stopOpacity="0" /></radialGradient>
          <filter id="mk"><feGaussianBlur stdDeviation="2.5" /></filter>
        </defs>
        <rect width={W} height={H} fill="url(#mapGlow)" />
        <g ref={gRef}>
          <path d={graticule} fill="none" stroke="rgba(34,35,31,.08)" strokeWidth={0.5 / k} />
          {paths.map((p: any, i: number) => {
            const sel = p.code && selected.includes(p.code);
            const cmp = p.code && compare?.includes(p.code);
            return (
              <path key={i} d={p.d} fill={fill(p.code)} stroke={sel || cmp ? "#6F8668" : "rgba(255,253,248,.9)"} strokeWidth={(sel || cmp ? 1.6 : 0.5) / k}
                className={p.code ? "cursor-pointer transition-[fill] duration-200 hover:brightness-90" : ""}
                onMouseMove={p.code ? (e) => move(p.code, e) : undefined} onMouseLeave={() => setHover(null)}
                onClick={p.code && onSelect ? () => onSelect(p.code) : undefined} />
            );
          })}
          {data.map((d) => {
            const c = countryByCode(d.country); if (!c) return null;
            const pt = proj([c.lon, c.lat]); if (!pt) return null;
            const r = (3 + 9 * Math.sqrt(d.count / max)) / Math.sqrt(k);
            const isTop = d.count / max > 0.45;
            return (
              <g key={d.country} transform={`translate(${pt[0]} ${pt[1]})`} className="cursor-pointer" onMouseMove={(e) => move(d.country, e)} onMouseLeave={() => setHover(null)} onClick={onSelect ? () => onSelect(d.country) : undefined}>
                {isTop && <circle r={r * 2.2} fill="#C8795B" opacity=".3" filter="url(#mk)"><animate attributeName="r" values={`${r * 1.6};${r * 2.8};${r * 1.6}`} dur="3s" repeatCount="indefinite" /></circle>}
                <circle r={r} fill="#C8795B" fillOpacity=".95" stroke="#FFFDF8" strokeOpacity=".9" strokeWidth={0.8 / k} />
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-3 top-3 flex flex-col gap-1.5">
        {[{ i: Plus, l: "Zoom in", f: () => zoomRef.current && select(svgRef.current!).transition().duration(250).call(zoomRef.current.scaleBy, 1.6) },
          { i: Minus, l: "Zoom out", f: () => zoomRef.current && select(svgRef.current!).transition().duration(250).call(zoomRef.current.scaleBy, 1 / 1.6) },
          { i: RotateCcw, l: "Reset view", f: () => zoomRef.current && select(svgRef.current!).transition().duration(300).call(zoomRef.current.transform, zoomIdentity) }].map(({ i: I, l, f }) => (
          <button key={l} aria-label={l} onClick={f} className="grid h-8 w-8 place-items-center rounded-lg border border-forest/30 bg-bg/80 text-mute backdrop-blur transition hover:border-forest hover:text-ink"><I size={15} /></button>
        ))}
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[10px] text-dim">
        <span>Fewer</span><span className="h-1.5 w-24 rounded-full" style={{ background: "linear-gradient(90deg, rgb(205,214,198), rgb(36,74,58))" }} /><span>More creators</span>
      </div>
      {hover && (
        <div className="panel pointer-events-none absolute z-10 min-w-[170px] p-3 text-xs shadow-2xl" style={{ left: Math.min(hover.x + 14, (svgRef.current?.clientWidth ?? 600) - 190), top: Math.max(hover.y - 70, 6) }}>
          <p className="font-heading text-sm font-semibold">{flag(hover.code)} {countryName(hover.code)}</p>
          {hov ? (
            <dl className="mt-1.5 space-y-0.5 text-mute">
              <div className="flex justify-between gap-4"><dt>Creators</dt><dd className="data text-ink">{hov.count.toLocaleString()}</dd></div>
              <div className="flex justify-between gap-4"><dt>Share</dt><dd className="data text-ink">{total ? ((hov.count / total) * 100).toFixed(1) : 0}%</dd></div>
              {hov.avg_score != null && <div className="flex justify-between gap-4"><dt>Avg score</dt><dd className="data text-ink">{hov.avg_score}</dd></div>}
              {hov.extra && <div className="text-dim">{hov.extra}</div>}
            </dl>
          ) : <p className="mt-1 text-dim">No creators discovered yet</p>}
          {onSelect && <p className="mt-1.5 text-[10px] text-forest">Click to {selected.includes(hover.code) ? "remove filter" : "filter"}</p>}
        </div>
      )}
    </div>
  );
}
