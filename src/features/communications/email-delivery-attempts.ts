import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildEmailDeliveryIdempotencyKey,
  claimEmailDeliveryAttemptForSend as claimEmailDeliveryAttemptForSendCore,
  markEmailDeliveryAttemptFailed as markEmailDeliveryAttemptFailedCore,
  markEmailDeliveryAttemptSent as markEmailDeliveryAttemptSentCore,
  prepareEmailDeliveryAttempt as prepareEmailDeliveryAttemptCore,
  snapshotEmailDeliveryAttemptAttachments as snapshotEmailDeliveryAttemptAttachmentsCore,
  snapshotEmailDeliveryAttemptBrevoTemplate as snapshotEmailDeliveryAttemptBrevoTemplateCore,
  type BuildEmailDeliveryIdempotencyKeyInput,
  type ClaimEmailDeliveryAttemptForSendResult,
  type EmailDeliveryAttemptErrorCode,
  type EmailDeliveryAttemptResult,
  type EmailDeliveryAttemptSnapshotResult,
  type EmailDeliveryAttemptTransitionResult,
  type PrepareEmailDeliveryAttemptInput,
} from "@/features/communications/email-delivery-attempts-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

export { buildEmailDeliveryIdempotencyKey };
export type {
  BuildEmailDeliveryIdempotencyKeyInput,
  ClaimEmailDeliveryAttemptForSendResult,
  EmailDeliveryAttemptErrorCode,
  EmailDeliveryAttemptResult,
  EmailDeliveryAttemptSnapshotResult,
  EmailDeliveryAttemptTransitionResult,
  PrepareEmailDeliveryAttemptInput,
};

async function resolveSupabase(supabaseClient?: Supabase) {
  return supabaseClient ?? (await createClient());
}

export async function prepareEmailDeliveryAttempt(
  input: PrepareEmailDeliveryAttemptInput,
  supabaseClient?: Supabase,
): Promise<EmailDeliveryAttemptResult> {
  return prepareEmailDeliveryAttemptCore(input, await resolveSupabase(supabaseClient));
}

export async function claimEmailDeliveryAttemptForSend(
  input: Parameters<typeof claimEmailDeliveryAttemptForSendCore>[0],
  supabaseClient?: Supabase,
): Promise<ClaimEmailDeliveryAttemptForSendResult> {
  return claimEmailDeliveryAttemptForSendCore(
    input,
    await resolveSupabase(supabaseClient),
  );
}

export async function snapshotEmailDeliveryAttemptBrevoTemplate(
  input: Parameters<typeof snapshotEmailDeliveryAttemptBrevoTemplateCore>[0],
  supabaseClient?: Supabase,
): Promise<EmailDeliveryAttemptSnapshotResult> {
  return snapshotEmailDeliveryAttemptBrevoTemplateCore(
    input,
    await resolveSupabase(supabaseClient),
  );
}

export async function snapshotEmailDeliveryAttemptAttachments(
  input: Parameters<typeof snapshotEmailDeliveryAttemptAttachmentsCore>[0],
  supabaseClient?: Supabase,
): Promise<EmailDeliveryAttemptSnapshotResult> {
  return snapshotEmailDeliveryAttemptAttachmentsCore(
    input,
    await resolveSupabase(supabaseClient),
  );
}

export async function markEmailDeliveryAttemptSent(
  input: Parameters<typeof markEmailDeliveryAttemptSentCore>[0],
  supabaseClient?: Supabase,
): Promise<EmailDeliveryAttemptTransitionResult> {
  return markEmailDeliveryAttemptSentCore(input, await resolveSupabase(supabaseClient));
}

export async function markEmailDeliveryAttemptFailed(
  input: Parameters<typeof markEmailDeliveryAttemptFailedCore>[0],
  supabaseClient?: Supabase,
): Promise<EmailDeliveryAttemptTransitionResult> {
  return markEmailDeliveryAttemptFailedCore(
    input,
    await resolveSupabase(supabaseClient),
  );
}
