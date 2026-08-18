import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runTransactionalCampaignDelivery,
  type TransactionalEmailTransport,
} from "@/features/communications/transactional-campaign-core";
import {
  getBrevoConfigurationStatus,
  getBrevoTransactionalTemplate,
  sendBrevoTransactionalEmail,
} from "@/lib/brevo/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

const CAMPAIGN_KEY = "choice_assignment_confirmation";
type Typed = SupabaseClient<Database>;
type Loose = SupabaseClient;

function transport(): TransactionalEmailTransport {
  return {
    isConfigured: () => getBrevoConfigurationStatus().isConfigured,
    getTemplate: getBrevoTransactionalTemplate,
    sendEmail: sendBrevoTransactionalEmail,
  };
}

export async function sendChoiceAssignmentConfirmation(
  assignmentEventId: string,
  options?: { supabase?: Typed; emailTransport?: TransactionalEmailTransport },
) {
  const supabase = options?.supabase ?? await createClient();
  const loose = supabase as unknown as Loose;
  const eventResult = await loose.from("animal_assignment_events").select("id,organization_id,reservation_id,animal_id,presentation_media_id,event_type").eq("id", assignmentEventId).maybeSingle();
  const event = eventResult.data as { id: string; organization_id: string; reservation_id: string; animal_id: string; presentation_media_id: string | null; event_type: string } | null;
  if (eventResult.error || !event) return { outcome: "failed" as const, errorCode: "assignment_event_not_found" };
  return runTransactionalCampaignDelivery({
    campaignKey: CAMPAIGN_KEY,
    operationVersion: `assignment:${event.id}:v1`,
    context: { organizationId: event.organization_id, roles: ["owner", "admin"] },
    transport: options?.emailTransport ?? transport(),
    prepareOperation: async () => {
      const reservationResult = await loose.from("reservations").select("contact_id,litter_id,animal_id").eq("id", event.reservation_id).maybeSingle();
      const reservation = reservationResult.data as { contact_id: string; litter_id: string; animal_id: string } | null;
      if (!reservation || reservation.animal_id !== event.animal_id) return { ok: false as const, errorCode: "assignment_changed" };
      const [contactResult, animalResult, litterResult, mediaResult] = await Promise.all([
        loose.from("contacts").select("email,display_name,first_name").eq("id", reservation.contact_id).is("deleted_at", null).maybeSingle(),
        loose.from("animals").select("call_name,official_name").eq("id", event.animal_id).is("deleted_at", null).maybeSingle(),
        loose.from("litters").select("name").eq("id", reservation.litter_id).is("deleted_at", null).maybeSingle(),
        event.presentation_media_id
          ? loose.from("media").select("file_path").eq("id", event.presentation_media_id).eq("animal_id", event.animal_id).is("deleted_at", null).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const contact = contactResult.data as { email: string | null; display_name: string | null; first_name: string | null } | null;
      const animal = animalResult.data as { call_name: string | null; official_name: string | null } | null;
      const litter = litterResult.data as { name: string | null } | null;
      const media = mediaResult.data as { file_path: string } | null;
      if (!contact?.email || !animal) return { ok: false as const, errorCode: "confirmation_context_missing" };
      let photoUrl = "";
      if (media?.file_path) {
        const signed = await supabase.storage.from("animal-media").createSignedUrl(media.file_path, 7 * 24 * 60 * 60);
        if (signed.error || !signed.data?.signedUrl) return { ok: false as const, errorCode: "presentation_photo_unavailable" };
        photoUrl = signed.data.signedUrl;
      }
      const animalName = animal.call_name ?? animal.official_name ?? "Votre chiot";
      return {
        ok: true as const,
        operation: {
          dossierId: event.id,
          contactId: reservation.contact_id,
          reservationId: event.reservation_id,
          litterId: reservation.litter_id,
          recipientEmail: contact.email,
          recipientName: contact.display_name,
          variables: {
            prenom: contact.first_name ?? contact.display_name ?? "",
            portee: litter?.name ?? "Portée",
            nom_chiot: animalName,
            photo_chiot: photoUrl,
          },
          variablesSnapshot: {
            prenom: contact.first_name ?? contact.display_name ?? "",
            portee: litter?.name ?? "Portée",
            nom_chiot: animalName,
            photo_chiot: photoUrl ? "[REDACTED_SIGNED_URL]" : "",
            presentation_media_id: event.presentation_media_id,
          },
        },
      };
    },
  }, { supabase });
}
