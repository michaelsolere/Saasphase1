"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

import {
  materializeLitterPlanSeries,
  setLitterPlanSeriesState,
  type LitterPlanSeriesState,
} from "./litter-plans-core";
import { formatLitterPlanSeriesAnchorUnavailableMessage } from "./litter-plan-series-summary";

export type LitterPlanSeriesActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
};

export type LitterPlanSeriesStateSubmission = {
  seriesId: string;
  expectedRevisionNo: number;
  clientCommandId: string;
  newState: LitterPlanSeriesState;
};

export type LitterPlanSeriesMaterializeSubmission = {
  seriesId: string;
  expectedRevisionNo: number;
  clientCommandId: string;
};

const TERMINAL_STATES: LitterPlanSeriesState[] = [
  "completed",
  "cancelled",
  "not_applicable",
];

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry : "";
}

function optionalValue(formData: FormData, name: string) {
  const normalized = value(formData, name).trim();
  return normalized || null;
}

function isCivilDate(input: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function stateSuccessMessage(state: LitterPlanSeriesState): string {
  switch (state) {
    case "suspended":
      return "Le suivi récurrent a été suspendu.";
    case "active":
      return "Le suivi récurrent a été repris.";
    case "completed":
      return "Le suivi récurrent a été terminé.";
    case "cancelled":
      return "Le suivi récurrent a été annulé.";
    case "not_applicable":
      return "Le suivi récurrent a été déclaré non applicable.";
  }
}

function stateErrorMessage(code: string, message: string): string {
  if (code === "anchor_unavailable") {
    return formatLitterPlanSeriesAnchorUnavailableMessage();
  }
  if (code === "stale_revision") {
    return "Ce suivi a été modifié ailleurs. Rechargez le Journal pour continuer.";
  }
  if (code === "forbidden" || code === "unauthenticated") {
    return "Vous n’avez pas les droits suffisants pour modifier ce suivi.";
  }
  if (code === "not_found") {
    return "Ce suivi est introuvable ou inaccessible.";
  }
  return message || "Le suivi récurrent n’a pas pu être mis à jour.";
}

export async function setLitterPlanSeriesStateAction(
  submission: LitterPlanSeriesStateSubmission,
  _previousState: LitterPlanSeriesActionState,
  formData: FormData,
): Promise<LitterPlanSeriesActionState> {
  if (TERMINAL_STATES.includes(submission.newState)) {
    if (value(formData, "terminal_confirmation") !== "confirmed") {
      return {
        status: "error",
        message: "La confirmation est requise pour cette action.",
      };
    }
  }

  const reason = optionalValue(formData, "reason");
  if (reason && reason.length > 5000) {
    return {
      status: "error",
      message: "Le motif ne doit pas dépasser 5 000 caractères.",
    };
  }

  const supabase = await createClient();
  const result = await setLitterPlanSeriesState(
    {
      seriesId: submission.seriesId,
      clientCommandId: submission.clientCommandId,
      expectedRevisionNo: submission.expectedRevisionNo,
      newState: submission.newState,
      reason,
    },
    supabase,
  );

  if (result.outcome === "error") {
    return {
      status: "error",
      code: result.error.code,
      message: stateErrorMessage(result.error.code, result.error.message),
    };
  }

  revalidatePath("/litters/journal");
  revalidatePath("/calendar/today");
  return {
    status: "success",
    message: stateSuccessMessage(submission.newState),
  };
}

export async function materializeLitterPlanSeriesAction(
  submission: LitterPlanSeriesMaterializeSubmission,
  _previousState: LitterPlanSeriesActionState,
  formData: FormData,
): Promise<LitterPlanSeriesActionState> {
  const requestedThrough = value(formData, "requested_through").trim();
  if (!isCivilDate(requestedThrough)) {
    return {
      status: "error",
      message: "La date de préparation est invalide.",
    };
  }

  const supabase = await createClient();
  const result = await materializeLitterPlanSeries(
    {
      seriesId: submission.seriesId,
      clientCommandId: submission.clientCommandId,
      expectedRevisionNo: submission.expectedRevisionNo,
      requestedThrough,
    },
    supabase,
  );

  if (result.outcome === "error") {
    return {
      status: "error",
      code: result.error.code,
      message: stateErrorMessage(result.error.code, result.error.message),
    };
  }

  revalidatePath("/litters/journal");
  revalidatePath("/calendar/today");

  if (result.insertedCount === 0) {
    return {
      status: "success",
      message:
        result.skippedIdenticalCount > 0
          ? "Aucune nouvelle occurrence : l’horizon demandé était déjà préparé."
          : "Aucune nouvelle occurrence n’a été créée pour cet horizon.",
    };
  }

  return {
    status: "success",
    message: `${result.insertedCount} occurrence${result.insertedCount === 1 ? "" : "s"} préparée${result.insertedCount === 1 ? "" : "s"}.`,
  };
}
