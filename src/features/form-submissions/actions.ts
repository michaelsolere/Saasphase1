"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function submissionUrl(submissionId: string, outcome: "success" | "error") {
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
