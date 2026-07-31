import type { Metadata, Viewport } from "next";

import { PrivateAppShell } from "@/components/private-app-shell";
import { createClient } from "@/lib/supabase/server";

import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Élevage",
  description: "Socle technique du SaaS de gestion d’élevage.",
};

export const viewport: Viewport = {
  themeColor: "#315c43",
  colorScheme: "light",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">
        <PrivateAppShell initialIsAuthenticated={Boolean(user)}>
          {children}
        </PrivateAppShell>
      </body>
    </html>
  );
}
