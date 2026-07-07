"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function submissionUrl(
  submissionId: string,
  outcome: "success" | "archived" | "error",
) {
  return `/form-submissions/${submissionId}?resolution=${outcome}`;
}

export async function resolveSuspectFormSubmissionWithExistingContact(
  formData: FormData,
) {
  const submissionId = formData.get("form_submission_id");
  const contactId = formData.get("contact_id");

  if (
    typeof submissionId !== "string" ||
    !submissionId ||
    typeof contactId !== "string" ||
    !contactId
  ) {
    redirect("/form-submissions?resolution=error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc(
    "resolve_suspect_form_submission_existing_contact",
    {
      p_contact_id: contactId,
      p_form_submission_id: submissionId,
    },
  );

  if (error || !data?.[0]?.application_id) {
    redirect(submissionUrl(submissionId, "error"));
  }

  revalidatePath("/form-submissions");
  revalidatePath(`/form-submissions/${submissionId}`);
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${data[0].application_id}`);

  redirect(submissionUrl(submissionId, "success"));
}

export async function resolveSuspectFormSubmissionWithNewContact(
  formData: FormData,
) {
  const submissionId = formData.get("form_submission_id");

  if (typeof submissionId !== "string" || !submissionId) {
    redirect("/form-submissions?resolution=error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc(
    "resolve_suspect_form_submission_new_contact",
    {
      p_form_submission_id: submissionId,
    },
  );

  if (
    error ||
    !data?.[0]?.application_id ||
    !data?.[0]?.contact_id
  ) {
    redirect(submissionUrl(submissionId, "error"));
  }

  revalidatePath("/form-submissions");
  revalidatePath(`/form-submissions/${submissionId}`);
  revalidatePath(`/contacts/${data[0].contact_id}`);
  revalidatePath("/candidatures");
  revalidatePath(`/candidatures/${data[0].application_id}`);

  redirect(submissionUrl(submissionId, "success"));
}

export async function archiveSuspectFormSubmissionWithoutApplication(
  formData: FormData,
) {
  const submissionId = formData.get("form_submission_id");
  const internalComment = formData.get("internal_comment");

  if (typeof submissionId !== "string" || !submissionId) {
    redirect("/form-submissions?resolution=error");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc(
    "archive_suspect_form_submission_without_application",
    {
      p_form_submission_id: submissionId,
      p_internal_comment:
        typeof internalComment === "string" ? internalComment : undefined,
    },
  );

  if (error || !data?.[0]?.form_submission_id) {
    redirect(submissionUrl(submissionId, "error"));
  }

  revalidatePath("/form-submissions");
  revalidatePath(`/form-submissions/${submissionId}`);

  redirect(submissionUrl(submissionId, "archived"));
}
