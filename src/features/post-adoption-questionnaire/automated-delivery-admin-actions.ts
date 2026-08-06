"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  activatePostAdoptionAutomation,
  decidePostAdoptionAutomationException,
} from "./automated-delivery-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function postAdoptionRedirect(organizationId: string, key: "automation" | "exception", outcome: string) {
  return `/post-adoption?organization=${encodeURIComponent(organizationId)}&${key}=${encodeURIComponent(outcome)}`;
}

export async function activatePostAdoptionAutomationAction(formData: FormData) {
  const timezone = formData.get("timezone");
  const organizationId = formData.get("organization_id");
  if (timezone !== "Europe/Paris" || typeof organizationId !== "string" || !UUID.test(organizationId)) {
    redirect("/post-adoption?automation=invalid");
  }
  const outcome = await activatePostAdoptionAutomation(timezone, organizationId).catch(() => "technical_error");
  revalidatePath("/post-adoption");
  redirect(postAdoptionRedirect(organizationId, "automation", outcome));
}

export async function decidePostAdoptionAutomationExceptionAction(formData: FormData) {
  const instanceId = formData.get("instance_id");
  const organizationId = formData.get("organization_id");
  const decision = formData.get("decision");
  const reason = formData.get("reason");
  if (
    typeof organizationId !== "string" || !UUID.test(organizationId)
    || typeof instanceId !== "string" || !UUID.test(instanceId)
    || !["suspend", "resume", "authorize_late_send", "authorize_retry", "non_applicable"].includes(String(decision))
    || typeof reason !== "string"
  ) {
    redirect("/post-adoption?exception=invalid");
  }
  const outcome = await decidePostAdoptionAutomationException({
    organizationId,
    instanceId,
    decision: decision as "suspend" | "resume" | "authorize_late_send" | "authorize_retry" | "non_applicable",
    reason,
  }).catch(() => "technical_error");
  revalidatePath("/post-adoption");
  redirect(postAdoptionRedirect(organizationId, "exception", outcome));
}
