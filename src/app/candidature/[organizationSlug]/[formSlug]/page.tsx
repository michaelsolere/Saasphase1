import type { Metadata } from "next";

import { PublicApplicationForm } from "@/features/public-application/public-application-form";

export const metadata: Metadata = {
  title: "Candidature d’adoption",
  description: "Formulaire public de candidature d’adoption.",
  robots: { index: false, follow: false },
};

export default async function PublicApplicationPage({ params }: { params: Promise<{ organizationSlug: string; formSlug: string }> }) {
  const { organizationSlug, formSlug } = await params;
  return <PublicApplicationForm organizationSlug={organizationSlug} formSlug={formSlug} />;
}