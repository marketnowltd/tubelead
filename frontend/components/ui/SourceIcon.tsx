import { SOURCE_LOGOS } from "@/content/logos";

/** Provider names used by the API → brand marks (Simple Icons, see content/logos.ts). */
const KEY: Record<string, string> = { lastfm: "lastdotfm" };
export const SOURCE_LABEL: Record<string, string> = {
  youtube: "YouTube", google: "Google Search", brave: "Brave Search", applepodcasts: "Apple Podcasts", reddit: "Reddit", twitch: "Twitch",
  bluesky: "Bluesky", mastodon: "Mastodon", dailymotion: "Dailymotion", vimeo: "Vimeo", spotify: "Spotify", lastfm: "Last.fm", musicbrainz: "MusicBrainz",
};

/** A small logo showing where a result came from. Falls back to the source's name when there's no mark. */
export function SourceIcon({ source, size = 16, className }: { source: string; size?: number; className?: string }) {
  const logo = SOURCE_LOGOS[KEY[source] ?? source];
  const label = SOURCE_LABEL[source] ?? source;
  if (!logo) return <span className={"text-[10.5px] font-semibold text-mute " + (className ?? "")}>{label}</span>;
  return (
    <svg role="img" aria-label={`Found on ${label}`} viewBox="0 0 24 24" width={size} height={size} className={"shrink-0 " + (className ?? "")}>
      <title>{`Found on ${label}`}</title>
      <path d={logo.path} fill={logo.hex} />
    </svg>
  );
}
