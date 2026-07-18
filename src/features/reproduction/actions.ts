"use server";

import { revalidatePath } from "next/cache";

import {
  addProgesteroneMeasurement,
  createReproductiveCycle,
  type ProgesteroneUnit,
  type ReproductiveCycleStatus,
} from "@/features/reproduction/reproductive-cycles";

export type ReproductionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialReproductionActionState: ReproductionActionState = {
  status: "idle",
};

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

function errorMessage(code: string) {
  if (code === "conflict") {
    return "Un cycle actif existe déjà pour cette reproductrice.";
  }

  if (code === "forbidden") {
    return "Vous n’avez pas les droits nécessaires pour cette opération.";
  }

  return "Impossible d’enregistrer ces informations. Aucune autre donnée n’a été modifiée.";
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
