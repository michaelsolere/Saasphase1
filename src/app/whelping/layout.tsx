import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Mise-bas mobile | SaaS Élevage",
  description:
    "Interface mobile sécurisée pour le suivi en ligne d’une mise-bas.",
  manifest: "/whelping.webmanifest",
  robots: {
    index: false,
    follow: false,
  },
  appleWebApp: {
    capable: true,
    title: "Mise-bas",
    statusBarStyle: "default",
  },
  icons: {
    apple: [{ url: "/whelping-icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#315c43",
};

export default function WhelpingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
