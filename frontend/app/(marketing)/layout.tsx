import type { ReactNode } from "react";
import { Motion } from "@/components/marketing/bits";
import { MarketingNav } from "@/components/marketing/Nav";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <Motion>
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-forest focus:px-4 focus:py-2 focus:text-paper">Skip to content</a>
      <MarketingNav />
      <main id="content">{children}</main>
    </Motion>
  );
}
