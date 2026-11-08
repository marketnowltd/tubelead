/** TubeLead mark: a play-button tile whose tip fans out into a small network of connections. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect x="1.5" y="5" width="30" height="30" rx="9" fill="#244A3A" />
      <path d="M12.5 13.2v13.6l11-6.8z" fill="#F7F4EC" />
      <path d="M23.5 20 33 11.5M23.5 20h9.5M23.5 20l9 8.5" stroke="#C8795B" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <circle cx="33.5" cy="11" r="3" fill="#C8795B" />
      <circle cx="35" cy="20" r="3" fill="#C6A46B" />
      <circle cx="33" cy="29" r="3" fill="#A5B39D" />
    </svg>
  );
}
export function Wordmark({ tagline = true, className = "" }: { tagline?: boolean; className?: string }) {
  return (
    <span className={`flex flex-col leading-none ${className}`}>
      <span className="font-display text-[21px] font-extrabold tracking-[-0.04em] text-ink">Tube<span className="text-forest">Lead</span></span>
      {tagline && <span className="label mt-1 !text-[9px] !tracking-[0.22em]">Creator discovery</span>}
    </span>
  );
}
