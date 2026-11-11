import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/overlay";
import { ChatWidget } from "@/components/support/ChatWidget";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "TubeLead — Find the creators. Build the connections. Grow your network.", template: "%s · TubeLead" },
  description: "TubeLead discovers YouTube creators at scale, scores them against your criteria and surfaces their publicly published business contact routes — so you spend time on relationships, not searching.",
  icons: { icon: "/favicon.svg" },
  openGraph: { title: "TubeLead", description: "Find the creators. Build the connections. Grow your network.", type: "website" },
};
export const viewport: Viewport = { themeColor: "#F7F4EC", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}<ChatWidget /></ToastProvider>
      </body>
    </html>
  );
}
