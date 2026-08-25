import type { LitterWeightHistorySession } from "@/features/litter-weights/litter-weights-core";
import type { MaternalObservationSummary } from "@/features/litter-journal/maternal-observations-core";
import type {
  WhelpingBirthSummary,
  WhelpingEventSummary,
} from "@/features/whelping/whelping-core";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks";

import type { UnifiedHistoryInputEntry } from "./unified-history-model";

const WHELPING_EVENT_LABELS: Record<string, string> = {
  whelping_started: "Mise-bas démarrée",
  first_water: "Perte des eaux",
  first_placenta: "Premier placenta",
  oxytocin_injection: "Injection d’ocytocine",
  calcium_injection: "Injection de calcium",
  veterinary_intervention: "Intervention vétérinaire",
  whelping_paused: "Pause observée",
  whelping_ended: "Mise-bas terminée",
};

const OBSERVATION_TYPE_LABELS: Record<string, string> = {
  general_state: "État général",
  temperature: "Température",
  appetite: "Appétit",
  behavior: "Comportement",
  nursing: "Allaitement",
  other: "Observation",
};

function formatGrams(value: number | null) {
  return value !== null ? `${value} g` : null;
}

function sexLabel(sex: string) {
  if (sex === "male") return "mâle";
  if (sex === "female") return "femelle";
  return "sexe non déterminé";
}

/**
 * Projette les données déjà chargées par la page journal en entrées
 * d'historique unifié. Aucun accès base : la page fournit les listes.
 * Les naissances annulées sont exclues (elles restent tracées dans
 * l'historique de correction du panneau Mise-bas).
 */
export function buildLitterUnifiedHistoryInput({
  weightSessions,
  maternalObservations,
  careTasks,
  whelpingEvents,
  whelpingBirths,
}: {
  weightSessions: readonly LitterWeightHistorySession[];
  maternalObservations: readonly MaternalObservationSummary[];
  careTasks: readonly LitterCareTaskSummary[];
  whelpingEvents: readonly WhelpingEventSummary[];
  whelpingBirths: readonly WhelpingBirthSummary[];
}): UnifiedHistoryInputEntry[] {
  const entries: UnifiedHistoryInputEntry[] = [];

  for (const session of weightSessions) {
    entries.push({
      id: `weight-session-${session.id}`,
      kind: "weighing_session",
      label: "Pesée de routine enregistrée",
      detail:
        [
          `${session.measurementCount} mesure${session.measurementCount > 1 ? "s" : ""}`,
          session.averageGrams !== null ? `moyenne ${formatGrams(session.averageGrams)}` : null,
          session.note?.trim() || null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      occurredAt: session.measuredAt,
    });
  }

  for (const observation of maternalObservations) {
    const typeLabel =
      OBSERVATION_TYPE_LABELS[observation.observationType] ?? "Observation";
    const measured =
      observation.numericValue !== null && observation.unit
        ? `${observation.numericValue} ${observation.unit}`
        : null;
    entries.push({
      id: `maternal-observation-${observation.id}`,
      kind: "maternal_observation",
      label: `Observation de la mère — ${typeLabel}`,
      detail:
        [measured, observation.severity !== "routine" ? "point de vigilance" : null, observation.note?.trim() || null]
          .filter(Boolean)
          .join(" · ") || null,
      occurredAt: observation.observedAt,
    });
  }

  for (const task of careTasks) {
    if (task.status !== "done") continue;
    const dueDate = task.plannedFor ?? task.suggestedFor ?? task.retainedStartsOn;
    if (!dueDate) continue;
    entries.push({
      id: `care-task-${task.id}`,
      kind: "care_task",
      label: task.title,
      detail:
        [
          task.description?.trim() || null,
          task.resolutionNote?.trim() || null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      occurredAt: task.resolvedAt ?? dueDate,
    });
  }

  for (const event of whelpingEvents) {
    const label = WHELPING_EVENT_LABELS[event.eventType] ?? "Événement de mise-bas";
    const birth = whelpingBirths.find((candidate) => candidate.event.id === event.id);
    const birthDetail = birth
      ? birth.viability === "stillborn"
        ? `naissance sans vitalité · ${sexLabel(birth.sex)}`
        : `naissance · ${sexLabel(birth.sex)}${birth.initialCollarColor ? ` · collier ${birth.initialCollarColor}` : ""}`
      : event.note?.trim() || null;
    entries.push({
      id: `whelping-event-${event.id}`,
      kind: "whelping_event",
      label: birth ? `Naissance (${birth.birthOrder})` : label,
      detail: birthDetail,
      occurredAt: event.occurredAt,
    });
  }

  return entries;
}
