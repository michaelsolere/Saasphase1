import { createHash } from "node:crypto";

import { cookies } from "next/headers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PublicQuestionnaireForm } from "@/features/post-adoption-questionnaire/public-questionnaire-form";
import {
  getPublicQuestionnaireState,
  type PublicQuestionnaireState,
} from "@/features/post-adoption-questionnaire/public-model";
import {
  POST_ADOPTION_PUBLIC_SESSION_COOKIE,
  readPublicQuestionnaireSession,
} from "@/features/post-adoption-questionnaire/public-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

function StateMessage({ state }: { state: PublicQuestionnaireState }) {
  const content =
    state === "validated"
      ? ["Réponse validée", "Votre réponse a été validée. Aucune nouvelle modification n’est possible."]
      : state === "expired"
        ? ["Période de réponse terminée", "La période prévue pour répondre ou réviser ce questionnaire est terminée."]
        : ["Questionnaire indisponible", "Ce questionnaire ne peut pas être utilisé actuellement."];
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border bg-surface p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Suivi post-adoption</p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">{content[0]}</h1>
        <p className="mt-4 leading-7 text-muted">{content[1]}</p>
      </section>
    </main>
  );
}

export default async function PublicQuestionnairePage() {
  const sessionToken = (await cookies()).get(POST_ADOPTION_PUBLIC_SESSION_COOKIE)?.value;
  if (!sessionToken) redirect("/suivi/indisponible");
  const sessionHash = createHash("sha256").update(sessionToken, "utf8").digest("hex");
  const session = await readPublicQuestionnaireSession({ sessionHash }).catch(() => null);
  if (!session) redirect("/suivi/indisponible");

  const state = getPublicQuestionnaireState({
    accessState: "active",
    instanceStatus: session.instanceStatus,
    responseDeadlineAt: session.responseDeadlineAt,
    publicReadUntil: session.publicReadUntil,
    latestRevisionNo: session.latestRevisionNo,
    latestSubmittedAt: session.latestSubmittedAt,
  });
  if (state !== "open" && state !== "submitted" && state !== "revisable") {
    return <StateMessage state={state} />;
  }

  return (
    <PublicQuestionnaireForm
      animalName={session.animalName}
      definition={session.definition}
      initialRevisionNo={session.latestRevisionNo ?? 0}
      latestSubmittedAt={session.latestSubmittedAt}
      sessionExpiresAt={session.sessionExpiresAt}
    />
  );
}
