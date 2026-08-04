"use server";

import { revalidatePath } from "next/cache";

import {
  createOrRotatePublicAccess,
  revokePublicAccess,
} from "./internal-service";
import {
  buildPostAdoptionQuestionnairePath,
  generatePostAdoptionQuestionnaireToken,
  hashPostAdoptionQuestionnaireToken,
} from "./public-token";

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
