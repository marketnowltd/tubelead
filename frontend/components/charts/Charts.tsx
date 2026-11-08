"use client";
import { useReducedMotion } from "framer-motion";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { countryName, flag } from "@/lib/countries";
import { compact, dateShort } from "@/lib/format";
import type { Overview } from "@/lib/types";

export const PALETTE = ["#244A3A", "#C8795B", "#C6A46B", "#8FA088", "#37624F", "#A5502F", "#B89556", "#6F8668", "#DDA18A", "#536A4B", "#7F6226", "#B9C5B2"];
const axis = { stroke: "#6B6962", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="rgba(36,74,58,.25)" vertical={false} />;
const tip = { contentStyle: { background: "#FFFDF8", border: "1px solid rgba(36,74,58,.25)", borderRadius: 10, fontSize: 12, color: "#22231F", boxShadow: "0 12px 30px rgba(34,35,31,.18)" }, labelStyle: { color: "#55534D", marginBottom: 4 }, itemStyle: { color: "#22231F" }, cursor: { fill: "rgba(36,74,58,.25)", stroke: "rgba(36,74,58,.25)" } };
const useAnim = () => { const r = useReducedMotion(); return { isAnimationActive: !r, animationDuration: 900, animationEasing: "ease-out" as const }; };

export function TrendChart({ data }: { data: Overview["trend"] }) {
  const a = useAnim();
  return (
    <ResponsiveContainer width="100%" height={270}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#244A3A" stopOpacity=".28" /><stop offset="1" stopColor="#244A3A" stopOpacity="0" /></linearGradient>
          <linearGradient id="gQ" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C8795B" stopOpacity=".25" /><stop offset="1" stopColor="#C8795B" stopOpacity="0" /></linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="date" tickFormatter={dateShort} {...axis} minTickGap={32} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tip} labelFormatter={(l) => dateShort(String(l))} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#55534D" }} />
        <Area {...a} type="monotone" dataKey="discovered" name="Discovered" stroke="#244A3A" strokeWidth={2.2} fill="url(#gD)" />
        <Area {...a} type="monotone" dataKey="qualified" name="Qualified (≥70)" stroke="#C8795B" strokeWidth={2.2} fill="url(#gQ)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function NicheDonut({ data }: { data: Overview["niches"] }) {
  const a = useAnim();
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-[190px] w-[190px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie {...a} data={data} dataKey="count" nameKey="niche" innerRadius={62} outerRadius={88} paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip {...tip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="data text-2xl font-semibold">{compact(total)}</p><p className="label">creators</p></div></div>
      </div>
      <ul className="grid w-full grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
        {data.slice(0, 12).map((d, i) => (
          <li key={d.niche} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 truncate"><i className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="truncate text-mute">{d.niche}</span></span><span className="data text-ink">{d.count}</span></li>
        ))}
      </ul>
    </div>
  );
}

export function CountryBars({ data }: { data: Overview["countries"] }) {
  const a = useAnim();
  const rows = data.slice(0, 8).map((d) => ({ ...d, name: `${flag(d.country)} ${countryName(d.country)}` }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={118} {...axis} tick={{ fill: "#55534D", fontSize: 12 }} />
        <Tooltip {...tip} />
        <Bar {...a} dataKey="count" name="Creators" radius={[0, 6, 6, 0]} barSize={14}>
          {rows.map((_, i) => <Cell key={i} fill={`url(#cb${i % 2})`} />)}
        </Bar>
        <defs>
          <linearGradient id="cb0" x1="0" x2="1"><stop offset="0" stopColor="#244A3A" /><stop offset="1" stopColor="#C8795B" /></linearGradient>
          <linearGradient id="cb1" x1="0" x2="1"><stop offset="0" stopColor="#37624F" /><stop offset="1" stopColor="#6F8668" /></linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function QuotaChart({ week, limit }: { week: Overview["quota"]["week"]; limit: number }) {
  const a = useAnim();
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={week} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
        {grid}
        <XAxis dataKey="date" tickFormatter={dateShort} {...axis} />
        <YAxis {...axis} domain={[0, limit]} tickFormatter={compact} />
        <Tooltip {...tip} labelFormatter={(l) => dateShort(String(l))} formatter={(v: any) => [`${Number(v).toLocaleString()} units`, "Used"]} />
        <Bar {...a} dataKey="units" radius={[6, 6, 0, 0]} fill="#6F8668" barSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PerformanceChart({ data }: { data: Overview["search_performance"] }) {
  const a = useAnim();
  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={data} margin={{ top: 10, right: 0, left: -18, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" />
        <YAxis yAxisId="l" {...axis} />
        <YAxis yAxisId="r" orientation="right" {...axis} tickFormatter={(v) => `${v}%`} />
        <Tooltip {...tip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#55534D" }} />
        <Bar {...a} yAxisId="l" dataKey="unique" name="Unique channels" fill="#244A3A" radius={[4, 4, 0, 0]} barSize={14} />
        <Bar {...a} yAxisId="l" dataKey="qualified" name="Qualified" fill="#536A4B" radius={[4, 4, 0, 0]} barSize={14} />
        <Line {...a} yAxisId="r" type="monotone" dataKey="conversion" name="Conversion %" stroke="#C8795B" strokeWidth={2.4} dot={{ r: 3, fill: "#C8795B" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function CampaignChart({ data }: { data: Overview["campaigns"] }) {
  const a = useAnim();
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 10, right: 0, left: -18, bottom: 0 }}>
        {grid}
        <XAxis dataKey="name" {...axis} tickFormatter={(s: string) => (s.length > 14 ? s.slice(0, 13) + "…" : s)} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip {...tip} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: "#55534D" }} />
        <Bar {...a} dataKey="leads" name="Leads" fill="#244A3A" radius={[4, 4, 0, 0]} />
        <Bar {...a} dataKey="contacted" name="Contacted" fill="#6F8668" radius={[4, 4, 0, 0]} />
        <Bar {...a} dataKey="replied" name="Replied" fill="#C8795B" radius={[4, 4, 0, 0]} />
        <Bar {...a} dataKey="converted" name="Converted" fill="#536A4B" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
