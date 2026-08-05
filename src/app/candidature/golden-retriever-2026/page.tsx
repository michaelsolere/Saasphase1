import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSupabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Candidature Golden Retriever 2026 | SaaS Élevage",
  description:
    "Formulaire public de candidature pour une future adoption de Golden Retriever.",
};

export default function GoldenRetrieverApplicationPage() {
  const { organizationSlug } = getSupabaseConfig();
  redirect(`/candidature/${organizationSlug}/golden-retriever-2026`);
}
