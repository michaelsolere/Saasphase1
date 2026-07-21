import { z } from "zod";

import type {
  CancelLitterRoutineWeightInput,
  CancelLitterRoutineWeightResult,
  CancelLitterWeighingSessionInput,
  CancelLitterWeighingSessionResult,
  CorrectLitterRoutineWeightInput,
  CorrectLitterRoutineWeightResult,
  RecordLitterRoutineWeightsInput,
  RecordLitterRoutineWeightsResult,
  LitterWeightServiceError,
} from "./litter-weights-core";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_WITH_OFFSET_SCHEMA = z.string().datetime({ offset: true });
const MAX_ANIMALS = 30;
const MAX_NOTE_LENGTH = 5_000;
const MAX_TIMEZONE_LENGTH = 255;
const MAX_WEIGHT_GRAMS = 100_000;
const MAX_REASON_LENGTH = 500;

export type LitterWeightMeasurementAdjustmentIntention = {
  litterId: string;
  sessionId: string;
  measurementId: string;
  animalId: string;
  expectedRevisionNo: number;
  clientCommandId: string;
};

export type LitterWeightSessionCancellationIntention = {
  litterId: string;
  sessionId: string;
  expectedRevisionNo: number;
  clientCommandId: string;
};

export type LitterWeightAdjustmentActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  stale?: boolean;
};

export const initialLitterWeightAdjustmentActionState = {
  status: "idle",
} satisfies LitterWeightAdjustmentActionState;

export type LitterWeightAdjustmentActionDependencies = {
  correctWeight: (input: CorrectLitterRoutineWeightInput) => Promise<CorrectLitterRoutineWeightResult>;
  cancelWeight: (input: CancelLitterRoutineWeightInput) => Promise<CancelLitterRoutineWeightResult>;
  cancelSession: (input: CancelLitterWeighingSessionInput) => Promise<CancelLitterWeighingSessionResult>;
  revalidatePath: (path: string) => void;
};

export type RecordLitterRoutineWeightsIntention = {
  litterId: string;
  clientCommandId: string;
  animalIds: string[];
};

export type LitterRoutineWeightsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  measurementCount?: number;
  replayed?: boolean;
};

export const initialLitterRoutineWeightsActionState = {
  status: "idle",
} satisfies LitterRoutineWeightsActionState;

export type LitterRoutineWeightsActionDependencies = {
  recordWeights: (
    input: RecordLitterRoutineWeightsInput,
  ) => Promise<RecordLitterRoutineWeightsResult>;
  revalidatePath: (path: string) => void;
};

function error(message: string): LitterRoutineWeightsActionState {
  return { status: "error", message };
}

function formString(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : null;
}

function adjustmentError(message: string, stale = false): LitterWeightAdjustmentActionState {
  return { status: "error", message, ...(stale ? { stale: true } : {}) };
}

function adjustmentServiceMessage(serviceError: LitterWeightServiceError) {
  switch (serviceError.code) {
    case "stale_revision": return { message: "Cette pesée a été modifiée depuis son affichage. Rechargez les données avant de recommencer.", stale: true };
    case "no_change": return { message: "Aucune modification n’a été détectée." };
    case "measurement_cancelled": return { message: "Cette mesure a déjà été annulée." };
    case "session_cancelled": return { message: "Cette séance a déjà été annulée." };
    case "last_measurement_requires_session_cancellation": return { message: "Il s’agit de la dernière mesure active de cette séance. Annulez la séance entière." };
    case "unauthenticated":
    case "forbidden": return { message: "Vous n’avez pas les droits nécessaires pour modifier cette pesée." };
    case "measurement_not_found":
    case "session_not_found":
    case "not_found": return { message: "La pesée demandée est introuvable." };
    case "command_conflict": return { message: "Cette commande entre en conflit avec une tentative précédente. Rechargez les données." };
    default: return { message: "Une erreur technique empêche momentanément cette opération." };
  }
}

function linkedMeasurementIntention(intention: LitterWeightMeasurementAdjustmentIntention) {
  if (!intention || ![intention.litterId, intention.sessionId, intention.measurementId, intention.animalId, intention.clientCommandId].every((value) => typeof value === "string" && UUID_PATTERN.test(value)) || !Number.isInteger(intention.expectedRevisionNo) || intention.expectedRevisionNo < 0) return null;
  return intention;
}

function linkedSessionIntention(intention: LitterWeightSessionCancellationIntention) {
  if (!intention || ![intention.litterId, intention.sessionId, intention.clientCommandId].every((value) => typeof value === "string" && UUID_PATTERN.test(value)) || !Number.isInteger(intention.expectedRevisionNo) || intention.expectedRevisionNo < 0) return null;
  return intention;
}

function requiredReason(formData: FormData) {
  const value = formString(formData, "reason")?.trim();
  return value && value.length <= MAX_REASON_LENGTH ? value : null;
}

function cancellationTimestamp(formData: FormData) {
  const value = formString(formData, "cancelled_at")?.trim();
  return value && ISO_WITH_OFFSET_SCHEMA.safeParse(value).success ? new Date(value).toISOString() : null;
}

function revalidateAdjustment(dependencies: LitterWeightAdjustmentActionDependencies, intention: { litterId: string; animalId?: string }) {
  dependencies.revalidatePath("/litters/journal");
  dependencies.revalidatePath("/litters/journal/comparison");
  dependencies.revalidatePath(`/litters/${intention.litterId}`);
  if (intention.animalId) dependencies.revalidatePath(`/animals/${intention.animalId}`);
}

export async function correctLitterRoutineWeightActionCore(intention: LitterWeightMeasurementAdjustmentIntention, _previous: LitterWeightAdjustmentActionState, formData: FormData, dependencies: LitterWeightAdjustmentActionDependencies): Promise<LitterWeightAdjustmentActionState> {
  const linked = linkedMeasurementIntention(intention);
  if (!linked) return adjustmentError("La commande de correction est invalide.");
  const rawGrams = formString(formData, "grams")?.trim();
  const note = normalizedOptionalText(formData, "note");
  const reason = requiredReason(formData);
  if (!rawGrams || !/^\d+$/.test(rawGrams) || !Number.isInteger(Number(rawGrams)) || Number(rawGrams) < 1 || Number(rawGrams) > MAX_WEIGHT_GRAMS) return adjustmentError("Le poids doit être un nombre entier entre 1 et 100000 g.");
  if (note === undefined) return adjustmentError("La note individuelle est invalide.");
  if (!reason) return adjustmentError("Le motif est obligatoire et doit contenir entre 1 et 500 caractères.");
  try {
    const result = await dependencies.correctWeight({ measurementId: linked.measurementId, clientCommandId: linked.clientCommandId, expectedRevisionNo: linked.expectedRevisionNo, grams: Number(rawGrams), note, reason });
    if (result.outcome === "error") { const mapped = adjustmentServiceMessage(result.error); return adjustmentError(mapped.message, mapped.stale); }
    revalidateAdjustment(dependencies, linked);
    return { status: "success", message: "La mesure a été corrigée." };
  } catch { return adjustmentError("Une erreur technique empêche momentanément cette opération."); }
}

export async function cancelLitterRoutineWeightActionCore(intention: LitterWeightMeasurementAdjustmentIntention, _previous: LitterWeightAdjustmentActionState, formData: FormData, dependencies: LitterWeightAdjustmentActionDependencies): Promise<LitterWeightAdjustmentActionState> {
  const linked = linkedMeasurementIntention(intention);
  if (!linked) return adjustmentError("La commande d’annulation est invalide.");
  const reason = requiredReason(formData); const cancelledAt = cancellationTimestamp(formData);
  if (!reason) return adjustmentError("Le motif est obligatoire et doit contenir entre 1 et 500 caractères.");
  if (!cancelledAt) return adjustmentError("La date d’annulation est invalide.");
  try {
    const result = await dependencies.cancelWeight({ measurementId: linked.measurementId, clientCommandId: linked.clientCommandId, expectedRevisionNo: linked.expectedRevisionNo, cancelledAt, reason });
    if (result.outcome === "error") { const mapped = adjustmentServiceMessage(result.error); return adjustmentError(mapped.message, mapped.stale); }
    revalidateAdjustment(dependencies, linked);
    return { status: "success", message: "La mesure a été annulée sans être supprimée." };
  } catch { return adjustmentError("Une erreur technique empêche momentanément cette opération."); }
}

export async function cancelLitterWeighingSessionActionCore(intention: LitterWeightSessionCancellationIntention, _previous: LitterWeightAdjustmentActionState, formData: FormData, dependencies: LitterWeightAdjustmentActionDependencies): Promise<LitterWeightAdjustmentActionState> {
  const linked = linkedSessionIntention(intention);
  if (!linked) return adjustmentError("La commande d’annulation est invalide.");
  const reason = requiredReason(formData); const cancelledAt = cancellationTimestamp(formData);
  if (!reason) return adjustmentError("Le motif est obligatoire et doit contenir entre 1 et 500 caractères.");
  if (!cancelledAt) return adjustmentError("La date d’annulation est invalide.");
  try {
    const result = await dependencies.cancelSession({ sessionId: linked.sessionId, clientCommandId: linked.clientCommandId, expectedRevisionNo: linked.expectedRevisionNo, cancelledAt, reason });
    if (result.outcome === "error") { const mapped = adjustmentServiceMessage(result.error); return adjustmentError(mapped.message, mapped.stale); }
    revalidateAdjustment(dependencies, linked);
    return { status: "success", message: "La séance a été annulée sans être supprimée." };
  } catch { return adjustmentError("Une erreur technique empêche momentanément cette opération."); }
}

function normalizedOptionalText(
  formData: FormData,
  name: string,
): string | null | undefined {
  const entry = formString(formData, name);
  if (entry === null) return formData.has(name) ? undefined : null;
  const normalized = entry.trim();
  if (!normalized) return null;
  return normalized.length <= MAX_NOTE_LENGTH ? normalized : undefined;
}

function normalizedTimestamp(formData: FormData) {
  const value = formString(formData, "measured_at")?.trim();
  if (!value || !ISO_WITH_OFFSET_SCHEMA.safeParse(value).success) return null;
  return new Date(value).toISOString();
}

function normalizedTimezone(formData: FormData) {
  const value = formString(formData, "timezone_name")?.trim();
  if (!value || value.length > MAX_TIMEZONE_LENGTH) return null;
  try {
    Intl.DateTimeFormat("fr-FR", { timeZone: value }).format();
    return value;
  } catch {
    return null;
  }
}

function normalizedIntention(
  intention: RecordLitterRoutineWeightsIntention,
): RecordLitterRoutineWeightsIntention | LitterRoutineWeightsActionState {
  if (
    !intention ||
    !UUID_PATTERN.test(intention.litterId) ||
    !UUID_PATTERN.test(intention.clientCommandId) ||
    !Array.isArray(intention.animalIds)
  ) {
    return error("Le formulaire de pesée est invalide.");
  }
  if (intention.animalIds.length === 0) {
    return error("Le formulaire de pesée est invalide.");
  }
  if (intention.animalIds.length > MAX_ANIMALS) {
    return error("Une séance est limitée à 30 animaux.");
  }

  const animalIds = intention.animalIds.map((animalId) =>
    typeof animalId === "string" ? animalId.trim().toLowerCase() : "",
  );
  if (animalIds.some((animalId) => !UUID_PATTERN.test(animalId))) {
    return error("Le formulaire de pesée est invalide.");
  }
  if (new Set(animalIds).size !== animalIds.length) {
    return error("Un animal apparaît plusieurs fois dans la séance.");
  }

  return {
    litterId: intention.litterId.trim().toLowerCase(),
    clientCommandId: intention.clientCommandId.trim().toLowerCase(),
    animalIds,
  };
}

export function litterRoutineWeightsErrorMessage(
  serviceError: LitterWeightServiceError,
) {
  switch (serviceError.code) {
    case "invalid_input":
      return "Le formulaire de pesée est invalide.";
    case "too_many_litters":
    case "incompatible_litters":
    case "comparison_too_large":
      return "Une erreur technique empêche momentanément l’enregistrement.";
    case "too_many_animals":
      return "Une séance est limitée à 30 animaux.";
    case "duplicate_animal":
      return "Un animal apparaît plusieurs fois dans la séance.";
    case "unauthenticated":
    case "forbidden":
      return "Vous n’avez pas les droits nécessaires pour enregistrer cette pesée.";
    case "not_found":
      return "La portée ou l’un des animaux est introuvable.";
    case "animal_ineligible":
      return "Un animal n’est pas éligible à cette pesée.";
    case "measured_before_birth":
      return "La pesée ne peut pas précéder la naissance.";
    case "measured_after_death":
      return "La pesée ne peut pas être postérieure au décès.";
    case "measurement_already_recorded":
      return "Une mesure existe déjà pour un animal à cet instant.";
    case "measurement_not_found":
    case "session_not_found":
    case "measurement_cancelled":
    case "session_cancelled":
    case "stale_revision":
    case "no_change":
    case "last_measurement_requires_session_cancellation":
      return "Une erreur technique empêche momentanément l’enregistrement.";
    case "command_conflict":
      return "Cette pesée entre en conflit avec une tentative précédente.";
    case "inconsistent_relations":
      return "Les relations entre la portée et les animaux sont incohérentes.";
    case "database_error":
      return "Une erreur technique empêche momentanément l’enregistrement.";
  }
}

export async function recordLitterRoutineWeightsActionCore(
  intention: RecordLitterRoutineWeightsIntention,
  _previousState: LitterRoutineWeightsActionState,
  formData: FormData,
  dependencies: LitterRoutineWeightsActionDependencies,
): Promise<LitterRoutineWeightsActionState> {
  const linked = normalizedIntention(intention);
  if ("status" in linked) return linked;

  const measuredAt = normalizedTimestamp(formData);
  const timezoneName = normalizedTimezone(formData);
  const note = normalizedOptionalText(formData, "note");
  if (!measuredAt || !timezoneName || note === undefined) {
    return error("Le formulaire de pesée est invalide.");
  }

  const items: RecordLitterRoutineWeightsInput["items"] = [];
  for (const [index, animalId] of linked.animalIds.entries()) {
    const rawWeight = formString(formData, `weight_${index}`);
    const itemNote = normalizedOptionalText(formData, `item_note_${index}`);
    if (rawWeight === null || itemNote === undefined) {
      return error("Le formulaire de pesée est invalide.");
    }

    const normalizedWeight = rawWeight.trim();
    if (!normalizedWeight) {
      if (itemNote !== null) {
        return error("Une note individuelle doit être accompagnée d’un poids.");
      }
      continue;
    }
    if (!/^\d+$/.test(normalizedWeight)) {
      return error("Chaque poids doit être un nombre entier entre 1 et 100000 g.");
    }
    const grams = Number(normalizedWeight);
    if (!Number.isInteger(grams) || grams < 1 || grams > MAX_WEIGHT_GRAMS) {
      return error("Chaque poids doit être un nombre entier entre 1 et 100000 g.");
    }
    items.push({ animalId, grams, note: itemNote });
  }

  if (items.length === 0) {
    return error("Saisissez au moins un poids.");
  }

  try {
    const result = await dependencies.recordWeights({
      litterId: linked.litterId,
      clientCommandId: linked.clientCommandId,
      measuredAt,
      timezoneName,
      note,
      items,
    });
    if (result.outcome === "error") {
      return error(litterRoutineWeightsErrorMessage(result.error));
    }

    dependencies.revalidatePath("/litters/journal");
    dependencies.revalidatePath(`/litters/${linked.litterId}`);
    for (const item of items) {
      dependencies.revalidatePath(`/animals/${item.animalId}`);
    }

    const plural = result.measurementCount > 1;
    return {
      status: "success",
      message: `${result.measurementCount} poids ${plural ? "ont" : "a"} été enregistré${plural ? "s" : ""}.`,
      measurementCount: result.measurementCount,
      replayed: result.replayed,
    };
  } catch {
    return error("Une erreur technique empêche momentanément l’enregistrement.");
  }
}
