import { useId } from "react";

/** TubeLead mark: a play shape with a purple-to-yellow sweep and a teal wave, as in the brand artwork. */
export function LogoMark({ size = 36 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B1BD9" />
          <stop offset=".45" stopColor="#E0237F" />
          <stop offset=".75" stopColor="#FF7A1A" />
          <stop offset="1" stopColor="#FFD21F" />
        </linearGradient>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0E7C86" />
          <stop offset="1" stopColor="#21D9B0" />
        </linearGradient>
        <clipPath id={`c${id}`}><path d="M7 6 Q6 4 8 4 L41 22 Q43 24 41 26 L8 44 Q6 45 6 42 Z" /></clipPath>
      </defs>
      <path d="M7 6 Q6 4 8 4 L41 22 Q43 24 41 26 L8 44 Q6 45 6 42 Z" fill={`url(#g${id})`} />
      <g clipPath={`url(#c${id})`}>
        <path d="M0 30 Q14 22 24 30 T48 30 L48 48 L0 48 Z" fill={`url(#t${id})`} opacity=".95" />
      </g>
    </svg>
  );
}
export function Wordmark({ tagline = true, className = "" }: { tagline?: boolean; className?: string }) {
  return (
    <span className={`flex flex-col leading-none ${className}`}>
      <span className="font-display text-[21px] font-extrabold tracking-[-0.04em] text-ink">Tube<span className="bg-gradient-to-r from-[#E8284F] to-[#FF7A3D] bg-clip-text text-transparent">Lead</span></span>
      {tagline && <span className="label mt-1 !text-[9px] !tracking-[0.22em]">Creator discovery</span>}
    </span>
  );
}
