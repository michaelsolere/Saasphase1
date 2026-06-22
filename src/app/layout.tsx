import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Élevage",
  description: "Socle technique du SaaS de gestion d’élevage.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
