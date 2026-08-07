"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type RpcResult = {
  data: Array<{ outcome: string; manual_contact_id: string | null; reason: string | null }> | null;
  error: { message: string } | null;
};

function safeReturnPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/reservations?")) return "/reservations?view=current";
  try {
    const url = new URL(value, "http://localhost");
    return url.origin === "http://localhost" && url.pathname === "/reservations"
      ? `${url.pathname}${url.search}`
      : "/reservations?view=current";
  } catch {
    return "/reservations?view=current";
  }
}

export async function recordAdopterManualContact(formData: FormData) {
  const reservationId = formData.get("reservation_id");
  const expectedUpdatedAt = formData.get("expected_updated_at");
  const channel = formData.get("channel");
  const summary = formData.get("summary");
  const contactedAt = formData.get("contacted_at");
  const returnPath = safeReturnPath(formData.get("return_to"));
  const commandValue = formData.get("client_command_id");
  const commandId = typeof commandValue === "string" && /^[0-9a-f-]{36}$/i.test(commandValue)
    ? commandValue
    : randomUUID();

  if (
    typeof reservationId !== "string" || !/^[0-9a-f-]{36}$/i.test(reservationId) ||
    typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt ||
    typeof channel !== "string" || !["phone", "sms", "external_email", "visit", "video", "other"].includes(channel) ||
    typeof summary !== "string" || summary.trim().length < 3 || summary.trim().length > 1000 ||
    typeof contactedAt !== "string" || !contactedAt
  ) {
    redirect(`${returnPath}&contact_status=error`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const rpcClient = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
  };
  const { data, error } = await rpcClient.rpc("record_adopter_manual_contact", {
    p_reservation_id: reservationId,
    p_expected_reservation_updated_at: expectedUpdatedAt,
    p_channel: channel,
    p_summary: summary.trim(),
    p_contacted_at: new Date(contactedAt).toISOString(),
    p_client_command_id: commandId,
  });
  if (error) redirect(`${returnPath}&contact_status=error`);
  const outcome = data?.[0]?.outcome;
  if (outcome === "conflict") redirect(`${returnPath}&contact_status=conflict`);
  if (outcome !== "recorded" && outcome !== "already_recorded") {
    redirect(`${returnPath}&contact_status=error`);
  }
  revalidatePath("/reservations");
  revalidatePath(`/reservations/${reservationId}`);
  redirect(`${returnPath}&contact_status=success`);
}
