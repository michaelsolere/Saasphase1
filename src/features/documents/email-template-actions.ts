"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  defaultEmailTemplateKeys,
  defaultEmailTemplates,
  type EmailTemplateCategory,
} from "./email-template-defaults";

const emailTemplatesPath = "/documents/email-templates";
const validTemplateKeys = new Set(defaultEmailTemplateKeys);

export type EmailTemplateRecord = {
  id: string;
  templateKey: string;
  title: string;
  category: EmailTemplateCategory;
  context: string;
  subject: string;
  body: string;
  updatedAt: string;
};

function statusUrl(outcome: "created" | "duplicate" | "success" | "error") {
  return `${emailTemplatesPath}?template_status=${outcome}`;
}

function normalizeRequiredText(
  value: FormDataEntryValue | null,
  maxLength: number,
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.slice(0, maxLength);
}

function buildCustomTemplateKey(title: string) {
  const normalizedTitle = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  return `custom_${normalizedTitle || "modele"}`;
}

function isEmailTemplateCategory(
  value: FormDataEntryValue | null,
): value is EmailTemplateCategory {
  return (
    value === "adopter_journey" ||
    value === "post_adoption" ||
    value === "candidate_journey"
  );
}

async function requireWritableOrganization() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .in("role", ["owner", "admin", "member"])
    .limit(1)
    .maybeSingle();

  if (error || !membership) {
    redirect(statusUrl("error"));
  }

  return {
    supabase,
    userId: user.id,
    organizationId: membership.organization_id,
  };
}

async function ensureDefaultEmailTemplates({
  organizationId,
  supabase,
  userId,
}: {
  organizationId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
}) {
  const { data: existingTemplates, error: readError } = await supabase
    .from("email_templates")
    .select("template_key")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (readError || !existingTemplates) {
    redirect(statusUrl("error"));
  }

  const existingKeys = new Set(
    existingTemplates.map((template) => template.template_key),
  );
  const missingTemplates = defaultEmailTemplates.filter(
    (template) => !existingKeys.has(template.templateKey),
  );

  if (missingTemplates.length === 0) {
    return;
  }

  const { error: upsertError } = await supabase.from("email_templates").upsert(
    missingTemplates.map((template) => ({
      organization_id: organizationId,
      template_key: template.templateKey,
      title: template.title,
      category: template.category,
      subject: template.subject,
      body: template.body,
      is_active: true,
      created_by: userId,
      updated_by: userId,
    })),
    {
      onConflict: "organization_id,template_key",
      ignoreDuplicates: true,
    },
  );

  if (upsertError) {
    redirect(statusUrl("error"));
  }
}

export async function getEmailTemplatesForCurrentOrganization() {
  const { organizationId, supabase, userId } = await requireWritableOrganization();

  await ensureDefaultEmailTemplates({ organizationId, supabase, userId });

  const { data: emailTemplates, error } = await supabase
    .from("email_templates")
    .select("id, template_key, title, category, subject, body, created_at, updated_at")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error || !emailTemplates) {
    redirect(statusUrl("error"));
  }

  const templateByKey = new Map(
    emailTemplates.map((template) => [template.template_key, template]),
  );

  const defaultTemplateRecords = defaultEmailTemplates.map((defaultTemplate) => {
    const template = templateByKey.get(defaultTemplate.templateKey);

    if (!template) {
      return {
        id: defaultTemplate.templateKey,
        templateKey: defaultTemplate.templateKey,
        title: defaultTemplate.title,
        category: defaultTemplate.category,
        context: defaultTemplate.context,
        subject: defaultTemplate.subject,
        body: defaultTemplate.body,
        updatedAt: "",
      };
    }

    return {
      id: template.id,
      templateKey: template.template_key,
      title: template.title,
      category: template.category as EmailTemplateCategory,
      context: defaultTemplate.context,
      subject: template.subject,
      body: template.body,
      updatedAt: template.updated_at,
    };
  }) satisfies EmailTemplateRecord[];

  const customTemplateRecords = emailTemplates
    .filter((template) => !validTemplateKeys.has(template.template_key))
    .map((template) => ({
      id: template.id,
      templateKey: template.template_key,
      title: template.title,
      category: template.category as EmailTemplateCategory,
      context: "Modèle personnalisé.",
      subject: template.subject,
      body: template.body,
      updatedAt: template.updated_at,
    })) satisfies EmailTemplateRecord[];

  return [...defaultTemplateRecords, ...customTemplateRecords];
}

export async function updateEmailTemplate(formData: FormData) {
  const templateKey = normalizeRequiredText(formData.get("template_key"), 80);
  const title = normalizeRequiredText(formData.get("title"), 120);
  const category = formData.get("category");
  const subject = normalizeRequiredText(formData.get("subject"), 255);
  const body = normalizeRequiredText(formData.get("body"), 20_000);

  if (!templateKey || !title || !isEmailTemplateCategory(category) || !subject || !body) {
    redirect(statusUrl("error"));
  }

  const { organizationId, supabase, userId } = await requireWritableOrganization();
  await ensureDefaultEmailTemplates({ organizationId, supabase, userId });

  const { data: template, error: readError } = await supabase
    .from("email_templates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (readError || !template) {
    redirect(statusUrl("error"));
  }

  const { error } = await supabase
    .from("email_templates")
    .update({
      title,
      category,
      subject,
      body,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .is("deleted_at", null);

  if (error) {
    redirect(statusUrl("error"));
  }

  revalidatePath(emailTemplatesPath);
  redirect(statusUrl("success"));
}

export async function createEmailTemplate(formData: FormData) {
  const title = normalizeRequiredText(formData.get("title"), 120);
  const category = formData.get("category");
  const subject = normalizeRequiredText(formData.get("subject"), 255);
  const body = normalizeRequiredText(formData.get("body"), 20_000);

  if (!title || !isEmailTemplateCategory(category) || !subject || !body) {
    redirect(statusUrl("error"));
  }

  const templateKey = buildCustomTemplateKey(title);
  const { organizationId, supabase, userId } = await requireWritableOrganization();
  await ensureDefaultEmailTemplates({ organizationId, supabase, userId });

  const { data: existingTemplate, error: readError } = await supabase
    .from("email_templates")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_key", templateKey)
    .maybeSingle();

  if (readError) {
    redirect(statusUrl("error"));
  }

  if (existingTemplate) {
    redirect(statusUrl("duplicate"));
  }

  const { error } = await supabase.from("email_templates").insert({
    organization_id: organizationId,
    template_key: templateKey,
    title,
    category,
    subject,
    body,
    is_active: true,
    created_by: userId,
    updated_by: userId,
  });

  if (error) {
    redirect(statusUrl("error"));
  }

  revalidatePath(emailTemplatesPath);
  redirect(`${statusUrl("created")}#${templateKey}`);
}
