"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createOrRotatePublicAccess,
  revokePublicAccess,
} from "./internal-service";
import {
  buildPostAdoptionQuestionnairePath,
  generatePostAdoptionQuestionnaireToken,
  hashPostAdoptionQuestionnaireToken,
} from "./public-token";
import {
  encryptPostAdoptionQuestionnaireToken,
  getPostAdoptionEncryptionConfig,
} from "./token-encryption";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicAccessActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  publicPath?: string;
};

function formIds(formData: FormData) {
  const instanceId = formData.get("instance_id");
  const reservationId = formData.get("reservation_id");
  return typeof instanceId === "string" && UUID.test(instanceId) &&
    typeof reservationId === "string" && UUID.test(reservationId)
    ? { instanceId, reservationId }
    : null;
}

export async function rotatePublicQuestionnaireAccessAction(
  _previous: PublicAccessActionState,
  formData: FormData,
): Promise<PublicAccessActionState> {
  const ids = formIds(formData);
  if (!ids) return { status: "error", message: "Action invalide." };
  const token = generatePostAdoptionQuestionnaireToken();
  const result = await createOrRotatePublicAccess({
    instanceId: ids.instanceId,
    tokenHash: hashPostAdoptionQuestionnaireToken(token),
    tokenHint: token.slice(-6),
  }).catch(() => null);
  if (result?.outcome !== "success") {
    return {
      status: "error",
      message: result?.outcome === "forbidden"
        ? "Seuls le propriétaire et les administrateurs peuvent gérer ce lien."
        : result?.outcome === "invalid_state"
          ? "Ce questionnaire ne peut pas recevoir de lien dans son état actuel."
          : "Le lien n’a pas pu être créé.",
    };
  }
  const service = createServiceRoleClient() as unknown as SupabaseClient;
  const instance = await service
    .from("post_adoption_questionnaire_instances")
    .select("organization_id")
    .eq("id", ids.instanceId)
    .maybeSingle();
  const settings = instance.data?.organization_id
    ? await service
        .from("organization_settings")
        .select("post_adoption_automation_activated_at")
        .eq("organization_id", instance.data.organization_id)
        .maybeSingle()
    : null;
  let encryption = null;
  try {
    encryption = getPostAdoptionEncryptionConfig();
  } catch {
    encryption = null;
  }
  if (encryption) {
    const encrypted = encryptPostAdoptionQuestionnaireToken(
      token,
      encryption.currentKey,
      encryption.currentVersion,
    );
    const sealed = result.access_id
      ? await service.rpc("seal_post_adoption_questionnaire_public_access", {
          p_access_id: result.access_id,
          p_token_hash: hashPostAdoptionQuestionnaireToken(token),
          p_token_ciphertext: encrypted.ciphertext,
          p_token_iv: encrypted.iv,
          p_token_auth_tag: encrypted.authTag,
          p_token_key_version: encrypted.keyVersion,
        })
      : null;
    if (!sealed || sealed.error || sealed.data !== true) {
      await revokePublicAccess({ instanceId: ids.instanceId }).catch(() => null);
      return {
        status: "error",
        message: "Le lien sécurisé n’a pas pu être chiffré. Aucun lien actif n’a été conservé.",
      };
    }
  } else if (settings?.data?.post_adoption_automation_activated_at) {
    await revokePublicAccess({ instanceId: ids.instanceId }).catch(() => null);
    return {
      status: "error",
      message: "Le chiffrement des liens automatiques n’est pas configuré.",
    };
  }
  revalidatePath(`/reservations/${ids.reservationId}`);
  return {
    status: "success",
    message: "Le nouveau lien est actif. Tout ancien lien a été révoqué immédiatement.",
    publicPath: buildPostAdoptionQuestionnairePath(token),
  };
}

export async function revokePublicQuestionnaireAccessAction(
  _previous: PublicAccessActionState,
  formData: FormData,
): Promise<PublicAccessActionState> {
  const ids = formIds(formData);
  if (!ids) return { status: "error", message: "Action invalide." };
  const result = await revokePublicAccess({ instanceId: ids.instanceId }).catch(() => null);
  if (result?.outcome !== "success" && result?.outcome !== "already_revoked") {
    return { status: "error", message: "Le lien n’a pas pu être révoqué." };
  }
  revalidatePath(`/reservations/${ids.reservationId}`);
  return {
    status: "success",
    message: result.outcome === "already_revoked" ? "Aucun lien actif." : "Le lien a été révoqué immédiatement.",
  };
}
