"use client";
import dynamic from "next/dynamic";

const Ph = ({ h }: { h: number }) => <div aria-hidden className="skeleton w-full" style={{ height: h }} />;
const mk = <K extends string>(name: K, h: number) => dynamic(() => import("./Charts").then((m) => (m as any)[name]), { ssr: false, loading: () => <Ph h={h} /> }) as any;

export const TrendChart = mk("TrendChart", 270);
export const NicheDonut = mk("NicheDonut", 300);
export const CountryBars = mk("CountryBars", 260);
export const QuotaChart = mk("QuotaChart", 200);
export const PerformanceChart = mk("PerformanceChart", 250);
export const CampaignChart = mk("CampaignChart", 250);
