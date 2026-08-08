import { createHash } from "node:crypto";

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdopterProfilePublicForm } from "@/features/adopter-profile-questionnaire/public-form";
import {
  ADOPTER_PROFILE_PUBLIC_SESSION_COOKIE,
  readAdopterProfileSession,
} from "@/features/adopter-profile-questionnaire/public-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function AdopterProfileQuestionnairePage() {
  const token = (await cookies()).get(ADOPTER_PROFILE_PUBLIC_SESSION_COOKIE)?.value;
  if (!token) redirect("/profil-adoptant/indisponible");
  const sessionHash = createHash("sha256").update(token, "utf8").digest("hex");
  const session = await readAdopterProfileSession({ sessionHash }).catch(() => null);
  if (!session) redirect("/profil-adoptant/indisponible");
  return <AdopterProfilePublicForm session={session} />;
}
