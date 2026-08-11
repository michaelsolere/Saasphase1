import type { Metadata, Viewport } from "next";

import { PrivateAppShell } from "@/components/private-app-shell";
import { loadPositioningAttentionCount } from "@/features/reservations/positioning-overview-data";
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
  let positioningAttentionCount = 0;
  if (user) {
    try {
      positioningAttentionCount = await loadPositioningAttentionCount(supabase);
    } catch (error) {
      console.error("Unable to load positioning navigation summary", error);
    }
  }

  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">
        <PrivateAppShell
          initialIsAuthenticated={Boolean(user)}
          positioningAttentionCount={positioningAttentionCount}
        >
          {children}
        </PrivateAppShell>
      </body>
    </html>
  );
}
