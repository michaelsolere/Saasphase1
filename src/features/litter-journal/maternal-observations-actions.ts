"use server";

import { revalidatePath } from "next/cache";

import {
  recordMaternalObservation,
  type MaternalObservationSeverity,
  type MaternalObservationTemperatureUnit,
  type MaternalObservationType,
} from "./maternal-observations";

export type MaternalObservationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type MaternalObservationSubmission = {
  litterId: string;
  clientCommandId: string;
};

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function optionalValue(formData: FormData, name: string) {
  const normalized = value(formData, name).trim();
  return normalized || null;
}

function observationType(value: string): MaternalObservationType | null {
  return [
    "temperature",
    "appetite",
    "behavior",
    "discharge",
    "contractions",
    "lactation",
    "health",
    "other",
  ].includes(value)
    ? (value as MaternalObservationType)
    : null;
}

function severity(value: string): MaternalObservationSeverity | null {
  return ["routine", "watch", "concern", "urgent"].includes(value)
    ? (value as MaternalObservationSeverity)
    : null;
}

function temperatureUnit(
  value: string,
): MaternalObservationTemperatureUnit | null {
  return ["celsius", "fahrenheit"].includes(value)
    ? (value as MaternalObservationTemperatureUnit)
    : null;
}

function errorMessage(code: string) {
  switch (code) {
    case "not_found":
      return "La portée demandée est introuvable ou inaccessible.";
    case "invalid_litter":
      return "Cette portée ne permet plus d’enregistrer une observation.";
    case "invalid_mother":
      return "La mère associée à cette portée ne peut pas être utilisée.";
    case "forbidden":
      return "Vous n’avez pas les droits nécessaires pour cette opération.";
    case "conflict":
      return "Cette commande a déjà été utilisée. Rechargez le journal avant de recommencer.";
    default:
      return "Les informations de l’observation sont invalides ou ne peuvent pas être enregistrées pour le moment.";
  }
}

export async function recordMaternalObservationAction(
  submission: MaternalObservationSubmission,
  _previousState: MaternalObservationActionState,
  formData: FormData,
): Promise<MaternalObservationActionState> {
  const type = observationType(value(formData, "observation_type"));
  const selectedSeverity = severity(value(formData, "severity"));

  if (!type || !selectedSeverity) {
    return {
      status: "error",
      message: "Les informations de l’observation sont invalides.",
    };
  }

  const note = optionalValue(formData, "note");
  const numericValue =
    type === "temperature" ? Number(value(formData, "numeric_value")) : null;
  const unit =
    type === "temperature" ? temperatureUnit(value(formData, "unit")) : null;

  if (
    (type === "temperature" &&
      (numericValue === null ||
        !Number.isFinite(numericValue) ||
        numericValue <= 0 ||
        !unit)) ||
    (type !== "temperature" && !note)
  ) {
    return {
      status: "error",
      message: "Les informations de l’observation sont invalides.",
    };
  }

  const result = await recordMaternalObservation({
    litterId: submission.litterId,
    clientCommandId: submission.clientCommandId,
    observedAt: value(formData, "observed_at"),
    timezoneName: value(formData, "timezone_name"),
    observationType: type,
    numericValue,
    unit,
    severity: selectedSeverity,
    note,
  });

  if (result.outcome === "error") {
    return { status: "error", message: errorMessage(result.error.code) };
  }

  revalidatePath("/litters/journal");
  return {
    status: "success",
    message: "L’observation maternelle a été enregistrée.",
  };
}
