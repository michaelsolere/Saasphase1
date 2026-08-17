export type ReservationPreparationRole =
  | "owner"
  | "admin"
  | "member"
  | "viewer";

export type ReservationPreparationDocumentType =
  | "commitment_certificate"
  | "reservation_contract";

export type ReservationPreparationDocument = {
  id: string;
  type: ReservationPreparationDocumentType;
  status: string;
  version: number;
  sendable: boolean;
};

export type ReservationPreparationInput = {
  reservationId: string;
  reservationUpdatedAt: string;
  role: ReservationPreparationRole;
  reservationStatus: string;
  familyName: string;
  recipientEmail: string | null;
  litterId: string | null;
  litterName: string | null;
  positioningStatus: string | null;
  paidDepositCents: number;
  preReservationDepositCents: number;
  completeDepositCents: number;
  complementDueDate: string | null;
  activeComplementRequest: {
    id: string;
    amountCents: number;
    dueDate: string | null;
  } | null;
  documents: ReservationPreparationDocument[];
  variables: Record<string, string>;
  template: {
    registryTitle: string;
    brevoTemplateId: number;
    providerName: string | null;
    subject: string | null;
    htmlContent: string | null;
    modifiedAt: string | null;
    active: boolean;
  } | null;
  brevoConfigured: boolean;
  previousDeliveryStatus: string | null;
};

export type ReservationPreparationIssue = {
  code: string;
  label: string;
};

const documentLabels: Record<ReservationPreparationDocumentType, string> = {
  commitment_certificate: "Certificat d’engagement",
  reservation_contract: "Contrat de réservation",
};

const stateLabels: Record<string, string> = {
  complete: "Complet",
  complement_required: "Complément requis",
  ready_to_send: "Prêt à envoyer",
  incomplete: "Incomplet",
  sent: "Envoyé",
  sending: "Envoi en cours",
  not_ready: "Non prêt",
};

export function formatReservationPreparationStateLabel(state: string) {
  return stateLabels[state] ?? state.replaceAll("_", " ");
}

const requiredVariableKeys = [
  "prenom",
  "portee",
  "montant_complement_arrhes",
] as const;

function validEmail(value: string | null) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

function issue(code: string, label: string): ReservationPreparationIssue {
  return { code, label };
}

function findCurrentDocument(
  documents: ReservationPreparationDocument[],
  type: ReservationPreparationDocumentType,
) {
  return documents.filter((document) => document.type === type);
}

export function buildReservationPreparation(input: ReservationPreparationInput) {
  const blockers: ReservationPreparationIssue[] = [];
  const warnings: ReservationPreparationIssue[] = [];
  const complementCents = Math.max(
    0,
    input.completeDepositCents - input.paidDepositCents,
  );

  if (input.role !== "owner" && input.role !== "admin") {
    blockers.push(issue("role_forbidden", "Un rôle owner ou admin est requis."));
  }
  if (input.reservationStatus !== "pre_reservation_paid") {
    blockers.push(
      issue(
        "reservation_not_eligible",
        "Le parcours n’est pas dans l’état attendu pour cet envoi.",
      ),
    );
  }
  if (!validEmail(input.recipientEmail)) {
    blockers.push(
      issue(
        "recipient_email_missing",
        "L’adresse email du destinataire est absente ou invalide.",
      ),
    );
  }
  if (!input.litterId) {
    blockers.push(issue("litter_missing", "La portée de réservation est absente."));
  }
  if (input.paidDepositCents < input.preReservationDepositCents) {
    blockers.push(
      issue(
        "pre_reservation_unpaid",
        "Le premier versement affecté reste insuffisant.",
      ),
    );
  }
  if (["postponed", "withdrawn", "blocked"].includes(input.positioningStatus ?? "")) {
    blockers.push(
      issue(
        "positioning_incompatible",
        "La décision de positionnement actuelle exclut cet envoi.",
      ),
    );
  } else if (input.positioningStatus !== "confirmed") {
    warnings.push(
      issue(
        "positioning_unconfirmed",
        "Le positionnement n’est pas confirmé ; il reste à suivre sans bloquer le contrat.",
      ),
    );
  }

  const selectedDocuments: ReservationPreparationDocument[] = [];
  for (const type of [
    "commitment_certificate",
    "reservation_contract",
  ] as const) {
    const matches = findCurrentDocument(input.documents, type);
    if (matches.length === 0) {
      blockers.push(
        issue(`${type}_missing`, `${documentLabels[type]} manquant.`),
      );
      continue;
    }
    if (matches.length !== 1 || !matches[0]!.sendable) {
      blockers.push(
        issue(`${type}_incoherent`, `${documentLabels[type]} non envoyable ou incohérent.`),
      );
      continue;
    }
    selectedDocuments.push(matches[0]!);
  }

  if (!input.template?.brevoTemplateId || !input.template.active) {
    blockers.push(issue("brevo_template_missing", "Le modèle Brevo actif est absent."));
  }
  if (!input.brevoConfigured) {
    blockers.push(issue("brevo_not_configured", "La connexion Brevo n’est pas configurée."));
  }

  const missingRequiredVariables = requiredVariableKeys.filter(
    (key) => !(input.variables[key] ?? "").trim(),
  );
  if (missingRequiredVariables.length > 0) {
    blockers.push(
      issue(
        "required_variables_missing",
        `Variables indispensables manquantes : ${missingRequiredVariables.join(", ")}.`,
      ),
    );
  }
  const optionalVariableKeys = Object.keys(input.variables).filter(
    (key) => !requiredVariableKeys.includes(key as (typeof requiredVariableKeys)[number]),
  );
  const missingOptionalVariables = optionalVariableKeys.filter(
    (key) => !input.variables[key]!.trim(),
  );
  if (missingOptionalVariables.length > 0) {
    warnings.push(
      issue(
        "optional_variables_missing",
        `Variables secondaires vides : ${missingOptionalVariables.join(", ")}.`,
      ),
    );
  }

  const requestMatches =
    input.activeComplementRequest?.amountCents === complementCents;
  if (
    input.activeComplementRequest &&
    complementCents === 0
  ) {
    warnings.push(
      issue(
        "stale_complement_request",
        "Une ancienne demande de complément reste active ; elle doit être suivie séparément sans bloquer l’envoi des documents.",
      ),
    );
  } else if (
    input.activeComplementRequest &&
    !requestMatches
  ) {
    blockers.push(
      issue(
        "active_complement_incompatible",
        "Une demande de complément active porte sur un autre montant.",
      ),
    );
  }
  if (input.previousDeliveryStatus === "sending") {
    blockers.push(
      issue("delivery_in_progress", "Un envoi de cette réservation est déjà en cours."),
    );
  }

  const financial = {
    state: complementCents === 0 ? "complete" as const : "complement_required" as const,
    paidCents: input.paidDepositCents,
    targetCents: input.completeDepositCents,
    complementCents,
    dueDate: complementCents === 0
      ? null
      : input.activeComplementRequest?.dueDate ?? input.complementDueDate,
    requestState: complementCents === 0
      ? "not_required" as const
      : requestMatches
        ? "will_reuse" as const
        : "will_create" as const,
  };
  const documentary = {
    state: selectedDocuments.length === 2
      ? "ready_to_send" as const
      : "incomplete" as const,
    documents: selectedDocuments,
  };
  const contractual = {
    state: input.previousDeliveryStatus === "sent"
      ? "sent" as const
      : input.previousDeliveryStatus === "sending"
        ? "sending" as const
        : selectedDocuments.length === 2
          ? "ready_to_send" as const
          : "not_ready" as const,
    deliveryStatus: input.previousDeliveryStatus,
  };

  return {
    financial,
    documentary,
    contractual,
    blockers,
    warnings,
    canConfirm: blockers.length === 0 && contractual.state === "ready_to_send",
    summary: {
      recipient: input.recipientEmail,
      familyName: input.familyName,
      litterName: input.litterName,
      template: input.template,
      complementCents,
      dueDate: financial.dueDate,
      attachments: selectedDocuments.map(
        (document) => `${documentLabels[document.type]} · version ${document.version}`,
      ),
    },
  };
}

export function buildReservationPreparationKey(
  input: ReservationPreparationInput,
) {
  return JSON.stringify({
    reservationId: input.reservationId,
    reservationUpdatedAt: input.reservationUpdatedAt,
    role: input.role,
    reservationStatus: input.reservationStatus,
    recipientEmail: input.recipientEmail,
    litterId: input.litterId,
    positioningStatus: input.positioningStatus,
    paidDepositCents: input.paidDepositCents,
    preReservationDepositCents: input.preReservationDepositCents,
    completeDepositCents: input.completeDepositCents,
    complementDueDate: input.complementDueDate,
    activeComplementRequest: input.activeComplementRequest,
    documents: [...input.documents]
      .sort((left, right) => left.type.localeCompare(right.type))
      .map(({ id, type, status, version, sendable }) => ({
        id,
        type,
        status,
        version,
        sendable,
      })),
    variables: Object.fromEntries(
      Object.entries(input.variables).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    template: input.template,
    brevoConfigured: input.brevoConfigured,
    previousDeliveryStatus: input.previousDeliveryStatus,
  });
}

export function buildReservationPreparationReturnPath(value: string | null) {
  const fallback = "/reservations?view=current";
  if (!value?.startsWith("/reservations?")) return fallback;
  try {
    const url = new URL(value, "http://localhost");
    return url.origin === "http://localhost" && url.pathname === "/reservations"
      ? `${url.pathname}${url.search}`
      : fallback;
  } catch {
    return fallback;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBrevoPreviewHtml(
  html: string,
  variables: Record<string, string>,
) {
  return html.replace(
    /{{\s*params\.([a-zA-Z0-9_]+)\s*}}/g,
    (placeholder, key: string) =>
      Object.hasOwn(variables, key)
        ? escapeHtml(variables[key] ?? "")
        : placeholder,
  );
}
