"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { parsePublicFormDraft } from "./core";
import { resolvePublicFormOrganization } from "./server-context";
import { createClient } from "@/lib/supabase/server";

const path = "/settings/public-form";
const statusUrl = (status: string) => `${path}?status=${status}`;

export async function savePublicFormDraft(formData: FormData) {
  const expectedRevision = Number(formData.get("expected_revision") ?? 0);
  const parsed = parsePublicFormDraft({
    name: formData.get("name"), slug: formData.get("slug"), title: formData.get("title"),
    description: formData.get("description"), successMessage: formData.get("success_message"), breed: formData.get("breed"),
  });
  if (!Number.isSafeInteger(expectedRevision) || !parsed.ok) redirect(statusUrl("invalid"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const membership = await resolvePublicFormOrganization(supabase, user.id);
  if (!membership) redirect("/onboarding");
  const { error } = await supabase.rpc("save_standard_public_form_draft" as never, {
    p_organization_id: membership.organization_id, p_expected_revision: expectedRevision,
    p_name: parsed.value.name, p_slug: parsed.value.slug, p_title: parsed.value.title,
    p_description: parsed.value.description, p_success_message: parsed.value.successMessage, p_breed: parsed.value.breed,
  } as never);
  if (error) redirect(statusUrl(error.message.includes("Stale") ? "stale" : "error"));
  revalidatePath(path); redirect(statusUrl("saved"));
}

export async function changePublicFormLifecycle(formData: FormData) {
  const operation = String(formData.get("operation") ?? "");
  const expectedRevision = Number(formData.get("expected_revision") ?? 0);
  if (!["publish", "withdraw", "reactivate"].includes(operation) || !Number.isSafeInteger(expectedRevision)) redirect(statusUrl("invalid"));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const membership = await resolvePublicFormOrganization(supabase, user.id);
  if (!membership) redirect("/onboarding");
  const { data: form } = await supabase
    .from("public_forms")
    .select("id")
    .eq("organization_id", membership.organization_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!form) redirect(statusUrl("error"));
  const { error } = await supabase.rpc("change_standard_public_form_lifecycle" as never, {
    p_public_form_id: form.id, p_expected_revision: expectedRevision, p_command_id: randomUUID(), p_operation: operation,
  } as never);
  if (error) redirect(statusUrl(error.message.includes("Stale") ? "stale" : "error"));
  revalidatePath(path); redirect(statusUrl(operation === "publish" ? "published" : operation === "withdraw" ? "withdrawn" : "reactivated"));
}
