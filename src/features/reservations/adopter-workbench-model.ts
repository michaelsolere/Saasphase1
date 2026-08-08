import {
  adopterProfileStateLabels,
  deriveAdopterProfileState,
  isAdopterProfileMilestoneComplete,
  type AdopterProfileWorkbenchSummary,
} from "@/features/adopter-profile-questionnaire/state";

export type AdopterWorkbenchView = "current" | "waiting" | "finalized" | "follow_up";
export type AdopterQueue = "incomplete" | "flexible" | "female" | "male";
export type AdopterMilestoneKey =
  | "opening"
  | "profile"
  | "positioning"
  | "reservation"
  | "choice_assignment"
  | "departure"
  | "adoption";
export type AdopterStepState = "done" | "todo" | "waiting" | "blocked" | "not_applicable";
export type AdopterActionState = "blocked" | "overdue" | "due" | "normal" | "none";
export type AdopterWorkbenchSort =
  | "scope_queue_rank"
  | "urgency"
  | "deadline"
  | "name"
  | "step"
  | "choice_appointment"
  | "departure_appointment";

export type RecentAdopterEvent = {
  id: string;
  kind: "decision" | "payment" | "document" | "appointment" | "email" | "note" | "manual_contact";
  label: string;
  detail: string | null;
  occurredAt: string;
};

export type AdopterWorkbenchRecord = {
  id: string;
  contactId: string | null;
  familyName: string;
  email: string | null;
  phone: string | null;
  reference: string;
  status: string;
  openingEventAt: string | null;
  historicalPaidOpeningCents: number;
  litterId: string | null;
  litterName: string | null;
  litterGroupId: string | null;
  litterGroupName: string | null;
  sexPreference: string | null;
  preferenceFlexible: boolean;
  rank: number | null;
  animalId: string | null;
  animalName: string | null;
  identificationNumber: string | null;
  adoptionCompletedAt: string | null;
  priceCents: number | null;
  paidCents: number;
  refundedCents: number;
  financialResolution: string | null;
  documentCount: number;
  signedDocumentCount: number;
  choiceAppointmentAt: string | null;
  choiceAppointmentStatus: string | null;
  departureAppointmentAt: string | null;
  departureAppointmentStatus: string | null;
  noteCount: number;
  profile?: AdopterProfileWorkbenchSummary | null;
  manualContacts?: Array<{ id: string; label: string }>;
  recentEvents: RecentAdopterEvent[];
  updatedAt: string;
};

export type AdopterAction = {
  key: string;
  label: string;
  detail: string;
  state: AdopterActionState;
  milestone: AdopterMilestoneKey;
  href?: string;
  available: boolean;
};

export type AdopterMilestone = {
  key: AdopterMilestoneKey;
  label: string;
  state: AdopterStepState;
  detail: string;
};

export type AdopterJourney = {
  record: AdopterWorkbenchRecord;
  primaryView: Exclude<AdopterWorkbenchView, "follow_up">;
  followUp: boolean;
  queue: AdopterQueue;
  scopeKey: string;
  scopeLabel: string;
  milestones: AdopterMilestone[];
  currentMilestone: AdopterMilestone;
  actions: AdopterAction[];
  primaryAction: AdopterAction;
  otherActionCount: number;
};

const FINAL_STATUSES = new Set(["adopted", "cancelled", "withdrawn", "expired", "closed"]);
const WAITING_STATUSES = new Set(["postponed", "on_hold", "deferred"]);
const labels: Record<AdopterMilestoneKey, string> = {
  opening: "Ouverture",
  profile: "Profil",
  positioning: "Positionnement",
  reservation: "Réservation",
  choice_assignment: "Choix / attribution",
  departure: "Départ",
  adoption: "Adoption",
};
const priority: Record<AdopterActionState, number> = {
  blocked: 0,
  overdue: 1,
  due: 2,
  normal: 3,
  none: 4,
};

export function hasAcceptedJourneyOpeningProof(record: AdopterWorkbenchRecord) {
  return Boolean(record.openingEventAt) || record.historicalPaidOpeningCents > 0;
}

export function classifyAdopterView(record: AdopterWorkbenchRecord) {
  const primary = FINAL_STATUSES.has(record.status)
    ? "finalized"
    : WAITING_STATUSES.has(record.status)
      ? "waiting"
      : "current";
  const followUp =
    record.financialResolution === "pending" ||
    (primary === "current" && !record.adoptionCompletedAt);
  return { primary, followUp } as const;
}

function deriveQueue(record: AdopterWorkbenchRecord): AdopterQueue {
  if (!record.rank || (!record.litterId && !record.litterGroupId) || !record.sexPreference) {
    return "incomplete";
  }
  if (record.preferenceFlexible || !["female", "male"].includes(record.sexPreference)) {
    return "flexible";
  }
  return record.sexPreference as "female" | "male";
}

function action(
  key: string,
  label: string,
  detail: string,
  state: AdopterActionState,
  milestone: AdopterMilestoneKey,
  available = true,
  href?: string,
): AdopterAction {
  return { key, label, detail, state, milestone, available, href };
}

export function deriveAdopterJourney(
  record: AdopterWorkbenchRecord,
  now = new Date(),
): AdopterJourney {
  const view = classifyAdopterView(record);
  const openingDone = hasAcceptedJourneyOpeningProof(record);
  const queue = deriveQueue(record);
  const profileDone = record.profile
    ? isAdopterProfileMilestoneComplete(record.profile)
    : false;
  const profileState = record.profile ? deriveAdopterProfileState(record.profile, now) : null;
  const positionDone = Boolean(
    record.rank &&
    (record.litterId || record.litterGroupId) &&
    queue !== "incomplete",
  );
  const reservationDone = record.documentCount > 0 && record.signedDocumentCount >= record.documentCount;
  const choiceDone = Boolean(record.animalId && record.choiceAppointmentStatus === "done");
  const departureDone = Boolean(record.identificationNumber && record.departureAppointmentStatus === "done");
  const adoptionDone = Boolean(record.adoptionCompletedAt || record.status === "adopted");
  const facts: Array<[AdopterMilestoneKey, boolean, string]> = [
    ["opening", openingDone, openingDone ? "Versement accepté" : "Preuve de versement manquante"],
    ["profile", profileDone, profileState ? adopterProfileStateLabels[profileState] : "Questionnaire à préparer"],
    ["positioning", positionDone, positionDone ? "Portée et rang connus" : "Position ou rang à compléter"],
    ["reservation", reservationDone, reservationDone ? "Documents reçus" : "Formalisation à venir"],
    ["choice_assignment", choiceDone, choiceDone ? `${record.animalName ?? "Animal"} attribué` : "Choix ou attribution à venir"],
    ["departure", departureDone, departureDone ? "Départ préparé" : "Contrôles de départ à venir"],
    ["adoption", adoptionDone, adoptionDone ? "Adoption finalisée" : "Finalisation à venir"],
  ];
  const firstMissing = facts.findIndex(([, done]) => !done);
  const milestones = facts.map(([key, done, detail], index) => ({
    key,
    label: labels[key],
    state: done ? "done" : index === firstMissing ? "todo" : "waiting",
    detail,
  })) satisfies AdopterMilestone[];

  const actions: AdopterAction[] = [];
  if (record.financialResolution === "pending") {
    actions.push(action("financial", "Résoudre la situation financière", "Décision sensible à traiter dans le parcours complet.", "blocked", "opening", false, `/reservations/${record.id}#financial-resolution`));
  }
  if (!profileDone) {
    const profileLabel = profileState ? adopterProfileStateLabels[profileState] : "Questionnaire à préparer";
    const profileActionLabel = profileState === "received_to_read"
      ? "Lire le questionnaire"
      : profileState === "send_failed"
        ? "Renvoyer le questionnaire"
        : profileState === "awaiting_response" || profileState === "overdue"
          ? "Suivre le questionnaire"
          : "Envoyer le questionnaire";
    actions.push(action(
      "profile",
      profileActionLabel,
      profileLabel,
      profileState === "send_failed" ? "blocked" : profileState === "overdue" ? "overdue" : profileState === "received_to_read" ? "due" : "normal",
      "profile",
      Boolean(record.profile),
    ));
  }
  if (!positionDone) {
    actions.push(action("position", "Compléter le positionnement", "Renseigner la portée, la file et le rang.", "blocked", "positioning", false));
  }
  if (record.priceCents !== null && record.paidCents - record.refundedCents < record.priceCents) {
    actions.push(action("payment", "Contrôler les versements", "Enregistrer uniquement un versement réellement constaté.", "normal", "reservation", true, `/reservations/${record.id}#payments`));
  }
  if (!reservationDone) {
    actions.push(action("documents", "Préparer les documents", "La préparation guidée arrive dans un prochain lot.", "normal", "reservation", false));
  }
  if (!record.choiceAppointmentAt) {
    actions.push(action("choice-appointment", "Organiser le rendez-vous de choix", "Créer le rendez-vous depuis le panneau.", "normal", "choice_assignment", true));
  } else if (new Date(record.choiceAppointmentAt).getTime() < now.getTime() && record.choiceAppointmentStatus !== "done") {
    actions.push(action("choice-overdue", "Vérifier le rendez-vous de choix", "Le créneau est passé sans confirmation.", "overdue", "choice_assignment", true));
  }
  if (!record.animalId) {
    actions.push(action("assignment", "Confirmer l’attribution", "Disponible dans le lot Choix / attribution.", "normal", "choice_assignment", false));
  }
  if (record.animalId && !record.identificationNumber) {
    actions.push(action("identification", "Vérifier l’identification", "Le numéro d’identification est requis avant le départ.", "blocked", "departure", false));
  }
  if (!record.departureAppointmentAt) {
    actions.push(action("departure-appointment", "Préparer le départ", "Créer le rendez-vous de départ depuis le panneau.", "normal", "departure", true));
  }
  if (actions.length === 0) {
    actions.push(action("up-to-date", "À jour", "Aucune action ouverte.", "none", "adoption"));
  }
  actions.sort((left, right) => priority[left.state] - priority[right.state]);
  const scopeKey = record.litterId ?? record.litterGroupId ?? "unassigned";
  const scopeLabel = record.litterName ?? record.litterGroupName ?? "Portée ou groupe à compléter";
  return {
    record,
    primaryView: view.primary,
    followUp: view.followUp || actions.some((item) => item.state !== "none"),
    queue,
    scopeKey,
    scopeLabel,
    milestones,
    currentMilestone: milestones[firstMissing < 0 ? milestones.length - 1 : firstMissing]!,
    actions,
    primaryAction: actions[0]!,
    otherActionCount: Math.max(0, actions.length - 1),
  };
}

export function groupAdopterJourneys(journeys: AdopterJourney[]) {
  const scopes = new Map<string, AdopterJourney[]>();
  for (const journey of journeys) {
    const items = scopes.get(journey.scopeKey) ?? [];
    items.push(journey);
    scopes.set(journey.scopeKey, items);
  }
  const queueOrder: AdopterQueue[] = ["incomplete", "flexible", "female", "male"];
  const queueLabels: Record<AdopterQueue, string> = {
    incomplete: "À compléter",
    flexible: "Préférence souple — à positionner",
    female: "Femelles, par rang",
    male: "Mâles, par rang",
  };
  return [...scopes.entries()]
    .map(([key, items]) => ({
      key,
      label: items[0]!.scopeLabel,
      sections: queueOrder
        .map((queue) => ({
          key: queue,
          label: queueLabels[queue],
          items: items
            .filter((item) => item.queue === queue)
            .sort((a, b) => (a.record.rank ?? Number.MAX_SAFE_INTEGER) - (b.record.rank ?? Number.MAX_SAFE_INTEGER)),
        }))
        .filter((section) => section.items.length > 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export type AdopterWorkbenchFilters = {
  view: AdopterWorkbenchView;
  search: string;
  step: AdopterMilestoneKey | "all";
  actionState: AdopterActionState | "all";
  queue: AdopterQueue | "all";
  sort: AdopterWorkbenchSort;
};

export function filterAndSortAdopterJourneys(
  journeys: AdopterJourney[],
  filters: AdopterWorkbenchFilters,
) {
  const needle = filters.search.trim().toLocaleLowerCase("fr");
  const visible = journeys.filter((journey) => {
    const viewMatches = filters.view === "follow_up" ? journey.followUp : journey.primaryView === filters.view;
    const searchable = [journey.record.familyName, journey.record.email, journey.record.phone, journey.scopeLabel, journey.record.animalName, journey.record.identificationNumber, journey.record.reference]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("fr");
    return viewMatches && (!needle || searchable.includes(needle)) &&
      (filters.step === "all" || journey.currentMilestone.key === filters.step) &&
      (filters.actionState === "all" || journey.primaryAction.state === filters.actionState) &&
      (filters.queue === "all" || journey.queue === filters.queue);
  });
  return [...visible].sort((a, b) => {
    if (filters.sort === "name") return a.record.familyName.localeCompare(b.record.familyName, "fr");
    if (filters.sort === "urgency") return priority[a.primaryAction.state] - priority[b.primaryAction.state];
    if (filters.sort === "step") return a.milestones.indexOf(a.currentMilestone) - b.milestones.indexOf(b.currentMilestone);
    if (filters.sort === "choice_appointment") return (a.record.choiceAppointmentAt ?? "9999").localeCompare(b.record.choiceAppointmentAt ?? "9999");
    if (filters.sort === "departure_appointment") return (a.record.departureAppointmentAt ?? "9999").localeCompare(b.record.departureAppointmentAt ?? "9999");
    if (filters.sort === "deadline") return priority[a.primaryAction.state] - priority[b.primaryAction.state];
    return a.scopeLabel.localeCompare(b.scopeLabel, "fr") || ["incomplete", "flexible", "female", "male"].indexOf(a.queue) - ["incomplete", "flexible", "female", "male"].indexOf(b.queue) || (a.record.rank ?? Number.MAX_SAFE_INTEGER) - (b.record.rank ?? Number.MAX_SAFE_INTEGER);
  });
}

export function buildAdopterWorkbenchPath(
  filters: AdopterWorkbenchFilters & { selectedId?: string | null },
) {
  const params = new URLSearchParams();
  params.set("view", filters.view);
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.step !== "all") params.set("step", filters.step);
  if (filters.actionState !== "all") params.set("action", filters.actionState);
  if (filters.queue !== "all") params.set("queue", filters.queue);
  if (filters.sort !== "scope_queue_rank") params.set("sort", filters.sort);
  if (filters.selectedId && /^[0-9a-f-]{36}$/i.test(filters.selectedId)) params.set("selected", filters.selectedId);
  return `/reservations?${params.toString()}`;
}
