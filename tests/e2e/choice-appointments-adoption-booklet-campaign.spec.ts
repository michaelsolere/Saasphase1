import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const traceTitle = "Créneaux proposés et livret d’adoption envoyés";

type Fixture = {
  suffix: string;
  litterId: string;
  contactIds: string[];
  animalId: string;
  reservationIds: {
    first: string;
    second: string;
    ineligible: string;
  };
};

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
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
  const now = new Date().toISOString();

  const { error: eventsError } = await supabase
    .from("events")
    .update({ deleted_at: now })
    .in("reservation_id", reservationIds)
    .is("deleted_at", null);
  if (eventsError) {
    throw new Error(`cleanup events: ${eventsError.message}`);
  }

  const { error: documentsError } = await supabase
    .from("documents")
    .update({ deleted_at: now })
    .in("reservation_id", reservationIds)
    .is("deleted_at", null);
  if (documentsError) {
    throw new Error(`cleanup documents: ${documentsError.message}`);
  }

  const { error: paymentsError } = await supabase
    .from("payments")
    .update({ deleted_at: now })
    .in("reservation_id", reservationIds)
    .is("deleted_at", null);
  if (paymentsError) {
    throw new Error(`cleanup payments: ${paymentsError.message}`);
  }

  const { error: reservationsError } = await supabase
    .from("reservations")
    .update({ deleted_at: now })
    .in("id", reservationIds)
    .is("deleted_at", null);
  if (reservationsError) {
    throw new Error(`cleanup reservations: ${reservationsError.message}`);
  }

  const { error: animalError } = await supabase
    .from("animals")
    .update({ deleted_at: now })
    .eq("id", fixture.animalId)
    .is("deleted_at", null);
  if (animalError) {
    throw new Error(`cleanup animal: ${animalError.message}`);
  }

  const { error: contactsError } = await supabase
    .from("contacts")
    .update({ deleted_at: now })
    .in("id", fixture.contactIds)
    .is("deleted_at", null);
  if (contactsError) {
    throw new Error(`cleanup contacts: ${contactsError.message}`);
  }

  const { error: litterError } = await supabase
    .from("litters")
    .update({ deleted_at: now })
    .eq("id", fixture.litterId)
    .is("deleted_at", null);
  if (litterError) {
    throw new Error(`cleanup litter: ${litterError.message}`);
  }
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
  const contactIds = [randomUUID(), randomUUID(), randomUUID()];
  const reservationIds = {
    first: randomUUID(),
    second: randomUUID(),
    ineligible: randomUUID(),
  };
  const suffix = litterId.slice(0, 8);

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
    display_name: `Nala ${suffix}`,
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

  const signedDocuments = Object.values(reservationIds).flatMap(
    (reservationId, index) => {
      if (reservationId === reservationIds.ineligible) {
        return [];
      }

      return [
        {
          organization_id: organizationId,
          contact_id: contactIds[index],
          reservation_id: reservationId,
          litter_id: litterId,
          title: `E2E CEC ${suffix}`,
          document_type: "commitment_certificate",
          status: "signed",
          signature_required: true,
          signed_at: "2026-07-03T09:00:00.000Z",
          received_at: "2026-07-03T09:00:00.000Z",
          created_by: user.id,
          updated_by: user.id,
        },
        {
          organization_id: organizationId,
          contact_id: contactIds[index],
          reservation_id: reservationId,
          litter_id: litterId,
          title: `E2E contrat ${suffix}`,
          document_type: "reservation_contract",
          status: "signed",
          signature_required: true,
          signed_at: "2026-07-03T09:05:00.000Z",
          received_at: "2026-07-03T09:05:00.000Z",
          created_by: user.id,
          updated_by: user.id,
        },
      ];
    },
  );
  const { error: documentsError } = await supabase
    .from("documents")
    .insert(signedDocuments);
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
    appointments.flatMap((appointment) => [
      {
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
    ]),
  );
  if (eventsError) {
    throw new Error(`create appointments: ${eventsError.message}`);
  }

  return {
    suffix,
    litterId,
    contactIds,
    animalId,
    reservationIds,
  };
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

    await expect(page.getByText("Pré-réservation", { exact: true })).toBeVisible();
    await expect(page.getByText("Contrat + certificat", { exact: true })).toBeVisible();
    await expect(page.getByText("Créneaux de choix + livret d’adoption", { exact: true })).toBeVisible();
    await expect(page.getByText("Solde avant départ", { exact: true })).toBeVisible();
    await expect(page.locator("select[id$='template']")).toHaveCount(0);

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
      .dblclick({ force: true });
    await expect(page).toHaveURL(/choice_appointments_campaign_status=success/);
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
