"use server";

import { revalidatePath } from "next/cache";

import type { ReproductionActionState } from "@/features/reproduction/action-state";
import {
  addProgesteroneMeasurement,
  createReproductiveCycle,
  recordReproductiveCycleMating,
  type ProgesteroneUnit,
  type ReproductiveCycleMatingMethod,
  type ReproductiveCycleStatus,
} from "@/features/reproduction/reproductive-cycles";

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function optionalValue(formData: FormData, name: string) {
  const entry = value(formData, name).trim();
  return entry || null;
}

function cycleStatus(value: string): ReproductiveCycleStatus | null {
  return ["planned", "in_progress", "closed", "cancelled"].includes(value)
    ? (value as ReproductiveCycleStatus)
    : null;
}

function progesteroneUnit(value: string): ProgesteroneUnit | null {
  return ["ng_ml", "nmol_l"].includes(value)
    ? (value as ProgesteroneUnit)
    : null;
}

function matingMethod(value: string): ReproductiveCycleMatingMethod | null {
  return ["natural", "ai_fresh", "ai_chilled", "ai_frozen", "other"].includes(value)
    ? (value as ReproductiveCycleMatingMethod)
    : null;
}

function errorMessage(code: string) {
  if (code === "conflict") {
    return "Un cycle actif existe déjà pour cette reproductrice.";
  }

  if (code === "forbidden") {
    return "Vous n’avez pas les droits nécessaires pour cette opération.";
  }

  return "Impossible d’enregistrer ces informations. Aucune autre donnée n’a été modifiée.";
}

function matingErrorMessage(code: string, message: string) {
  if (code === "invalid_father") {
    return "L’étalon sélectionné ne peut pas être utilisé pour cette saillie.";
  }
  if (code === "invalid_cycle") {
    return "Ce cycle est clos ou annulé et ne permet plus d’enregistrer de saillie.";
  }
  if (code === "forbidden") {
    return "Vous n’avez pas les droits nécessaires pour enregistrer une saillie.";
  }
  if (code === "conflict" && message.includes("même reproducteur")) {
    return "Le père enregistré pour ce cycle est différent de celui de cette saillie.";
  }
  if (code === "conflict") {
    return "L’état du cycle a changé. Rechargez la page avant de réessayer.";
  }
  return "Les informations de la saillie sont invalides ou ne peuvent pas être enregistrées pour le moment.";
}

export type ReproductiveCycleMatingIntention = {
  motherId: string;
  cycleId: string;
  clientCommandId: string;
  fatherId?: string;
};

export async function recordReproductiveCycleMatingAction(
  intention: ReproductiveCycleMatingIntention,
  _previousState: ReproductionActionState,
  formData: FormData,
): Promise<ReproductionActionState> {
  const method = matingMethod(value(formData, "method"));
  const fatherId = intention.fatherId ?? value(formData, "father_id");

  if (!method || !fatherId) {
    return { status: "error", message: "Les informations de la saillie sont invalides." };
  }

  const result = await recordReproductiveCycleMating({
    cycleId: intention.cycleId,
    clientCommandId: intention.clientCommandId,
    fatherId,
    occurredAt: value(formData, "occurred_at"),
    timezoneName: value(formData, "timezone_name"),
    method,
    location: optionalValue(formData, "location"),
    note: optionalValue(formData, "note"),
    litterName: intention.fatherId ? null : optionalValue(formData, "litter_name"),
  });

  if (result.outcome === "error") {
    return {
      status: "error",
      message: matingErrorMessage(result.error.code, result.error.message),
    };
  }

  revalidatePath(`/animals/${intention.motherId}/reproduction`);
  revalidatePath(`/litters/${result.litterId}`);
  return { status: "success", message: "La saillie a été enregistrée." };
}

export async function createReproductiveCycleAction(
  _previousState: ReproductionActionState,
  formData: FormData,
): Promise<ReproductionActionState> {
  const status = cycleStatus(value(formData, "status"));

  if (!status) {
    return {
      status: "error",
      message: "Les informations du cycle sont invalides.",
    };
  }

  const result = await createReproductiveCycle({
    motherId: value(formData, "mother_id"),
    status,
    startedOn: value(formData, "started_on"),
    endedOn: optionalValue(formData, "ended_on"),
    notes: optionalValue(formData, "notes"),
  });

  if (result.outcome === "error") {
    return { status: "error", message: errorMessage(result.error.code) };
  }

  revalidatePath(`/animals/${result.cycle.motherId}/reproduction`);
  return { status: "success", message: "Le cycle reproductif a été créé." };
}

export async function addProgesteroneMeasurementAction(
  _previousState: ReproductionActionState,
  formData: FormData,
): Promise<ReproductionActionState> {
  const unit = progesteroneUnit(value(formData, "unit"));
  const numericValue = Number(value(formData, "value"));

  if (!unit || !Number.isFinite(numericValue)) {
    return {
      status: "error",
      message: "Les informations du dosage sont invalides.",
    };
  }

  const result = await addProgesteroneMeasurement({
    cycleId: value(formData, "cycle_id"),
    measuredAt: value(formData, "measured_at"),
    resultedAt: optionalValue(formData, "resulted_at"),
    value: numericValue,
    unit,
    laboratoryName: optionalValue(formData, "laboratory_name"),
    sampleReference: optionalValue(formData, "sample_reference"),
    method: optionalValue(formData, "method"),
    note: optionalValue(formData, "note"),
  });

  if (result.outcome === "error") {
    return { status: "error", message: errorMessage(result.error.code) };
  }

  revalidatePath(`/animals/${value(formData, "mother_id")}/reproduction`);
  return { status: "success", message: "Le dosage de progestérone a été ajouté." };
}
