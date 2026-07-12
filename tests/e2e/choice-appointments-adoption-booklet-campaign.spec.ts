import { createHash, randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  runE2eSql,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const traceTitle = "Créneaux proposés et livret d’adoption envoyés";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Fixture = {
  suffix: string;
  litterId: string;
  contactIds: string[];
  animalId: string;
  emailTemplateId: string;
  paymentIds: string[];
  documentIds: string[];
  eventIds: string[];
  campaignTraceIds: string[];
  reservationIds: {
    first: string;
    second: string;
    ineligible: string;
  };
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/connexion=success/);
}

async function cleanupFixture(
  supabase: SupabaseTestClient,
  fixture: Fixture | null,
) {
  if (!fixture) {
    return;
  }

  const reservationIds = Object.values(fixture.reservationIds);

  await hardDeleteFixtureWithSql(fixture, reservationIds);

  await expectFixtureDeleted(supabase, fixture);
}

function sqlUuidArray(ids: string[]) {
  for (const id of ids) {
    if (!uuidPattern.test(id)) {
      throw new Error(`Invalid fixture UUID: ${id}`);
    }
  }

  return `array[${ids.map((id) => `'${id}'::uuid`).join(", ")}]`;
}

async function hardDeleteFixtureWithSql(
  fixture: Fixture,
  reservationIds: string[],
) {
  const eventIds = sqlUuidArray([
    ...fixture.eventIds,
    ...fixture.campaignTraceIds,
  ]);
  const documentIds = sqlUuidArray(fixture.documentIds);
  const paymentIds = sqlUuidArray(fixture.paymentIds);
  const emailTemplateId = sqlUuidArray([fixture.emailTemplateId]);
  const contactIds = sqlUuidArray(fixture.contactIds);
  const reservationIdArray = sqlUuidArray(reservationIds);
  const animalId = sqlUuidArray([fixture.animalId]);
  const litterId = sqlUuidArray([fixture.litterId]);
  const sql = `
with
  del_events as (
    delete from public.events where id = any(${eventIds}) returning id
  ),
  del_documents as (
    delete from public.documents where id = any(${documentIds}) returning id
  ),
  del_payments as (
    delete from public.payments where id = any(${paymentIds}) returning id
  ),
  del_email_templates as (
    delete from public.email_templates where id = any(${emailTemplateId}) returning id
  ),
  del_reservations as (
    delete from public.reservations where id = any(${reservationIdArray}) returning id
  ),
  del_animals as (
    delete from public.animals where id = any(${animalId}) returning id
  ),
  del_contacts as (
    delete from public.contacts where id = any(${contactIds}) returning id
  ),
  del_litters as (
    delete from public.litters where id = any(${litterId}) returning id
  )
select
  (select count(*) from del_events) as events_deleted,
  (select count(*) from del_documents) as documents_deleted,
  (select count(*) from del_payments) as payments_deleted,
  (select count(*) from del_email_templates) as email_templates_deleted,
  (select count(*) from del_reservations) as reservations_deleted,
  (select count(*) from del_animals) as animals_deleted,
  (select count(*) from del_contacts) as contacts_deleted,
  (select count(*) from del_litters) as litters_deleted;
`;

  await runE2eSql(sql);
}

async function expectNoRows(
  supabase: SupabaseTestClient,
  label: string,
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
) {
  const { count, error } = await query;

  if (error) {
    throw new Error(`verify cleanup ${label}: ${error.message}`);
  }

  expect(count).toBe(0);
}

async function expectFixtureDeleted(
  supabase: SupabaseTestClient,
  fixture: Fixture,
) {
  const reservationIds = Object.values(fixture.reservationIds);

  await expectNoRows(
    supabase,
    "events",
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .in("id", [...fixture.eventIds, ...fixture.campaignTraceIds]),
  );
  await expectNoRows(
    supabase,
    "documents",
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .in("id", fixture.documentIds),
  );
  await expectNoRows(
    supabase,
    "payments",
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .in("id", fixture.paymentIds),
  );
  await expectNoRows(
    supabase,
    "email_templates",
    supabase
      .from("email_templates")
      .select("id", { count: "exact", head: true })
      .eq("id", fixture.emailTemplateId),
  );
  await expectNoRows(
    supabase,
    "reservations",
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .in("id", reservationIds),
  );
  await expectNoRows(
    supabase,
    "animals",
    supabase
      .from("animals")
      .select("id", { count: "exact", head: true })
      .eq("id", fixture.animalId),
  );
  await expectNoRows(
    supabase,
    "contacts",
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .in("id", fixture.contactIds),
  );
  await expectNoRows(
    supabase,
    "litters",
    supabase
      .from("litters")
      .select("id", { count: "exact", head: true })
      .eq("id", fixture.litterId),
  );
}

function deterministicChoiceAppointmentsTraceId(reservationId: string) {
  const hash = createHash("sha1")
    .update(`choice_appointment_adoption_booklet:${reservationId}`)
    .digest("hex");
  const chars = hash.slice(0, 32).split("");

  chars[12] = "5";
  chars[16] = ((parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8).toString(16);

  return [
    chars.slice(0, 8).join(""),
    chars.slice(8, 12).join(""),
    chars.slice(12, 16).join(""),
    chars.slice(16, 20).join(""),
    chars.slice(20, 32).join(""),
  ].join("-");
}

async function createFixture(
  supabase: SupabaseTestClient,
): Promise<Fixture> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unable to read authenticated test user");
  }

  const litterId = randomUUID();
  const animalId = randomUUID();
  const emailTemplateId = randomUUID();
  const contactIds = [randomUUID(), randomUUID(), randomUUID()];
  const paymentIds = [randomUUID(), randomUUID(), randomUUID()];
  const documentIds = Array.from({ length: 6 }, () => randomUUID());
  const eventIds = Array.from({ length: 6 }, () => randomUUID());
  const reservationIds = {
    first: randomUUID(),
    second: randomUUID(),
    ineligible: randomUUID(),
  };
  const suffix = litterId.slice(0, 8);
  const fixture: Fixture = {
    suffix,
    litterId,
    contactIds,
    animalId,
    emailTemplateId,
    paymentIds,
    documentIds,
    eventIds,
    campaignTraceIds: [
      deterministicChoiceAppointmentsTraceId(reservationIds.first),
      deterministicChoiceAppointmentsTraceId(reservationIds.second),
    ],
    reservationIds,
  };

  try {
    const { error: templateError } = await supabase.from("email_templates").insert({
      id: emailTemplateId,
      organization_id: organizationId,
      template_key: "choice_appointment_adoption_booklet",
      title: "Confirmation du créneau de choix",
      category: "adopter_journey",
      subject: "Confirmation du créneau de choix - [Portée]",
      body:
        "Bonjour [Prénom],\n\nVotre rendez-vous de choix est prévu le [Date du rendez-vous de choix].\nLe départ est prévu le [Date du rendez-vous de départ].\nAnimal : [Nom du chiot].",
      is_active: true,
      created_by: user.id,
      updated_by: user.id,
    });
    if (templateError) {
      throw new Error(`create email template: ${templateError.message}`);
    }

    const { error: litterError } = await supabase.from("litters").insert({
      id: litterId,
    organization_id: organizationId,
    name: `E2E portée créneaux ${suffix}`,
    species: "dog",
    breed: "Golden Retriever",
    status: "born",
    created_by: user.id,
    updated_by: user.id,
  });
  if (litterError) {
    throw new Error(`create litter: ${litterError.message}`);
  }

  const { error: animalError } = await supabase.from("animals").insert({
    id: animalId,
    organization_id: organizationId,
    litter_id: litterId,
    species: "dog",
    breed: "Golden Retriever",
    sex: "female",
    call_name: `Nala ${suffix}`,
    status: "reserved",
    ownership_status: "produced",
    created_by: user.id,
    updated_by: user.id,
  });
  if (animalError) {
    throw new Error(`create animal: ${animalError.message}`);
  }

  const { error: contactsError } = await supabase.from("contacts").insert([
    {
      id: contactIds[0],
      organization_id: organizationId,
      contact_type: "person",
      first_name: "Alice",
      last_name: `Créneaux ${suffix}`,
      display_name: `Alice Créneaux ${suffix}`,
      email: `choice-booklet-alice-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      id: contactIds[1],
      organization_id: organizationId,
      contact_type: "person",
      first_name: "Bruno",
      last_name: `Créneaux ${suffix}`,
      display_name: `Bruno Créneaux ${suffix}`,
      email: `choice-booklet-bruno-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
    {
      id: contactIds[2],
      organization_id: organizationId,
      contact_type: "person",
      first_name: "Claire",
      last_name: `Créneaux ${suffix}`,
      display_name: `Claire Inéligible ${suffix}`,
      email: `choice-booklet-claire-${suffix}@example.invalid`,
      origin_channel: "manual",
      primary_status: "active",
      created_by: user.id,
      updated_by: user.id,
    },
  ]);
  if (contactsError) {
    throw new Error(`create contacts: ${contactsError.message}`);
  }

  const baseReservation = {
    organization_id: organizationId,
    litter_id: litterId,
    species: "dog",
    breed: "Golden Retriever",
    reserved_sex_preference: "no_preference",
    status: "active",
    price_cents: 180000,
    currency: "EUR",
    created_by: user.id,
    updated_by: user.id,
  };
  const { error: reservationsError } = await supabase.from("reservations").insert([
    {
      ...baseReservation,
      id: reservationIds.first,
      contact_id: contactIds[0],
      animal_id: animalId,
      animal_assigned_at: "2026-07-01T10:00:00.000Z",
    },
    {
      ...baseReservation,
      id: reservationIds.second,
      contact_id: contactIds[1],
    },
    {
      ...baseReservation,
      id: reservationIds.ineligible,
      contact_id: contactIds[2],
    },
  ]);
  if (reservationsError) {
    throw new Error(`create reservations: ${reservationsError.message}`);
  }

  const paidAt = "2026-07-02T10:00:00.000Z";
  const { error: paymentsError } = await supabase.from("payments").insert(
    Object.values(reservationIds).map((reservationId, index) => ({
      id: paymentIds[index],
      organization_id: organizationId,
      contact_id: contactIds[index],
      reservation_id: reservationId,
      amount_cents: 50000,
      currency: "EUR",
      payment_type: "arrhes",
      status: "paid",
      payment_method: "bank_transfer",
      requested_at: paidAt,
      paid_at: paidAt,
      notes: `E2E arrhes complètes ${suffix}`,
      created_by: user.id,
      updated_by: user.id,
    })),
  );
  if (paymentsError) {
    throw new Error(`create payments: ${paymentsError.message}`);
  }

  const documents = Object.values(reservationIds).flatMap(
    (reservationId, index) => {
      const isIneligible = reservationId === reservationIds.ineligible;
      const status = isIneligible ? "received" : "signed";
      const signedAt = isIneligible ? null : "2026-07-03T09:00:00.000Z";
      const contractSignedAt = isIneligible ? null : "2026-07-03T09:05:00.000Z";
      const documentIndex = index * 2;

      return [
        {
          id: documentIds[documentIndex],
          organization_id: organizationId,
          contact_id: contactIds[index],
          reservation_id: reservationId,
          litter_id: litterId,
          title: `E2E CEC ${suffix}`,
          document_type: "commitment_certificate",
          status,
          signature_required: true,
          signed_at: signedAt,
          received_at: "2026-07-03T09:00:00.000Z",
          created_by: user.id,
          updated_by: user.id,
        },
        {
          id: documentIds[documentIndex + 1],
          organization_id: organizationId,
          contact_id: contactIds[index],
          reservation_id: reservationId,
          litter_id: litterId,
          title: `E2E contrat ${suffix}`,
          document_type: "reservation_contract",
          status,
          signature_required: true,
          signed_at: contractSignedAt,
          received_at: "2026-07-03T09:05:00.000Z",
          created_by: user.id,
          updated_by: user.id,
        },
      ];
    },
  );
  const { error: documentsError } = await supabase
    .from("documents")
    .insert(documents);
  if (documentsError) {
    throw new Error(`create documents: ${documentsError.message}`);
  }

  const appointments = [
    {
      reservationId: reservationIds.first,
      contactId: contactIds[0],
      choiceAt: "2026-08-11T08:30:00.000Z",
      adoptionAt: "2026-09-05T12:00:00.000Z",
    },
    {
      reservationId: reservationIds.second,
      contactId: contactIds[1],
      choiceAt: "2026-08-12T13:15:00.000Z",
      adoptionAt: "2026-09-06T09:45:00.000Z",
    },
    {
      reservationId: reservationIds.ineligible,
      contactId: contactIds[2],
      choiceAt: "2026-08-13T08:00:00.000Z",
      adoptionAt: "2026-09-07T08:00:00.000Z",
    },
  ];
  const { error: eventsError } = await supabase.from("events").insert(
    appointments.flatMap((appointment, index) => {
      const eventIndex = index * 2;

      return [
        {
          id: eventIds[eventIndex],
          organization_id: organizationId,
          contact_id: appointment.contactId,
          reservation_id: appointment.reservationId,
          litter_id: litterId,
          event_type: "puppy_choice",
          title: `E2E choix ${suffix}`,
          planned_at: appointment.choiceAt,
          status: "planned",
          priority: "normal",
          is_task: true,
          created_by: user.id,
          updated_by: user.id,
        },
        {
          id: eventIds[eventIndex + 1],
          organization_id: organizationId,
          contact_id: appointment.contactId,
          reservation_id: appointment.reservationId,
          litter_id: litterId,
          event_type: "adoption",
          title: `E2E adoption ${suffix}`,
          planned_at: appointment.adoptionAt,
          status: "planned",
          priority: "normal",
          is_task: true,
          created_by: user.id,
          updated_by: user.id,
        },
      ];
    }),
  );
  if (eventsError) {
    throw new Error(`create appointments: ${eventsError.message}`);
  }

    return fixture;
  } catch (error) {
    await cleanupFixture(supabase, fixture);
    throw error;
  }
}

test("choice appointments + adoption booklet campaign personalizes and traces without side effects", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  let fixture: Fixture | null = null;

  try {
    fixture = await createFixture(supabase);
    const reservationIds = Object.values(fixture.reservationIds);
    const beforeReservations = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status")
        .in("id", reservationIds),
      "read reservations before campaign",
    );
    const beforePayments = expectSupabaseData(
      await supabase
        .from("payments")
        .select("reservation_id, amount_cents, status, payment_type")
        .in("reservation_id", reservationIds)
        .is("deleted_at", null),
      "read payments before campaign",
    );

    await login(page);
    await page.goto(`/litters/${fixture.litterId}`);
    await page.getByText("Campagnes d’e-mails").click();

    await expect(page.getByText("Demande de pré-réservation", { exact: true })).toBeVisible();
    await expect(page.getByText("Contrat + certificat", { exact: true })).toBeVisible();
    await expect(page.getByText("Créneaux de choix + livret d’adoption", { exact: true })).toBeVisible();
    await expect(page.getByText("Solde avant départ", { exact: true })).toBeVisible();
    await expect(page.locator("select[id$='template']")).toHaveCount(0);
    await expect(
      page
        .getByTestId("choice-appointments-template-summary")
        .getByRole("button", { name: /copier/i }),
    ).toHaveCount(0);

    await expect(
      page.locator(`input[name="reservation_ids[]"][value="${fixture.reservationIds.first}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`input[name="reservation_ids[]"][value="${fixture.reservationIds.second}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`input[name="reservation_ids[]"][value="${fixture.reservationIds.ineligible}"]`),
    ).toHaveCount(0);

    await expect(
      page.getByText(`Confirmation du créneau de choix - E2E portée créneaux ${fixture.suffix}`),
    ).toBeVisible();
    const previewTextarea = page.getByLabel("Prévisualisation personnalisée de l’e-mail");
    const firstBody = await previewTextarea.inputValue();
    expect(firstBody).toContain("Bonjour Alice,");
    expect(firstBody).toContain("mardi 11 août 2026 à 10:30");
    expect(firstBody).toContain("samedi 5 septembre 2026 à 14:00");
    expect(firstBody).toContain(`Nala ${fixture.suffix}`);

    await page
      .getByRole("button", { name: "Prévisualiser / Copier l’e-mail" })
      .click();
    const secondBody = await previewTextarea.inputValue();
    expect(secondBody).toContain("Bonjour Bruno,");
    expect(secondBody).toContain("mercredi 12 août 2026 à 15:15");
    expect(secondBody).toContain("dimanche 6 septembre 2026 à 11:45");
    expect(secondBody).toContain("votre futur animal");
    expect(secondBody).not.toBe(firstBody);

    await page
      .getByRole("button", {
        name: "Confirmer l’envoi des créneaux proposés et du livret",
      })
      .click();
    await expect(page).toHaveURL(/choice_appointments_campaign_status=success/, {
      timeout: 15_000,
    });
    await expect(page.getByText("Aucun e-mail réel n’a été envoyé")).toBeVisible();

    const traces = expectSupabaseData(
      await supabase
        .from("events")
        .select("reservation_id, event_type, title, description, status, is_task, actual_at, contact_id, litter_id")
        .in("reservation_id", [fixture.reservationIds.first, fixture.reservationIds.second])
        .eq("title", traceTitle)
        .is("deleted_at", null),
      "read campaign traces",
    );
    expect(traces).toHaveLength(2);
    for (const trace of traces) {
      expect(trace.event_type).toBe("other");
      expect(trace.status).toBe("done");
      expect(trace.is_task).toBe(false);
      expect(trace.actual_at).toBeTruthy();
      expect(trace.litter_id).toBe(fixture.litterId);
      expect(trace.description).toContain("choice_appointment_adoption_booklet");
      expect(trace.description).toContain("Créneau de choix ISO : 2026-08-");
      expect(trace.description).toContain("Créneau de départ ISO : 2026-09-");
      expect(trace.description).toContain("Créneau de choix proposé");
      expect(trace.description).toContain("Créneau de départ proposé");
    }

    await page.goto(`/reservations/${fixture.reservationIds.first}`);
    await expect(page.getByText("Créneaux RV proposés")).toBeVisible();
    await expect(
      page.getByText("Les créneaux proposés et le livret d’adoption ont été envoyés."),
    ).toBeVisible();
    await expect(page.getByText("Confirmation partielle ou à vérifier.")).toBeVisible();

    await page.goto(`/litters/${fixture.litterId}`);
    await page.getByText("Campagnes d’e-mails").click();
    await expect(
      page.getByRole("button", {
        name: "Confirmer l’envoi des créneaux proposés et du livret",
      }),
    ).toBeDisabled();

    const afterTraces = expectSupabaseData(
      await supabase
        .from("events")
        .select("id")
        .in("reservation_id", [fixture.reservationIds.first, fixture.reservationIds.second])
        .eq("title", traceTitle)
        .is("deleted_at", null),
      "read traces after reload",
    );
    expect(afterTraces).toHaveLength(2);

    const originalFirstTrace = traces.find(
      (trace) => trace.reservation_id === fixture.reservationIds.first,
    );
    expect(originalFirstTrace?.actual_at).toBeTruthy();

    const { error: updateAppointmentError } = await supabase
      .from("events")
      .update({
        planned_at: "2026-08-14T07:45:00.000Z",
        updated_at: new Date().toISOString(),
      })
      .eq("reservation_id", fixture.reservationIds.first)
      .eq("event_type", "puppy_choice")
      .is("deleted_at", null);
    if (updateAppointmentError) {
      throw new Error(`update choice appointment: ${updateAppointmentError.message}`);
    }

    await page.goto(`/reservations/${fixture.reservationIds.first}`);
    await expect(
      page.getByText(
        "Les créneaux ont été modifiés depuis le dernier envoi. Un nouvel envoi doit être confirmé.",
      ),
    ).toBeVisible();
    await expect(page.getByText("Confirmation partielle ou à vérifier.")).toBeVisible();

    await page.goto(`/litters/${fixture.litterId}`);
    await page.getByText("Campagnes d’e-mails").click();
    await expect(
      page.locator(`input[name="reservation_ids[]"][value="${fixture.reservationIds.first}"]`),
    ).toBeVisible();
    await expect(
      page.locator(`input[name="reservation_ids[]"][value="${fixture.reservationIds.second}"]`),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Les créneaux ont été modifiés depuis le dernier envoi. Un nouvel envoi doit être confirmé.",
      ),
    ).toBeVisible();

    const updatedPreviewBody = await previewTextarea.inputValue();
    expect(updatedPreviewBody).toContain("vendredi 14 août 2026 à 09:45");
    await page
      .getByRole("button", {
        name: "Confirmer l’envoi des créneaux proposés et du livret",
      })
      .click();
    await expect(page).toHaveURL(/choice_appointments_campaign_status=success/, {
      timeout: 15_000,
    });

    const updatedFirstTraces = expectSupabaseData(
      await supabase
        .from("events")
        .select("id, reservation_id, description, actual_at")
        .eq("reservation_id", fixture.reservationIds.first)
        .eq("title", traceTitle)
        .is("deleted_at", null),
      "read updated first trace",
    );
    expect(updatedFirstTraces).toHaveLength(1);
    expect(updatedFirstTraces[0].description).toContain(
      "Créneau de choix ISO : 2026-08-14T07:45:00+00:00",
    );
    expect(updatedFirstTraces[0].description).toContain(
      "vendredi 14 août 2026 à 09:45",
    );
    expect(updatedFirstTraces[0].actual_at).not.toBe(originalFirstTrace?.actual_at);

    const afterReservations = expectSupabaseData(
      await supabase
        .from("reservations")
        .select("id, status")
        .in("id", reservationIds),
      "read reservations after campaign",
    );
    expect(afterReservations).toEqual(expect.arrayContaining(beforeReservations));

    const afterPayments = expectSupabaseData(
      await supabase
        .from("payments")
        .select("reservation_id, amount_cents, status, payment_type")
        .in("reservation_id", reservationIds)
        .is("deleted_at", null),
      "read payments after campaign",
    );
    expect(afterPayments).toEqual(expect.arrayContaining(beforePayments));
  } finally {
    await cleanupFixture(supabase, fixture);
  }
});
