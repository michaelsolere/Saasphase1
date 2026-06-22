"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const actionTargets = {
  archive: "archived",
  qualify: "qualified",
  reject: "rejected",
  to_call: "to_call",
} as const;

type QualificationAction = keyof typeof actionTargets;

const transitions: Record<string, QualificationAction[]> = {
  new: ["archive"],
  to_review: ["to_call", "qualify", "reject", "archive"],
  to_call: ["archive"],
  qualified: ["archive"],
  waiting_litter: ["archive"],
  rejected: ["archive"],
  withdrawn: ["archive"],
  archived: [],
};

function isQualificationAction(value: string): value is QualificationAction {
  return value in actionTargets;
}

function detailUrl(applicationId: string, outcome: "success" | "error") {
  return `/candidatures/${applicationId}?action=${outcome}`;
}

export async function updateApplicationStatus(formData: FormData) {
  const applicationId = formData.get("application_id");
  const requestedAction = formData.get("qualification_action");

  if (
    typeof applicationId !== "string" ||
    typeof requestedAction !== "string" ||
    !isQualificationAction(requestedAction)
  ) {
    redirect("/candidatures?erreur=action");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: application, error: readError } = await supabase
    .from("applications")
    .select("id, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (readError || !application) {
    redirect(detailUrl(applicationId, "error"));
  }

  const allowedActions = transitions[application.status] ?? [];

  if (!allowedActions.includes(requestedAction)) {
    redirect(detailUrl(applicationId, "error"));
  }

  const nextStatus = actionTargets[requestedAction];
  const now = new Date().toISOString();
  const reviewFields =
    application.status === "to_review" && nextStatus !== "archived"
      ? {
          reviewed_at: now,
          reviewed_by: user.id,
        }
      : {};

  const { data: updatedApplication, error: updateError } = await supabase
    .from("applications")
    .update({
      status: nextStatus,
      updated_at: now,
      updated_by: user.id,
      ...reviewFields,
    })
    .eq("id", applicationId)
    .eq("status", application.status)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedApplication) {
    redirect(detailUrl(applicationId, "error"));
  }

  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${applicationId}`);
  redirect(detailUrl(applicationId, "success"));
}
