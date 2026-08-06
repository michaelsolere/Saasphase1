import type { ApplicationFilter } from "@/features/applications/types";

export type CandidateWorkbenchSort = "newest" | "name";

export type CandidateWorkbenchState = {
  filter: ApplicationFilter;
  search: string;
  selectedId: string | null;
  sort: CandidateWorkbenchSort;
};

type CandidateNextActionTone = "attention" | "follow_up" | "complete" | "neutral";

export type CandidateNextAction = {
  label: string;
  detail: string;
  tone: CandidateNextActionTone;
};

const filterPaths: Partial<Record<ApplicationFilter, string>> = {
  validated: "validees",
  unsuccessful: "non-abouties",
  all: "toutes",
};

export function normalizeCandidateWorkbenchState(
  state: CandidateWorkbenchState,
): CandidateWorkbenchState {
  return {
    filter: state.filter,
    search: state.search.trim(),
    selectedId: state.selectedId?.trim() || null,
    sort: state.sort === "name" ? "name" : "newest",
  };
}

export function buildCandidateWorkbenchPath(state: CandidateWorkbenchState) {
  const normalized = normalizeCandidateWorkbenchState(state);
  const params = new URLSearchParams();
  const filterPath = filterPaths[normalized.filter];

  if (normalized.filter === "attention") {
    params.set("filter", "attention");
  } else if (filterPath) {
    params.set("filtre", filterPath);
  }

  if (normalized.search) {
    params.set("recherche", normalized.search);
  }

  if (normalized.sort === "name") {
    params.set("tri", "nom");
  }

  if (normalized.selectedId) {
    params.set("candidature", normalized.selectedId);
  }

  const query = params.toString();
  return query ? `/candidatures?${query}` : "/candidatures";
}

export function normalizeCandidateReturnPath(value: unknown) {
  if (
    typeof value === "string" &&
    /^\/candidatures(?:\?|$)/.test(value) &&
    !value.startsWith("//")
  ) {
    return value;
  }

  return "/candidatures";
}

export function getCandidateNextAction({
  status,
  preReservationProgressLabel,
}: {
  status: string | null;
  preReservationProgressLabel: string | null | undefined;
}): CandidateNextAction {
  if (status === "new" || status === "to_review" || status === "to_call") {
    return {
      label: "Relire et qualifier",
      detail: "Le projet doit être relu avant de décider de la suite.",
      tone: "attention",
    };
  }

  if (status === "qualified" || status === "waiting_litter") {
    if (preReservationProgressLabel === "Pré-réservation réglée") {
      return {
        label: "Ouvrir le parcours adoptant",
        detail: "Le premier versement est enregistré et le parcours peut continuer.",
        tone: "complete",
      };
    }

    if (preReservationProgressLabel === "Demande de pré-réservation") {
      return {
        label: "Vérifier le premier versement",
        detail: "Une demande existe déjà et reste en attente de règlement.",
        tone: "attention",
      };
    }

    return {
      label: "Préparer la pré-réservation",
      detail: "La candidature est validée ; son positionnement peut être préparé.",
      tone: "follow_up",
    };
  }

  return {
    label: "Consulter le dossier",
    detail: "Aucune action courante n’est attendue pour ce statut.",
    tone: "neutral",
  };
}
