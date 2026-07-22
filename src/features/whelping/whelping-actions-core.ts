import { z } from "zod";

import type {
  CloseWhelpingSessionInput,
  CloseWhelpingSessionResult,
  CancelWhelpingBirthInput,
  CorrectWhelpingBirthInput,
  GenericWhelpingEventType,
  OpenWhelpingSessionInput,
  OpenWhelpingSessionResult,
  RecordWhelpingBirthInput,
  RecordWhelpingBirthResult,
  RecordWhelpingBirthWeightInput,
  RecordWhelpingBirthWeightResult,
  QuickCompleteWhelpingBirthInput,
  QuickCompleteWhelpingBirthResult,
  RecordWhelpingEventInput,
  RecordWhelpingEventResult,
  ReopenWhelpingSessionInput,
  ReopenWhelpingSessionResult,
  WhelpingBirthSex,
  WhelpingBirthViability,
  WhelpingServiceError,
  WhelpingBirthAdjustmentResult,
} from "./whelping-core";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_WITH_OFFSET_SCHEMA = z.string().datetime({ offset: true });
const MAX_TIMEZONE_LENGTH = 255;
const MAX_COLOR_LENGTH = 255;
const MAX_NOTE_LENGTH = 5_000;
const MAX_REOPEN_REASON_LENGTH = 500;
const MAX_ADJUSTMENT_REASON_LENGTH = 500;
const MAX_BIRTH_WEIGHT_GRAMS = 100_000;

const GENERIC_EVENT_TYPES = [
  "labor_started",
  "contractions",
  "water_broke",
  "placenta",
  "nursing",
  "vet_called",
  "intervention",
  "observation",
] as const satisfies readonly GenericWhelpingEventType[];

const BIRTH_SEXES = ["male", "female", "unknown"] as const satisfies readonly WhelpingBirthSex[];
const BIRTH_VIABILITIES = [
  "alive",
  "stillborn",
  "unknown",
] as const satisfies readonly WhelpingBirthViability[];

export type WhelpingActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  replayed?: boolean;
};

export type WhelpingBirthActionState = WhelpingActionState & {
  birthOrder?: number;
  eventSequenceNo?: number;
};

export type WhelpingBirthAdjustmentActionState = WhelpingActionState & {
  stale?: boolean;
  duplicateColorBirthOrder?: number;
};

export const initialWhelpingActionState = {
  status: "idle",
} satisfies WhelpingActionState;

export const initialWhelpingBirthActionState = {
  status: "idle",
} satisfies WhelpingBirthActionState;

export const initialWhelpingBirthAdjustmentActionState = {
  status: "idle",
} satisfies WhelpingBirthAdjustmentActionState;

export type OpenWhelpingSessionIntention = {
  litterId: string;
  clientCommandId: string;
};

export type RecordWhelpingEventIntention = {
  litterId: string;
  sessionId: string;
  clientCommandId: string;
};

export type RecordWhelpingBirthIntention = RecordWhelpingEventIntention;
export type CloseWhelpingSessionIntention = RecordWhelpingEventIntention;
export type ReopenWhelpingSessionIntention = RecordWhelpingEventIntention;
export type RecordWhelpingBirthWeightIntention = RecordWhelpingEventIntention & {
  birthId: string;
};

export type WhelpingBirthAdjustmentIntention = {
  litterId: string;
  sessionId: string;
  birthId: string;
  animalId: string;
  expectedRevisionNo: number;
  clientCommandId: string;
};

export type WhelpingActionDependencies = {
  openSession: (
    input: OpenWhelpingSessionInput,
  ) => Promise<OpenWhelpingSessionResult>;
  recordEvent: (
    input: RecordWhelpingEventInput,
  ) => Promise<RecordWhelpingEventResult>;
  recordBirth: (
    input: RecordWhelpingBirthInput,
  ) => Promise<RecordWhelpingBirthResult>;
  recordBirthWeight: (
    input: RecordWhelpingBirthWeightInput,
  ) => Promise<RecordWhelpingBirthWeightResult>;
  closeSession: (
    input: CloseWhelpingSessionInput,
  ) => Promise<CloseWhelpingSessionResult>;
  reopenSession: (
    input: ReopenWhelpingSessionInput,
  ) => Promise<ReopenWhelpingSessionResult>;
  revalidatePath: (path: string) => void;
};

export type WhelpingBirthAdjustmentActionDependencies = {
  correctBirth: (
    input: CorrectWhelpingBirthInput,
  ) => Promise<WhelpingBirthAdjustmentResult>;
  cancelBirth: (
    input: CancelWhelpingBirthInput,
  ) => Promise<WhelpingBirthAdjustmentResult>;
  revalidatePath: (path: string) => void;
};

export type WhelpingQuickCompletionActionDependencies = {
  quickCompleteBirth: (
    input: QuickCompleteWhelpingBirthInput,
  ) => Promise<QuickCompleteWhelpingBirthResult>;
  revalidatePath: (path: string) => void;
};

function formString(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : null;
}

function normalizeRequiredString(formData: FormData, name: string) {
  const entry = formString(formData, name);
  if (entry === null) return null;
  const normalized = entry.trim();
  return normalized || null;
}

function normalizeOptionalText(
  formData: FormData,
  name: string,
  maxLength: number,
): string | null | undefined {
  const entry = formString(formData, name);
  if (entry === null) return formData.has(name) ? undefined : null;
  const normalized = entry.trim();
  if (!normalized) return null;
  return normalized.length <= maxLength ? normalized : undefined;
}

function normalizeTimestamp(formData: FormData, name: string) {
  const timestamp = normalizeRequiredString(formData, name);
  if (!timestamp || !ISO_WITH_OFFSET_SCHEMA.safeParse(timestamp).success) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

function normalizeOptionalTimestamp(
  formData: FormData,
  name: string,
): string | null | undefined {
  const entry = formString(formData, name);
  if (entry === null) return formData.has(name) ? undefined : null;
  const normalized = entry.trim();
  if (!normalized) return null;
  if (!ISO_WITH_OFFSET_SCHEMA.safeParse(normalized).success) return undefined;
  return new Date(normalized).toISOString();
}

function normalizeTimezone(formData: FormData) {
  const timezoneName = normalizeRequiredString(formData, "timezone_name");
  if (!timezoneName || timezoneName.length > MAX_TIMEZONE_LENGTH) return null;

  try {
    Intl.DateTimeFormat("fr-FR", { timeZone: timezoneName }).format();
    return timezoneName;
  } catch {
    return null;
  }
}

function normalizeOptionalWeight(
  formData: FormData,
): number | null | undefined {
  const entry = formString(formData, "birth_weight_grams");
  if (entry === null) {
    return formData.has("birth_weight_grams") ? undefined : null;
  }
  const normalized = entry.trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return undefined;

  const weight = Number(normalized);
  if (
    !Number.isSafeInteger(weight) ||
    weight <= 0 ||
    weight > MAX_BIRTH_WEIGHT_GRAMS
  ) {
    return undefined;
  }
  return weight;
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isOpenIntention(
  intention: OpenWhelpingSessionIntention,
): intention is OpenWhelpingSessionIntention {
  return (
    isValidId(intention?.litterId) && isValidId(intention?.clientCommandId)
  );
}

function isSessionIntention(
  intention: RecordWhelpingEventIntention,
): intention is RecordWhelpingEventIntention {
  return (
    isOpenIntention(intention) && isValidId(intention?.sessionId)
  );
}

function isBirthWeightIntention(
  intention: RecordWhelpingBirthWeightIntention,
): intention is RecordWhelpingBirthWeightIntention {
  return isSessionIntention(intention) && isValidId(intention?.birthId);
}

function isBirthAdjustmentIntention(
  intention: WhelpingBirthAdjustmentIntention,
): intention is WhelpingBirthAdjustmentIntention {
  return Boolean(
    intention &&
    [
      intention.litterId,
      intention.sessionId,
      intention.birthId,
      intention.animalId,
      intention.clientCommandId,
    ].every(isValidId) &&
    Number.isInteger(intention.expectedRevisionNo) &&
    intention.expectedRevisionNo >= 0,
  );
}

function isGenericEventType(value: string): value is GenericWhelpingEventType {
  return GENERIC_EVENT_TYPES.includes(value as GenericWhelpingEventType);
}

function isBirthSex(value: string): value is WhelpingBirthSex {
  return BIRTH_SEXES.includes(value as WhelpingBirthSex);
}

function isBirthViability(value: string): value is WhelpingBirthViability {
  return BIRTH_VIABILITIES.includes(value as WhelpingBirthViability);
}

function conflictMessage(error: WhelpingServiceError) {
  if (error.message.includes("animaux créés hors du Journal")) {
    return "Cette portée contient des animaux administratifs incompatibles avec le Journal de mise-bas.";
  }
  if (error.message.includes("date de naissance") && error.message.includes("incompatible")) {
    return "La date réelle déjà enregistrée pour cette portée est incompatible avec cette naissance.";
  }
  return "Cette commande a déjà été utilisée avec une autre intention.";
}

export function whelpingErrorMessage(error: WhelpingServiceError) {
  switch (error.code) {
    case "unauthenticated":
      return "Vous devez être connecté pour continuer.";
    case "forbidden":
      return "Vous n’avez pas les droits nécessaires pour cette opération.";
    case "not_found":
      return "La portée ou la session demandée est introuvable ou inaccessible.";
    case "invalid_input":
      return "Les informations transmises sont invalides.";
    case "invalid_litter":
      return "Cette portée ne permet pas cette opération.";
    case "invalid_mother":
      return "Les parents associés à cette portée sont incohérents.";
    case "invalid_session":
      return "La portée et la session associées sont incohérentes.";
    case "already_open":
      return "Une session de mise-bas est déjà ouverte pour cette portée.";
    case "session_closed":
      return "Cette session de mise-bas est déjà clôturée.";
    case "conflict":
      return conflictMessage(error);
    case "measured_before_birth":
      return "L’heure de pesée ne peut pas être antérieure à l’heure de naissance.";
    case "birth_weight_already_recorded":
      return "Un poids de naissance est déjà enregistré pour cette naissance.";
    case "invalid_birth_relations":
      return "Les relations associées à cette naissance sont incohérentes.";
    case "database_error":
    default:
      return "L’opération ne peut pas être réalisée pour le moment.";
  }
}

function birthWeightErrorMessage(error: WhelpingServiceError) {
  if (error.code === "not_found") {
    return "La naissance demandée est introuvable ou inaccessible.";
  }
  return whelpingErrorMessage(error);
}

function invalidState(message = "Les informations transmises sont invalides.") {
  return { status: "error", message } satisfies WhelpingActionState;
}

function adjustmentError(
  message: string,
  stale = false,
): WhelpingBirthAdjustmentActionState {
  return { status: "error", message, ...(stale ? { stale: true } : {}) };
}

function adjustmentServiceMessage(error: WhelpingServiceError) {
  switch (error.code) {
    case "stale_revision":
      return {
        message: "Cette naissance a été modifiée depuis son affichage. Rechargez les données avant de recommencer.",
        stale: true,
      };
    case "no_change":
      return { message: "Aucune modification n’a été détectée." };
    case "later_active_birth_exists":
      return { message: "Seule la dernière naissance active peut être annulée." };
    case "birth_has_downstream_data":
      return { message: "Cette naissance possède déjà des données ultérieures. Elle ne peut plus être annulée, mais ses informations peuvent éventuellement être corrigées." };
    case "birth_time_out_of_order":
      return { message: "L’heure indiquée est incompatible avec l’ordre des naissances." };
    case "birth_weight_inconsistent":
    case "invalid_birth_relations":
      return { message: "Les données du poids de naissance ont changé depuis l’affichage." };
    case "birth_cancelled":
      return { message: "Cette naissance a déjà été annulée." };
    case "birth_color_already_recorded":
      return { message: "Une couleur de collier est déjà enregistrée pour cette naissance." };
    case "birth_weight_already_recorded":
      return { message: "Un poids de naissance est déjà enregistré pour cette naissance." };
    case "conflict":
      return { message: "Cette commande entre en conflit avec une tentative précédente. Rechargez les données." };
    case "unauthenticated":
    case "forbidden":
      return { message: "Vous n’avez pas les droits nécessaires pour modifier cette naissance." };
    case "not_found":
      return { message: "La naissance demandée est introuvable ou inaccessible." };
    default:
      return { message: "Une erreur technique empêche momentanément cette opération." };
  }
}

export async function quickCompleteWhelpingBirthActionCore(
  intention: WhelpingBirthAdjustmentIntention,
  _previousState: WhelpingBirthAdjustmentActionState,
  formData: FormData,
  dependencies: WhelpingQuickCompletionActionDependencies,
): Promise<WhelpingBirthAdjustmentActionState> {
  if (!isBirthAdjustmentIntention(intention)) {
    return adjustmentError("La commande de complément rapide est invalide.");
  }

  const initialCollarColor = normalizeOptionalText(
    formData,
    "initial_collar_color",
    MAX_COLOR_LENGTH,
  );
  const birthWeightGrams = normalizeOptionalWeight(formData);
  const weightMeasuredAt = normalizeOptionalTimestamp(formData, "weight_measured_at");
  const allowDuplicateColor = formString(formData, "allow_duplicate_color") === "true";
  if (
    initialCollarColor === undefined || birthWeightGrams === undefined ||
    weightMeasuredAt === undefined ||
    (birthWeightGrams === null && weightMeasuredAt !== null) ||
    (birthWeightGrams !== null && weightMeasuredAt === null) ||
    (birthWeightGrams === null && initialCollarColor === null)
  ) {
    return adjustmentError("Le complément rapide est invalide.");
  }

  try {
    const result = await dependencies.quickCompleteBirth({
      litterId: intention.litterId,
      sessionId: intention.sessionId,
      birthId: intention.birthId,
      animalId: intention.animalId,
      expectedRevisionNo: intention.expectedRevisionNo,
      clientCommandId: intention.clientCommandId,
      initialCollarColor,
      birthWeightGrams,
      weightMeasuredAt,
      allowDuplicateColor,
    });
    if (result.outcome === "error") {
      if (
        result.error.code === "duplicate_color_confirmation_required" &&
        result.duplicateColorBirthOrder
      ) {
        return {
          status: "error",
          message: `Cette couleur est déjà attribuée à la naissance n°${result.duplicateColorBirthOrder}.`,
          duplicateColorBirthOrder: result.duplicateColorBirthOrder,
        };
      }
      const mapped = adjustmentServiceMessage(result.error);
      return adjustmentError(mapped.message, mapped.stale);
    }

    dependencies.revalidatePath("/whelping");
    dependencies.revalidatePath("/litters/journal");
    dependencies.revalidatePath("/litters");
    dependencies.revalidatePath(`/litters/${intention.litterId}`);
    dependencies.revalidatePath("/animals");
    dependencies.revalidatePath(`/animals/${intention.animalId}`);

    const details = [
      birthWeightGrams === null ? null : `${birthWeightGrams} g`,
      initialCollarColor === null
        ? null
        : `collier ${initialCollarColor.toLocaleLowerCase("fr-FR")}`,
    ].filter((value): value is string => value !== null).join(" · ");
    return {
      status: "success",
      message: `Naissance n°${result.birthOrder} complétée : ${details}.`,
      replayed: result.replayed,
    };
  } catch {
    return adjustmentError("Une erreur technique empêche momentanément cette opération.");
  }
}

function revalidateBirthAdjustment(
  dependencies: WhelpingBirthAdjustmentActionDependencies,
  intention: WhelpingBirthAdjustmentIntention,
) {
  dependencies.revalidatePath("/litters/journal");
  dependencies.revalidatePath("/litters");
  dependencies.revalidatePath(`/litters/${intention.litterId}`);
  dependencies.revalidatePath("/litters/journal/comparison");
  dependencies.revalidatePath("/animals");
  dependencies.revalidatePath(`/animals/${intention.animalId}`);
}

export async function correctWhelpingBirthActionCore(
  intention: WhelpingBirthAdjustmentIntention,
  _previousState: WhelpingBirthAdjustmentActionState,
  formData: FormData,
  dependencies: WhelpingBirthAdjustmentActionDependencies,
): Promise<WhelpingBirthAdjustmentActionState> {
  if (!isBirthAdjustmentIntention(intention)) {
    return adjustmentError("La commande de correction est invalide.");
  }
  const occurredAt = normalizeTimestamp(formData, "occurred_at");
  const sex = normalizeRequiredString(formData, "sex");
  const viability = normalizeRequiredString(formData, "viability");
  const initialCollarColor = normalizeOptionalText(formData, "initial_collar_color", MAX_COLOR_LENGTH);
  const birthNote = normalizeOptionalText(formData, "birth_note", MAX_NOTE_LENGTH);
  const weightGrams = normalizeOptionalWeight(formData);
  const weightMeasuredAt = normalizeOptionalTimestamp(formData, "weight_measured_at");
  const weightNote = normalizeOptionalText(formData, "weight_note", MAX_NOTE_LENGTH);
  const reason = normalizeOptionalText(formData, "reason", MAX_ADJUSTMENT_REASON_LENGTH);
  if (
    !occurredAt || !sex || !isBirthSex(sex) || !viability || !isBirthViability(viability) ||
    initialCollarColor === undefined || birthNote === undefined || weightGrams === undefined ||
    weightMeasuredAt === undefined || weightNote === undefined || !reason
  ) {
    return adjustmentError("Les informations de correction sont invalides.");
  }
  if (weightGrams === null && (weightMeasuredAt !== null || weightNote !== null)) {
    return adjustmentError("Aucun horaire ni aucune note de poids ne peut être saisi sans poids.");
  }
  if (weightGrams !== null && weightMeasuredAt === null) {
    return adjustmentError("L’heure de pesée est obligatoire lorsqu’un poids est renseigné.");
  }
  try {
    const result = await dependencies.correctBirth({
      birthId: intention.birthId,
      clientCommandId: intention.clientCommandId,
      expectedRevisionNo: intention.expectedRevisionNo,
      occurredAt,
      sex,
      viability,
      initialCollarColor,
      birthNote,
      weightGrams,
      weightMeasuredAt,
      weightNote,
      reason,
    });
    if (result.outcome === "error") {
      const mapped = adjustmentServiceMessage(result.error);
      return adjustmentError(mapped.message, mapped.stale);
    }
    revalidateBirthAdjustment(dependencies, intention);
    return { status: "success", message: "La naissance a été corrigée et l’événement initial a été conservé." };
  } catch {
    return adjustmentError("Une erreur technique empêche momentanément cette opération.");
  }
}

export async function cancelWhelpingBirthActionCore(
  intention: WhelpingBirthAdjustmentIntention,
  _previousState: WhelpingBirthAdjustmentActionState,
  formData: FormData,
  dependencies: WhelpingBirthAdjustmentActionDependencies,
): Promise<WhelpingBirthAdjustmentActionState> {
  if (!isBirthAdjustmentIntention(intention)) {
    return adjustmentError("La commande d’annulation est invalide.");
  }
  const cancelledAt = normalizeTimestamp(formData, "cancelled_at");
  const reason = normalizeOptionalText(formData, "reason", MAX_ADJUSTMENT_REASON_LENGTH);
  if (!cancelledAt) return adjustmentError("La date d’annulation est invalide.");
  if (!reason) return adjustmentError("Le motif est obligatoire et doit contenir entre 1 et 500 caractères.");
  try {
    const result = await dependencies.cancelBirth({
      birthId: intention.birthId,
      clientCommandId: intention.clientCommandId,
      expectedRevisionNo: intention.expectedRevisionNo,
      cancelledAt,
      reason,
    });
    if (result.outcome === "error") {
      const mapped = adjustmentServiceMessage(result.error);
      return adjustmentError(mapped.message, mapped.stale);
    }
    revalidateBirthAdjustment(dependencies, intention);
    return { status: "success", message: "La naissance a été annulée sans suppression physique." };
  } catch {
    return adjustmentError("Une erreur technique empêche momentanément cette opération.");
  }
}

export async function openWhelpingSessionActionCore(
  intention: OpenWhelpingSessionIntention,
  _previousState: WhelpingActionState,
  formData: FormData,
  dependencies: WhelpingActionDependencies,
): Promise<WhelpingActionState> {
  if (!isOpenIntention(intention)) return invalidState();

  const startedAt = normalizeTimestamp(formData, "started_at");
  const timezoneName = normalizeTimezone(formData);
  const note = normalizeOptionalText(formData, "note", MAX_NOTE_LENGTH);
  if (!startedAt || !timezoneName || note === undefined) return invalidState();

  try {
    const result = await dependencies.openSession({
      litterId: intention.litterId,
      clientCommandId: intention.clientCommandId,
      startedAt,
      timezoneName,
      note,
    });
    if (result.outcome === "error") {
      return { status: "error", message: whelpingErrorMessage(result.error) };
    }

    dependencies.revalidatePath("/litters/journal");
    dependencies.revalidatePath(`/litters/${intention.litterId}`);
    return {
      status: "success",
      message: "La session de mise-bas a été ouverte.",
      replayed: result.replayed,
    };
  } catch {
    return invalidState("L’opération ne peut pas être réalisée pour le moment.");
  }
}

export async function recordWhelpingEventActionCore(
  intention: RecordWhelpingEventIntention,
  _previousState: WhelpingActionState,
  formData: FormData,
  dependencies: WhelpingActionDependencies,
): Promise<WhelpingActionState> {
  if (!isSessionIntention(intention)) return invalidState();

  const occurredAt = normalizeTimestamp(formData, "occurred_at");
  const eventType = normalizeRequiredString(formData, "event_type");
  const note = normalizeOptionalText(formData, "note", MAX_NOTE_LENGTH);
  if (!occurredAt || !eventType || !isGenericEventType(eventType) || note === undefined) {
    return invalidState("Le type d’événement ou son horodatage est invalide.");
  }

  try {
    const result = await dependencies.recordEvent({
      sessionId: intention.sessionId,
      clientCommandId: intention.clientCommandId,
      occurredAt,
      eventType,
      note,
    });
    if (result.outcome === "error") {
      return { status: "error", message: whelpingErrorMessage(result.error) };
    }

    dependencies.revalidatePath("/litters/journal");
    return {
      status: "success",
      message: "L’événement de mise-bas a été enregistré.",
      replayed: result.replayed,
    };
  } catch {
    return invalidState("L’opération ne peut pas être réalisée pour le moment.");
  }
}

export async function recordWhelpingBirthActionCore(
  intention: RecordWhelpingBirthIntention,
  _previousState: WhelpingBirthActionState,
  formData: FormData,
  dependencies: WhelpingActionDependencies,
): Promise<WhelpingBirthActionState> {
  if (!isSessionIntention(intention)) return invalidState();

  const occurredAt = normalizeTimestamp(formData, "occurred_at");
  const sex = normalizeRequiredString(formData, "sex");
  const viability = normalizeRequiredString(formData, "viability");
  const initialCollarColor = normalizeOptionalText(
    formData,
    "initial_collar_color",
    MAX_COLOR_LENGTH,
  );
  const birthWeightGrams = normalizeOptionalWeight(formData);
  const measuredAt = normalizeOptionalTimestamp(formData, "measured_at");
  const note = normalizeOptionalText(formData, "note", MAX_NOTE_LENGTH);

  if (
    !occurredAt ||
    !sex ||
    !isBirthSex(sex) ||
    !viability ||
    !isBirthViability(viability) ||
    initialCollarColor === undefined ||
    birthWeightGrams === undefined ||
    measuredAt === undefined ||
    note === undefined ||
    (birthWeightGrams !== null && measuredAt === null) ||
    (birthWeightGrams === null && measuredAt !== null)
  ) {
    return invalidState("Les informations de la naissance sont invalides.");
  }

  try {
    const result = await dependencies.recordBirth({
      sessionId: intention.sessionId,
      clientCommandId: intention.clientCommandId,
      occurredAt,
      sex,
      viability,
      initialCollarColor,
      birthWeightGrams,
      measuredAt,
      note,
    });
    if (result.outcome === "error") {
      return { status: "error", message: whelpingErrorMessage(result.error) };
    }

    dependencies.revalidatePath("/litters/journal");
    dependencies.revalidatePath("/litters");
    dependencies.revalidatePath(`/litters/${intention.litterId}`);
    dependencies.revalidatePath("/animals");
    return {
      status: "success",
      message: "La naissance a été enregistrée.",
      replayed: result.replayed,
      birthOrder: result.birthOrder,
      eventSequenceNo: result.eventSequenceNo,
    };
  } catch {
    return invalidState("L’opération ne peut pas être réalisée pour le moment.");
  }
}

export async function recordWhelpingBirthWeightActionCore(
  intention: RecordWhelpingBirthWeightIntention,
  _previousState: WhelpingActionState,
  formData: FormData,
  dependencies: WhelpingActionDependencies,
): Promise<WhelpingActionState> {
  if (!isBirthWeightIntention(intention)) {
    return invalidState("Le formulaire de poids de naissance est invalide.");
  }

  const birthWeightGrams = normalizeOptionalWeight(formData);
  const measuredAt = normalizeTimestamp(formData, "measured_at");
  const note = normalizeOptionalText(formData, "note", MAX_NOTE_LENGTH);
  if (
    birthWeightGrams === null ||
    birthWeightGrams === undefined ||
    !measuredAt ||
    note === undefined
  ) {
    return invalidState("Le formulaire de poids de naissance est invalide.");
  }

  try {
    const result = await dependencies.recordBirthWeight({
      birthId: intention.birthId,
      clientCommandId: intention.clientCommandId,
      weightGrams: birthWeightGrams,
      measuredAt,
      note,
    });
    if (result.outcome === "error") {
      return { status: "error", message: birthWeightErrorMessage(result.error) };
    }

    dependencies.revalidatePath("/litters/journal");
    dependencies.revalidatePath(`/litters/${intention.litterId}`);
    dependencies.revalidatePath("/animals");
    dependencies.revalidatePath(`/animals/${result.animalId}`);
    return {
      status: "success",
      message: "Le poids de naissance a été enregistré.",
      replayed: result.replayed,
    };
  } catch {
    return invalidState("L’opération ne peut pas être réalisée pour le moment.");
  }
}

export async function closeWhelpingSessionActionCore(
  intention: CloseWhelpingSessionIntention,
  _previousState: WhelpingActionState,
  formData: FormData,
  dependencies: WhelpingActionDependencies,
): Promise<WhelpingActionState> {
  if (!isSessionIntention(intention)) return invalidState();

  const endedAt = normalizeTimestamp(formData, "ended_at");
  const note = normalizeOptionalText(formData, "note", MAX_NOTE_LENGTH);
  if (!endedAt || note === undefined) return invalidState();

  try {
    const result = await dependencies.closeSession({
      sessionId: intention.sessionId,
      clientCommandId: intention.clientCommandId,
      endedAt,
      note,
    });
    if (result.outcome === "error") {
      return { status: "error", message: whelpingErrorMessage(result.error) };
    }

    dependencies.revalidatePath("/litters/journal");
    dependencies.revalidatePath(`/litters/${intention.litterId}`);
    return {
      status: "success",
      message: "La session de mise-bas a été clôturée.",
      replayed: result.replayed,
    };
  } catch {
    return invalidState("L’opération ne peut pas être réalisée pour le moment.");
  }
}

export async function reopenWhelpingSessionActionCore(
  intention: ReopenWhelpingSessionIntention,
  _previousState: WhelpingActionState,
  formData: FormData,
  dependencies: WhelpingActionDependencies,
): Promise<WhelpingActionState> {
  if (!isSessionIntention(intention)) return invalidState();

  const reopenedAt = normalizeTimestamp(formData, "reopened_at");
  const reason = normalizeOptionalText(
    formData,
    "reason",
    MAX_REOPEN_REASON_LENGTH,
  );
  if (!reopenedAt || !reason) {
    return invalidState("Le motif et l’horodatage de réouverture sont obligatoires.");
  }

  try {
    const result = await dependencies.reopenSession({
      sessionId: intention.sessionId,
      clientCommandId: intention.clientCommandId,
      reopenedAt,
      reason,
    });
    if (result.outcome === "error") {
      return { status: "error", message: whelpingErrorMessage(result.error) };
    }

    dependencies.revalidatePath("/litters/journal");
    dependencies.revalidatePath(`/litters/${intention.litterId}`);
    return {
      status: "success",
      message: "La session de mise-bas a été rouverte.",
      replayed: result.replayed,
    };
  } catch {
    return invalidState("L’opération ne peut pas être réalisée pour le moment.");
  }
}
