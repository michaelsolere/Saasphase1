import type { Metadata } from "next";

import { PublicApplicationForm } from "@/features/public-application/public-application-form";

export const metadata: Metadata = {
  title: "Candidature Golden Retriever 2026 | SaaS Élevage",
  description:
    "Formulaire public de candidature pour une future adoption de Golden Retriever.",
};

export default function GoldenRetrieverApplicationPage() {
  return <PublicApplicationForm formSlug="golden-retriever-2026" />;
}
