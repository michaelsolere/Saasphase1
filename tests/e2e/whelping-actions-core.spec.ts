import { expect, test } from "@playwright/test";

import {
  closeWhelpingSessionActionCore,
  initialWhelpingActionState,
  initialWhelpingBirthActionState,
  openWhelpingSessionActionCore,
  recordWhelpingBirthActionCore,
  recordWhelpingBirthWeightActionCore,
  recordWhelpingEventActionCore,
  reopenWhelpingSessionActionCore,
  whelpingErrorMessage,
  type CloseWhelpingSessionIntention,
  type OpenWhelpingSessionIntention,
  type RecordWhelpingBirthIntention,
  type RecordWhelpingBirthWeightIntention,
  type RecordWhelpingEventIntention,
  type ReopenWhelpingSessionIntention,
  type WhelpingActionDependencies,
} from "../../src/features/whelping/whelping-actions-core";
import type {
  CloseWhelpingSessionInput,
  OpenWhelpingSessionInput,
  RecordWhelpingBirthInput,
  RecordWhelpingBirthWeightInput,
  RecordWhelpingEventInput,
  ReopenWhelpingSessionInput,
  WhelpingServiceErrorCode,
} from "../../src/features/whelping/whelping-core";

const litterId = "10000000-0000-4000-8000-000000000001";
const sessionId = "20000000-0000-4000-8000-000000000002";
const clientCommandId = "30000000-0000-4000-8000-000000000003";
const technicalId = "40000000-0000-4000-8000-000000000004";
const birthId = "50000000-0000-4000-8000-000000000005";

const openIntention: OpenWhelpingSessionIntention = {
  litterId,
  clientCommandId,
};
const sessionIntention: RecordWhelpingEventIntention = {
  litterId,
  sessionId,
  clientCommandId,
};
const birthWeightIntention: RecordWhelpingBirthWeightIntention = {
  ...sessionIntention,
  birthId,
};

function openForm() {
  const formData = new FormData();
  formData.set("started_at", "2026-07-19T10:15:00+02:00");
  formData.set("timezone_name", " Europe/Paris ");
  formData.set("note", " Début du travail ");
  return formData;
}

function eventForm(eventType = "contractions") {
  const formData = new FormData();
  formData.set("occurred_at", "2026-07-19T10:30:00+02:00");
  formData.set("event_type", eventType);
  formData.set("note", " Rapprochées ");
  return formData;
}

function birthForm() {
  const formData = new FormData();
  formData.set("occurred_at", "2026-07-19T11:00:00+02:00");
  formData.set("sex", "female");
  formData.set("viability", "alive");
  formData.set("initial_collar_color", " Rose ");
  formData.set("birth_weight_grams", " 420 ");
  formData.set("measured_at", "2026-07-19T11:02:00+02:00");
  formData.set("note", " Vigoureuse ");
  return formData;
}

function closeForm() {
  const formData = new FormData();
  formData.set("ended_at", "2026-07-19T15:00:00+02:00");
  formData.set("note", " Terminée ");
  return formData;
}

function reopenForm() {
  const formData = new FormData();
  formData.set("reopened_at", "2026-07-19T15:10:00+02:00");
  formData.set("reason", " Clôture trop précoce ");
  return formData;
}

function birthWeightForm() {
  const formData = new FormData();
  formData.set("birth_weight_grams", " 438 ");
  formData.set("measured_at", "2026-07-19T11:12:00+02:00");
  formData.set("note", " Pesée après séchage ");
  return formData;
}

function harness() {
  const opened: OpenWhelpingSessionInput[] = [];
  const events: RecordWhelpingEventInput[] = [];
  const births: RecordWhelpingBirthInput[] = [];
  const birthWeights: RecordWhelpingBirthWeightInput[] = [];
  const closed: CloseWhelpingSessionInput[] = [];
  const reopened: ReopenWhelpingSessionInput[] = [];
  const paths: string[] = [];
  const dependencies: WhelpingActionDependencies = {
    openSession: async (input) => {
      opened.push(input);
      return {
        outcome: "success",
        sessionId: technicalId,
        litterId,
        motherId: technicalId,
        replayed: false,
      };
    },
    recordEvent: async (input) => {
      events.push(input);
      return {
        outcome: "success",
        eventId: technicalId,
        sessionId,
        sequenceNo: 3,
        replayed: false,
      };
    },
    recordBirth: async (input) => {
      births.push(input);
      return {
        outcome: "success",
        birthId: technicalId,
        eventId: technicalId,
        animalId: technicalId,
        weightMeasurementId: technicalId,
        eventSequenceNo: 4,
        birthOrder: 2,
        replayed: false,
      };
    },
    recordBirthWeight: async (input) => {
      birthWeights.push(input);
      return {
        outcome: "success",
        birthId,
        animalId: technicalId,
        weightMeasurementId: technicalId,
        replayed: false,
      };
    },
    closeSession: async (input) => {
      closed.push(input);
      return {
        outcome: "success",
        sessionId,
        eventId: technicalId,
        sequenceNo: 5,
        replayed: false,
      };
    },
    reopenSession: async (input) => {
      reopened.push(input);
      return {
        outcome: "success",
        sessionId,
        eventId: technicalId,
        sequenceNo: 6,
        replayed: false,
      };
    },
    revalidatePath: (path) => paths.push(path),
  };
  return { dependencies, opened, events, births, birthWeights, closed, reopened, paths };
}

function forgeTechnicalFields(formData: FormData) {
  for (const field of [
    "organization_id",
    "litter_id",
    "session_id",
    "client_command_id",
    "sequence_no",
    "birth_order",
    "animal_id",
    "birth_id",
    "measurement_id",
    "weight_measurement_id",
    "born_total_count",
    "status",
  ]) {
    formData.set(field, technicalId);
  }
  return formData;
}

test("transmet les quatre payloads normalisés et utilise les intentions liées", async () => {
  const context = harness();

  await openWhelpingSessionActionCore(
    openIntention,
    initialWhelpingActionState,
    forgeTechnicalFields(openForm()),
    context.dependencies,
  );
  await recordWhelpingEventActionCore(
    sessionIntention,
    initialWhelpingActionState,
    forgeTechnicalFields(eventForm()),
    context.dependencies,
  );
  await recordWhelpingBirthActionCore(
    sessionIntention,
    initialWhelpingBirthActionState,
    forgeTechnicalFields(birthForm()),
    context.dependencies,
  );
  await closeWhelpingSessionActionCore(
    sessionIntention,
    initialWhelpingActionState,
    forgeTechnicalFields(closeForm()),
    context.dependencies,
  );

  expect(context.opened).toEqual([
    {
      litterId,
      clientCommandId,
      startedAt: "2026-07-19T08:15:00.000Z",
      timezoneName: "Europe/Paris",
      note: "Début du travail",
    },
  ]);
  expect(context.events).toEqual([
    {
      sessionId,
      clientCommandId,
      occurredAt: "2026-07-19T08:30:00.000Z",
      eventType: "contractions",
      note: "Rapprochées",
    },
  ]);
  expect(context.births).toEqual([
    {
      sessionId,
      clientCommandId,
      occurredAt: "2026-07-19T09:00:00.000Z",
      sex: "female",
      viability: "alive",
      initialCollarColor: "Rose",
      birthWeightGrams: 420,
      measuredAt: "2026-07-19T09:02:00.000Z",
      note: "Vigoureuse",
    },
  ]);
  expect(context.closed).toEqual([
    {
      sessionId,
      clientCommandId,
      endedAt: "2026-07-19T13:00:00.000Z",
      note: "Terminée",
    },
  ]);
});

test("transmet la réouverture normalisée sans identifiant navigateur", async () => {
  const context = harness();
  const state = await reopenWhelpingSessionActionCore(
    sessionIntention as ReopenWhelpingSessionIntention,
    initialWhelpingActionState,
    forgeTechnicalFields(reopenForm()),
    context.dependencies,
  );

  expect(context.reopened).toEqual([{
    sessionId,
    clientCommandId,
    reopenedAt: "2026-07-19T13:10:00.000Z",
    reason: "Clôture trop précoce",
  }]);
  expect(state).toEqual({
    status: "success",
    message: "La session de mise-bas a été rouverte.",
    replayed: false,
  });
  expect(JSON.stringify(state)).not.toContain(technicalId);
});

test("refuse un motif de réouverture vide, trop long ou un timestamp sans offset", async () => {
  for (const mutate of [
    (form: FormData) => form.set("reason", "   "),
    (form: FormData) => form.set("reason", "r".repeat(501)),
    (form: FormData) => form.set("reopened_at", "2026-07-19T15:10:00"),
  ]) {
    const context = harness();
    const form = reopenForm();
    mutate(form);
    expect((await reopenWhelpingSessionActionCore(
      sessionIntention,
      initialWhelpingActionState,
      form,
      context.dependencies,
    )).status).toBe("error");
    expect(context.reopened).toEqual([]);
    expect(context.paths).toEqual([]);
  }
});

test("refuse tout timestamp sans décalage explicite", async () => {
  const cases = [
    async (context: ReturnType<typeof harness>) => {
      const form = openForm();
      form.set("started_at", "2026-07-19T10:15:00");
      return openWhelpingSessionActionCore(openIntention, initialWhelpingActionState, form, context.dependencies);
    },
    async (context: ReturnType<typeof harness>) => {
      const form = eventForm();
      form.set("occurred_at", "2026-07-19T10:30:00");
      return recordWhelpingEventActionCore(sessionIntention, initialWhelpingActionState, form, context.dependencies);
    },
    async (context: ReturnType<typeof harness>) => {
      const form = birthForm();
      form.set("occurred_at", "2026-07-19T11:00:00");
      return recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, form, context.dependencies);
    },
    async (context: ReturnType<typeof harness>) => {
      const form = birthForm();
      form.set("measured_at", "2026-07-19T11:02:00");
      return recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, form, context.dependencies);
    },
    async (context: ReturnType<typeof harness>) => {
      const form = closeForm();
      form.set("ended_at", "2026-07-19T15:00:00");
      return closeWhelpingSessionActionCore(sessionIntention, initialWhelpingActionState, form, context.dependencies);
    },
  ];

  for (const run of cases) {
    const context = harness();
    expect((await run(context)).status).toBe("error");
    expect(context.opened).toEqual([]);
    expect(context.events).toEqual([]);
    expect(context.births).toEqual([]);
    expect(context.closed).toEqual([]);
    expect(context.paths).toEqual([]);
  }
});

test("refuse un fuseau IANA vide, trop long ou invalide", async () => {
  for (const timezone of ["", "x".repeat(256), "Europe/Not_A_Zone"]) {
    const context = harness();
    const form = openForm();
    form.set("timezone_name", timezone);
    expect(
      (await openWhelpingSessionActionCore(openIntention, initialWhelpingActionState, form, context.dependencies)).status,
    ).toBe("error");
    expect(context.opened).toEqual([]);
  }
});

test("accepte exclusivement les huit types d'événement générique", async () => {
  for (const eventType of [
    "labor_started",
    "contractions",
    "water_broke",
    "placenta",
    "nursing",
    "vet_called",
    "intervention",
    "observation",
  ]) {
    const context = harness();
    expect(
      (await recordWhelpingEventActionCore(sessionIntention, initialWhelpingActionState, eventForm(eventType), context.dependencies)).status,
    ).toBe("success");
    expect(context.events[0].eventType).toBe(eventType);
  }

  for (const eventType of ["birth", "session_closed", "session_reopened", "unknown"]) {
    const context = harness();
    expect(
      (await recordWhelpingEventActionCore(sessionIntention, initialWhelpingActionState, eventForm(eventType), context.dependencies)).status,
    ).toBe("error");
    expect(context.events).toEqual([]);
    expect(context.paths).toEqual([]);
  }
});

test("refuse les sexes et viabilités non autorisés", async () => {
  for (const [field, value] of [["sex", "other"], ["viability", "deceased"]] as const) {
    const context = harness();
    const form = birthForm();
    form.set(field, value);
    expect(
      (await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, form, context.dependencies)).status,
    ).toBe("error");
    expect(context.births).toEqual([]);
  }
});

test("accepte uniquement un poids entier strictement positif inférieur ou égal à 100000", async () => {
  for (const validWeight of ["1", "420", "100000"]) {
    const context = harness();
    const form = birthForm();
    form.set("birth_weight_grams", validWeight);
    expect(
      (await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, form, context.dependencies)).status,
    ).toBe("success");
    expect(context.births[0].birthWeightGrams).toBe(Number(validWeight));
  }

  for (const invalidWeight of ["0", "-1", "1.5", "1,5", "100001", "abc"]) {
    const context = harness();
    const form = birthForm();
    form.set("birth_weight_grams", invalidWeight);
    expect(
      (await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, form, context.dependencies)).status,
    ).toBe("error");
    expect(context.births).toEqual([]);
  }
});

test("applique strictement la dépendance entre poids et heure de pesée", async () => {
  const weightOnly = harness();
  const weightOnlyForm = birthForm();
  weightOnlyForm.delete("measured_at");
  expect(
    (await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, weightOnlyForm, weightOnly.dependencies)).status,
  ).toBe("error");

  const timeOnly = harness();
  const timeOnlyForm = birthForm();
  timeOnlyForm.delete("birth_weight_grams");
  expect(
    (await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, timeOnlyForm, timeOnly.dependencies)).status,
  ).toBe("error");

  const neither = harness();
  const neitherForm = birthForm();
  neitherForm.delete("birth_weight_grams");
  neitherForm.delete("measured_at");
  expect(
    (await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, neitherForm, neither.dependencies)).status,
  ).toBe("success");
  expect(neither.births[0]).toMatchObject({ birthWeightGrams: null, measuredAt: null });
});

test("applique les bornes de couleur et de note", async () => {
  const valid = harness();
  const validForm = birthForm();
  validForm.set("initial_collar_color", "c".repeat(255));
  validForm.set("note", "n".repeat(5_000));
  expect(
    (await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, validForm, valid.dependencies)).status,
  ).toBe("success");

  for (const [field, value] of [["initial_collar_color", "c".repeat(256)], ["note", "n".repeat(5_001)]] as const) {
    const context = harness();
    const form = birthForm();
    form.set(field, value);
    expect(
      (await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, form, context.dependencies)).status,
    ).toBe("error");
    expect(context.births).toEqual([]);
  }

  for (const run of [
    (context: ReturnType<typeof harness>, note: string) => {
      const form = openForm(); form.set("note", note);
      return openWhelpingSessionActionCore(openIntention, initialWhelpingActionState, form, context.dependencies);
    },
    (context: ReturnType<typeof harness>, note: string) => {
      const form = eventForm(); form.set("note", note);
      return recordWhelpingEventActionCore(sessionIntention, initialWhelpingActionState, form, context.dependencies);
    },
    (context: ReturnType<typeof harness>, note: string) => {
      const form = closeForm(); form.set("note", note);
      return closeWhelpingSessionActionCore(sessionIntention, initialWhelpingActionState, form, context.dependencies);
    },
  ]) {
    const context = harness();
    expect((await run(context, "n".repeat(5_001))).status).toBe("error");
  }
});

test("normalise toutes les chaînes facultatives vides en null", async () => {
  const context = harness();
  const open = openForm(); open.set("note", "   ");
  const event = eventForm(); event.set("note", "");
  const birth = birthForm();
  birth.set("initial_collar_color", " ");
  birth.set("birth_weight_grams", "");
  birth.set("measured_at", "");
  birth.set("note", " ");
  const close = closeForm(); close.set("note", " ");

  await openWhelpingSessionActionCore(openIntention, initialWhelpingActionState, open, context.dependencies);
  await recordWhelpingEventActionCore(sessionIntention, initialWhelpingActionState, event, context.dependencies);
  await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, birth, context.dependencies);
  await closeWhelpingSessionActionCore(sessionIntention, initialWhelpingActionState, close, context.dependencies);

  expect(context.opened[0].note).toBeNull();
  expect(context.events[0].note).toBeNull();
  expect(context.births[0]).toMatchObject({
    initialCollarColor: null,
    birthWeightGrams: null,
    measuredAt: null,
    note: null,
  });
  expect(context.closed[0].note).toBeNull();
});

test("traduit les principales erreurs métier sans reprendre leur détail technique", async () => {
  const codes: WhelpingServiceErrorCode[] = [
    "unauthenticated",
    "forbidden",
    "not_found",
    "invalid_input",
    "invalid_litter",
    "invalid_mother",
    "invalid_session",
    "already_open",
    "session_closed",
    "conflict",
    "database_error",
  ];
  for (const code of codes) {
    const message = whelpingErrorMessage({ code, message: "SQL secret details" });
    expect(message).toBeTruthy();
    expect(message).not.toContain("SQL secret details");
  }
  expect(whelpingErrorMessage({ code: "conflict", message: "Cette portée contient déjà des animaux créés hors du Journal." })).toContain("animaux administratifs");
  expect(whelpingErrorMessage({ code: "conflict", message: "La date de naissance enregistrée pour cette portée est incompatible." })).toContain("date réelle");
});

test("neutralise une exception inattendue sans revalidation", async () => {
  const context = harness();
  context.dependencies.recordEvent = async () => {
    throw new Error("SQL connection string");
  };
  const state = await recordWhelpingEventActionCore(
    sessionIntention,
    initialWhelpingActionState,
    eventForm(),
    context.dependencies,
  );
  expect(state.status).toBe("error");
  expect(state.message).not.toContain("SQL");
  expect(context.paths).toEqual([]);
});

test("revalide exactement les routes utiles après chaque succès", async () => {
  const opened = harness();
  await openWhelpingSessionActionCore(openIntention, initialWhelpingActionState, openForm(), opened.dependencies);
  expect(opened.paths).toEqual(["/litters/journal", `/litters/${litterId}`]);

  const event = harness();
  await recordWhelpingEventActionCore(sessionIntention, initialWhelpingActionState, eventForm(), event.dependencies);
  expect(event.paths).toEqual(["/litters/journal"]);

  const birth = harness();
  await recordWhelpingBirthActionCore(sessionIntention, initialWhelpingBirthActionState, birthForm(), birth.dependencies);
  expect(birth.paths).toEqual(["/litters/journal", "/litters", `/litters/${litterId}`, "/animals"]);

  const closed = harness();
  await closeWhelpingSessionActionCore(sessionIntention, initialWhelpingActionState, closeForm(), closed.dependencies);
  expect(closed.paths).toEqual(["/litters/journal", `/litters/${litterId}`]);

  const reopened = harness();
  await reopenWhelpingSessionActionCore(sessionIntention, initialWhelpingActionState, reopenForm(), reopened.dependencies);
  expect(reopened.paths).toEqual(["/litters/journal", `/litters/${litterId}`]);
});

test("ne revalide rien après une erreur métier", async () => {
  const context = harness();
  context.dependencies.openSession = async () => ({
    outcome: "error",
    error: { code: "already_open", message: "technical" },
  });
  const state = await openWhelpingSessionActionCore(
    openIntention,
    initialWhelpingActionState,
    openForm(),
    context.dependencies,
  );
  expect(state).toEqual({
    status: "error",
    message: "Une session de mise-bas est déjà ouverte pour cette portée.",
  });
  expect(context.paths).toEqual([]);
});

test("conserve le rejeu et ne retourne aucun identifiant technique", async () => {
  const context = harness();
  context.dependencies.openSession = async () => ({
    outcome: "success",
    sessionId: technicalId,
    litterId,
    motherId: technicalId,
    replayed: true,
  });
  const state = await openWhelpingSessionActionCore(
    openIntention,
    initialWhelpingActionState,
    openForm(),
    context.dependencies,
  );
  expect(state.replayed).toBe(true);
  expect(JSON.stringify(state)).not.toContain(technicalId);
});

test("retourne les ordres de naissance sans identifiants techniques", async () => {
  const context = harness();
  context.dependencies.recordBirth = async () => ({
    outcome: "success",
    birthId: technicalId,
    eventId: technicalId,
    animalId: technicalId,
    weightMeasurementId: technicalId,
    eventSequenceNo: 17,
    birthOrder: 6,
    replayed: true,
  });
  const state = await recordWhelpingBirthActionCore(
    sessionIntention as RecordWhelpingBirthIntention,
    initialWhelpingBirthActionState,
    birthForm(),
    context.dependencies,
  );
  expect(state).toEqual({
    status: "success",
    message: "La naissance a été enregistrée.",
    replayed: true,
    birthOrder: 6,
    eventSequenceNo: 17,
  });
  expect(JSON.stringify(state)).not.toContain(technicalId);
});

test("refuse une intention liée invalide avant tout appel", async () => {
  const context = harness();
  const invalidIntention: CloseWhelpingSessionIntention = {
    ...sessionIntention,
    sessionId: "forged-session",
  };
  const state = await closeWhelpingSessionActionCore(
    invalidIntention,
    initialWhelpingActionState,
    closeForm(),
    context.dependencies,
  );
  expect(state.status).toBe("error");
  expect(context.closed).toEqual([]);
  expect(context.paths).toEqual([]);
});

test("complète un poids avec l’intention serveur et les valeurs normalisées", async () => {
  const context = harness();
  const form = forgeTechnicalFields(birthWeightForm());
  form.set("birth_id", technicalId);
  form.set("animal_id", technicalId);
  form.set("session_id", technicalId);
  form.set("litter_id", technicalId);
  form.set("client_command_id", technicalId);
  form.set("organization_id", technicalId);
  form.set("weight_measurement_id", technicalId);

  const state = await recordWhelpingBirthWeightActionCore(
    birthWeightIntention,
    initialWhelpingActionState,
    form,
    context.dependencies,
  );

  expect(context.birthWeights).toEqual([{
    birthId,
    clientCommandId,
    weightGrams: 438,
    measuredAt: "2026-07-19T09:12:00.000Z",
    note: "Pesée après séchage",
  }]);
  expect(state).toEqual({
    status: "success",
    message: "Le poids de naissance a été enregistré.",
    replayed: false,
  });
  expect(JSON.stringify(state)).not.toContain(birthId);
  expect(JSON.stringify(state)).not.toContain(technicalId);
});

test("refuse les poids obligatoires hors bornes ou non entiers", async () => {
  for (const weight of ["", "1.5", "0", "-1", "100001"]) {
    const context = harness();
    const form = birthWeightForm();
    form.set("birth_weight_grams", weight);
    const state = await recordWhelpingBirthWeightActionCore(
      birthWeightIntention,
      initialWhelpingActionState,
      form,
      context.dependencies,
    );
    expect(state).toEqual({
      status: "error",
      message: "Le formulaire de poids de naissance est invalide.",
    });
    expect(context.birthWeights).toEqual([]);
    expect(context.paths).toEqual([]);
  }
});

test("refuse l’heure sans offset et la note trop longue", async () => {
  for (const mutate of [
    (form: FormData) => form.set("measured_at", "2026-07-19T11:12:00"),
    (form: FormData) => form.set("note", "n".repeat(5_001)),
  ]) {
    const context = harness();
    const form = birthWeightForm();
    mutate(form);
    const state = await recordWhelpingBirthWeightActionCore(
      birthWeightIntention,
      initialWhelpingActionState,
      form,
      context.dependencies,
    );
    expect(state.status).toBe("error");
    expect(context.birthWeights).toEqual([]);
  }
});

test("traduit distinctement les erreurs de complément de poids", async () => {
  const cases: Array<[WhelpingServiceErrorCode, string]> = [
    ["not_found", "introuvable ou inaccessible"],
    ["measured_before_birth", "antérieure"],
    ["birth_weight_already_recorded", "déjà enregistré"],
    ["invalid_birth_relations", "relations"],
    ["conflict", "autre intention"],
    ["forbidden", "droits nécessaires"],
    ["database_error", "pour le moment"],
  ];

  for (const [code, expectedMessage] of cases) {
    const context = harness();
    context.dependencies.recordBirthWeight = async () => ({
      outcome: "error",
      error: { code, message: "SQL secret details" },
    });
    const state = await recordWhelpingBirthWeightActionCore(
      birthWeightIntention,
      initialWhelpingActionState,
      birthWeightForm(),
      context.dependencies,
    );
    expect(state.status).toBe("error");
    expect(state.message).toContain(expectedMessage);
    expect(state.message).not.toContain("SQL secret details");
    expect(context.paths).toEqual([]);
  }
});

test("revalide exactement les routes du poids après succès", async () => {
  const context = harness();
  await recordWhelpingBirthWeightActionCore(
    birthWeightIntention,
    initialWhelpingActionState,
    birthWeightForm(),
    context.dependencies,
  );
  expect(context.paths).toEqual([
    "/litters/journal",
    `/litters/${litterId}`,
    "/animals",
    `/animals/${technicalId}`,
  ]);
});

test("masque une exception technique du complément de poids", async () => {
  const context = harness();
  context.dependencies.recordBirthWeight = async () => {
    throw new Error("SQL connection string");
  };
  const state = await recordWhelpingBirthWeightActionCore(
    birthWeightIntention,
    initialWhelpingActionState,
    birthWeightForm(),
    context.dependencies,
  );
  expect(state.status).toBe("error");
  expect(state.message).not.toContain("SQL");
  expect(context.paths).toEqual([]);
});
