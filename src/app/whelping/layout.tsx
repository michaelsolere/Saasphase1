import type { Metadata } from "next";

import { WhelpingPwaClient } from "@/features/whelping/whelping-pwa-client";

export const metadata: Metadata = {
  title: "Mise-bas — SaaS Élevage",
  description: "Enregistrement mobile sécurisé des mises-bas et des naissances.",
  applicationName: "Mise-bas",
  robots: {
    index: false,
    follow: false,
  },
  appleWebApp: {
    capable: true,
    title: "Mise-bas",
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      {
        url: "/pwa/whelping-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/pwa/apple-touch-icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function WhelpingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <WhelpingPwaClient />
      {children}
    </>
  );
}
