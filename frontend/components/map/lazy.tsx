"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { WorldMap as WM } from "./WorldMap";

const Impl = dynamic(() => import("./WorldMap").then((m) => m.WorldMap), { ssr: false, loading: () => <div aria-hidden className="skeleton h-[360px] w-full" /> });
export const WorldMap = (p: ComponentProps<typeof WM>) => <Impl {...p} />;
