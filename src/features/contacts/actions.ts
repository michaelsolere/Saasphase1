"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createContactNote(formData: FormData) {
  const contactId = formData.get("contact_id");
  const body = formData.get("body");

  if (
    typeof contactId !== "string" ||
    typeof body !== "string" ||
    !body.trim()
  ) {
    if (typeof contactId === "string") {
      redirect(`/contacts/${contactId}?note_status=error`);
    } else {
      redirect("/contacts?erreur=note");
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Relire le contact côté serveur pour récupérer l'organization_id
  const { data: contact, error: readError } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("id", contactId)
    .maybeSingle();

  if (readError || !contact || !contact.organization_id) {
    redirect(`/contacts/${contactId}?note_status=error`);
  }

  const { error: insertError } = await supabase
    .from("notes")
    .insert({
      contact_id: contact.id,
      organization_id: contact.organization_id,
      body: body.trim(),
      note_type: "internal",
      visibility: "internal",
      created_by: user.id,
    });

  if (insertError) {
    redirect(`/contacts/${contactId}?note_status=error`);
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  redirect(`/contacts/${contactId}?note_status=success`);
}
