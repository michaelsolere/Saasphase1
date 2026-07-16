import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  sendMatingConfirmationEmailForApplication,
  type MatingConfirmationEmailTransport,
} from "../../src/features/communications/mating-confirmation-email-core";
import {
  runMatingConfirmationCampaignForApplications,
} from "../../src/features/litters/mating-confirmation-campaign";
import {
  canConfirmMatingConfirmationCampaign,
} from "../../src/features/litters/mating-confirmation-campaign-confirm-dialog";
import {
  getBrevoTransactionalTemplateConfig,
} from "../../src/features/settings/brevo-template-registry";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  expectSupabaseData,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const brevoTemplateId = 654321;

const fixture = {
  groupId: "96000000-0000-4000-8000-000000000001",
  litterId: "96000000-0000-4000-8000-000000000002",
  templateId: "96000000-0000-4000-8000-000000000003",
  contactWithEmailId: "96000000-0000-4000-8000-000000000011",
  contactWithoutEmailId: "96000000-0000-4000-8000-000000000012",
  applicationWithEmailId: "96000000-0000-4000-8000-000000000021",
  applicationWithoutEmailId: "96000000-0000-4000-8000-000000000022",
};

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSql(sql: string) {
  return runE2eSqlSync(sql);
}

function buildIdempotencyKey({
  applicationId = fixture.applicationWithEmailId,
} = {}) {
  const logicalParts = [
    ["organization", organizationId],
    ["campaign", "mating_confirmation"],
    ["dossier", applicationId],
    ["version", "v1"],
  ];
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(logicalParts))
    .digest("hex")
    .slice(0, 40);

  return `mating_confirmation:${fingerprint}`;
}

const successIdempotencyKey = buildIdempotencyKey();
const missingEmailIdempotencyKey = buildIdempotencyKey({
  applicationId: fixture.applicationWithoutEmailId,
});

function cleanupFixture() {
  runSql(`
    delete from public.email_delivery_attempts
    where organization_id = ${sqlQuote(organizationId)}::uuid
      and (
        litter_id = ${sqlQuote(fixture.litterId)}::uuid
        or idempotency_key in (
          ${sqlQuote(successIdempotencyKey)},
          ${sqlQuote(missingEmailIdempotencyKey)}
        )
      );

    delete from public.email_templates
    where id = ${sqlQuote(fixture.templateId)}::uuid
      and organization_id = ${sqlQuote(organizationId)}::uuid;

    delete from public.applications
    where id in (
      ${sqlQuote(fixture.applicationWithEmailId)}::uuid,
      ${sqlQuote(fixture.applicationWithoutEmailId)}::uuid
    );

    delete from public.contacts
    where id in (
      ${sqlQuote(fixture.contactWithEmailId)}::uuid,
      ${sqlQuote(fixture.contactWithoutEmailId)}::uuid
    );

    delete from public.litters
    where id = ${sqlQuote(fixture.litterId)}::uuid;

    delete from public.litter_groups
    where id = ${sqlQuote(fixture.groupId)}::uuid;
  `);
}

function countRemainingFixtures() {
  return Number(
    runSql(`
      select count(*)
      from (
        select id::text from public.email_delivery_attempts
        where organization_id = ${sqlQuote(organizationId)}::uuid
          and (
            litter_id = ${sqlQuote(fixture.litterId)}::uuid
            or idempotency_key in (
              ${sqlQuote(successIdempotencyKey)},
              ${sqlQuote(missingEmailIdempotencyKey)}
            )
          )
        union all
        select id::text from public.email_templates
        where id = ${sqlQuote(fixture.templateId)}::uuid
        union all
        select id::text from public.applications
        where id in (
          ${sqlQuote(fixture.applicationWithEmailId)}::uuid,
          ${sqlQuote(fixture.applicationWithoutEmailId)}::uuid
        )
        union all
        select id::text from public.contacts
        where id in (
          ${sqlQuote(fixture.contactWithEmailId)}::uuid,
          ${sqlQuote(fixture.contactWithoutEmailId)}::uuid
        )
        union all
        select id::text from public.litters
        where id = ${sqlQuote(fixture.litterId)}::uuid
        union all
        select id::text from public.litter_groups
        where id = ${sqlQuote(fixture.groupId)}::uuid
      ) remaining;
    `),
  );
}

function countFixtureBusinessMutations() {
  const output = runSql(`
    with fixture_reservations as (
      select id from public.reservations
      where application_id in (
        ${sqlQuote(fixture.applicationWithEmailId)}::uuid,
        ${sqlQuote(fixture.applicationWithoutEmailId)}::uuid
      )
      or litter_id = ${sqlQuote(fixture.litterId)}::uuid
    )
    select
      (select count(*) from fixture_reservations)::text || '|' ||
      (select count(*) from public.payments
       where reservation_id in (select id from fixture_reservations))::text || '|' ||
      (select count(*) from public.documents
       where application_id in (
         ${sqlQuote(fixture.applicationWithEmailId)}::uuid,
         ${sqlQuote(fixture.applicationWithoutEmailId)}::uuid
       ))::text;
  `);
  const [reservations = "0", payments = "0", documents = "0"] =
    output.split("|");

  return {
    reservations: Number(reservations),
    payments: Number(payments),
    documents: Number(documents),
  };
}

function createFixture({ includeTemplate = true } = {}) {
  cleanupFixture();

  runSql(`
    insert into public.litter_groups (
      id, organization_id, name, species, status, created_by, updated_by
    )
    values (
      ${sqlQuote(fixture.groupId)}::uuid,
      ${sqlQuote(organizationId)}::uuid,
      'E2E confirmation saillie groupe',
      'dog',
      'open_for_applications',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );

    insert into public.litters (
      id, organization_id, litter_group_id, name, species, breed, status,
      mating_date, mating_date_2, created_by, updated_by
    )
    values (
      ${sqlQuote(fixture.litterId)}::uuid,
      ${sqlQuote(organizationId)}::uuid,
      ${sqlQuote(fixture.groupId)}::uuid,
      'E2E confirmation saillie portée',
      'dog',
      'Golden Retriever',
      'mating_done',
      '2026-07-01',
      '2026-07-03',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );

    insert into public.contacts (
      id, organization_id, contact_type, first_name, last_name, display_name,
      email, origin_channel, primary_status, created_by, updated_by
    )
    values
      (
        ${sqlQuote(fixture.contactWithEmailId)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'person',
        'Alice',
        'Saillie',
        'Alice Saillie',
        'alice.saillie@example.invalid',
        'manual',
        'active',
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      ),
      (
        ${sqlQuote(fixture.contactWithoutEmailId)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'person',
        'Bruno',
        'SansEmail',
        'Bruno SansEmail',
        null,
        'manual',
        'active',
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      );

    insert into public.applications (
      id, organization_id, contact_id, species, breed, desired_litter_id,
      desired_litter_group_id, desired_sex_preference, desired_quantity,
      project_description, status, reviewed_at, reviewed_by, active_rank,
      initial_rank, created_by, updated_by
    )
    values
      (
        ${sqlQuote(fixture.applicationWithEmailId)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        ${sqlQuote(fixture.contactWithEmailId)}::uuid,
        'dog',
        'Golden Retriever',
        ${sqlQuote(fixture.litterId)}::uuid,
        ${sqlQuote(fixture.groupId)}::uuid,
        'no_preference',
        1,
        'Fixture confirmation saillie.',
        'qualified',
        '2026-07-12 08:00:00+00',
        ${sqlQuote(ownerId)}::uuid,
        1,
        1,
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      ),
      (
        ${sqlQuote(fixture.applicationWithoutEmailId)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        ${sqlQuote(fixture.contactWithoutEmailId)}::uuid,
        'dog',
        'Golden Retriever',
        ${sqlQuote(fixture.litterId)}::uuid,
        ${sqlQuote(fixture.groupId)}::uuid,
        'female_preferred_male_possible',
        1,
        'Fixture confirmation saillie sans email.',
        'qualified',
        '2026-07-12 08:00:00+00',
        ${sqlQuote(ownerId)}::uuid,
        2,
        2,
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      );
  `);

  if (includeTemplate) {
    runSql(`
      insert into public.email_templates (
        id, organization_id, template_key, title, category, subject, body,
        is_active, brevo_template_id, created_by, updated_by
      )
      values (
        ${sqlQuote(fixture.templateId)}::uuid,
        ${sqlQuote(organizationId)}::uuid,
        'mating_confirmation',
        'Confirmation de saillie',
        'candidate_journey',
        'Registre technique Brevo - mating_confirmation',
        'Registre technique Brevo - mating_confirmation',
        true,
        ${brevoTemplateId},
        ${sqlQuote(ownerId)}::uuid,
        ${sqlQuote(ownerId)}::uuid
      );
    `);
  }
}

function createInjectedTransport() {
  const getTemplateCalls: number[] = [];
  const sendEmailCalls: unknown[] = [];
  let sendCount = 0;
  const transport: MatingConfirmationEmailTransport = {
    isConfigured: () => true,
    getTemplate: async (requestedTemplateId) => {
      getTemplateCalls.push(requestedTemplateId);
      return {
        ok: true,
        template: {
          id: requestedTemplateId,
          name: "Confirmation de saillie transactionnelle QA",
          subject: "Sujet Brevo confirmation saillie",
          isActive: true,
          modifiedAt: "2026-07-12T10:00:00.000Z",
          sender: { email: "elevage@example.invalid", name: "Élevage QA" },
          replyTo: { email: "reply@example.invalid" },
        },
      };
    },
    sendEmail: async (input) => {
      sendCount += 1;
      sendEmailCalls.push(input);
      return { ok: true, messageId: `qa-mating-message-${sendCount}` };
    },
  };

  return { transport, getTemplateCalls, sendEmailCalls };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

test("litter campaign UI shows mating confirmation immediately before pre-reservation", async ({
  page,
}) => {
  createFixture();

  try {
    await login(page);
    await page.goto(`/litters/${fixture.litterId}`);
    await page.getByText("Campagnes d’e-mails").click();

    const campaignSection = page.locator("#campagnes-emails");
    await expect(
      campaignSection.getByText("Confirmation de saillie", { exact: true }),
    ).toBeVisible();
    await expect(
      campaignSection.getByText("Demande de pré-réservation"),
    ).toBeVisible();

    const preReservationAppearsAfterMating = await campaignSection.evaluate(
      (section) => {
        const text = section.textContent ?? "";
        return (
          text.indexOf("Confirmation de saillie") <
          text.indexOf("Demande de pré-réservation")
        );
      },
    );

    expect(preReservationAppearsAfterMating).toBe(true);
    await expect(
      campaignSection.getByText("Exclu · e-mail manquant ou invalide"),
    ).toBeVisible();
  } finally {
    cleanupFixture();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("campaign reports success, partial, and error honestly", async () => {
  const success = await runMatingConfirmationCampaignForApplications({
    applications: [{ id: "success", contact_id: "contact-success" }],
    sendEmail: async () => ({ status: "success", deliveryState: "sent" }),
  });
  expect(success.status).toBe("success");

  const partial = await runMatingConfirmationCampaignForApplications({
    applications: [
      { id: "sent", contact_id: "contact-sent" },
      { id: "missing", contact_id: "contact-missing" },
    ],
    sendEmail: async ({ applicationId }) =>
      applicationId === "sent"
        ? { status: "already_sent", deliveryState: "sent" }
        : { status: "missing_email", deliveryState: "not_sent" },
  });
  expect(partial.status).toBe("partial");
  expect(partial.emailsAlreadySentCount).toBe(1);
  expect(partial.emailsMissingCount).toBe(1);

  const error = await runMatingConfirmationCampaignForApplications({
    applications: [{ id: "failed", contact_id: "contact-failed" }],
    sendEmail: async () => ({
      status: "missing_template",
      deliveryState: "not_sent",
    }),
  });
  expect(error.status).toBe("error");
});

test("confirmation guards and Brevo registry use the candidate journey", () => {
  expect(
    canConfirmMatingConfirmationCampaign({
      hasSelectedValidCandidate: true,
      brevoTemplateId,
      isBrevoConfigured: false,
    }),
  ).toBe(false);
  expect(
    getBrevoTransactionalTemplateConfig("pre_reservation")?.category,
  ).toBe("candidate_journey");
});

test("confirmation button is disabled without a mating Brevo template id", async ({
  page,
}) => {
  createFixture({ includeTemplate: false });

  try {
    await login(page);
    await page.goto(`/litters/${fixture.litterId}`);
    await page.getByText("Campagnes d’e-mails").click();
    await page
      .getByRole("button", { name: "Envoyer via Brevo", exact: true })
      .click();

    const dialog = page.getByRole("dialog", {
      name: "Confirmer l’envoi Brevo de confirmation de saillie",
    });
    await expect(
      dialog.getByRole("button", { name: "Confirmer et envoyer" }),
    ).toBeDisabled();
    await expect(
      dialog.getByText(/Ouvrez les paramètres Brevo/),
    ).toBeVisible();
  } finally {
    cleanupFixture();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("mating confirmation sends once, snapshots variables, and creates no business records", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  createFixture();
  const { transport, getTemplateCalls, sendEmailCalls } = createInjectedTransport();

  try {
    expect(countFixtureBusinessMutations()).toEqual({
      reservations: 0,
      payments: 0,
      documents: 0,
    });

    const firstResult = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithEmailId,
        litterId: fixture.litterId,
      },
      { supabase, transport },
    );

    expect(firstResult.status).toBe("success");
    expect(getTemplateCalls).toEqual([brevoTemplateId]);
    expect(sendEmailCalls).toHaveLength(1);
    expect(sendEmailCalls[0]).toMatchObject({
      templateId: brevoTemplateId,
      to: { email: "alice.saillie@example.invalid", name: "Alice Saillie" },
      params: {
        prenom: "Alice",
        nom: "Saillie",
        nom_complet: "Alice Saillie",
        portee: "E2E confirmation saillie portée",
        groupe_portees: "E2E confirmation saillie groupe",
        date_saillie: "1 juillet 2026",
        date_saillie_2: "3 juillet 2026",
        nom_elevage: "du Val de Démo",
      },
      tags: ["saas_elevage", "mating_confirmation"],
    });
    expect(sendEmailCalls[0]).not.toHaveProperty("attachments");

    const secondResult = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithEmailId,
        litterId: fixture.litterId,
      },
      { supabase, transport },
    );

    expect(secondResult.status).toBe("already_sent");
    expect(getTemplateCalls).toHaveLength(1);
    expect(sendEmailCalls).toHaveLength(1);

    const attempt = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("status, attempt_count, idempotency_key, subject_snapshot, variables_snapshot, brevo_template_id")
        .eq("organization_id", organizationId)
        .eq("idempotency_key", successIdempotencyKey)
        .single(),
      "read mating confirmation attempt",
    );

    expect(attempt).toMatchObject({
      status: "sent",
      attempt_count: 1,
      idempotency_key: successIdempotencyKey,
      subject_snapshot: "Sujet Brevo confirmation saillie",
      brevo_template_id: brevoTemplateId,
    });
    expect(attempt.variables_snapshot).toMatchObject({
      application_id: fixture.applicationWithEmailId,
      prenom: "Alice",
      date_saillie: "1 juillet 2026",
    });
    expect(countFixtureBusinessMutations()).toEqual({
      reservations: 0,
      payments: 0,
      documents: 0,
    });
  } finally {
    cleanupFixture();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("two parallel mating confirmation launches have a single send owner", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  createFixture();
  const { transport, sendEmailCalls } = createInjectedTransport();
  const delayedTransport: MatingConfirmationEmailTransport = {
    ...transport,
    sendEmail: async (input) => {
      await new Promise((resolve) => setTimeout(resolve, 75));
      return transport.sendEmail(input);
    },
  };

  try {
    const launch = () =>
      sendMatingConfirmationEmailForApplication(
        {
          applicationId: fixture.applicationWithEmailId,
          litterId: fixture.litterId,
        },
        { supabase, transport: delayedTransport },
      );
    const results = await Promise.all([launch(), launch()]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "in_progress",
      "success",
    ]);
    expect(sendEmailCalls).toHaveLength(1);
  } finally {
    cleanupFixture();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("an attempt already sending remains in progress", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  createFixture();
  const { transport, sendEmailCalls } = createInjectedTransport();

  try {
    runSql(`
      insert into public.email_delivery_attempts (
        organization_id, contact_id, litter_id, litter_group_id,
        email_template_id, message_type, recipient_email, recipient_name,
        variables_snapshot, idempotency_key, status, attempt_count,
        last_attempt_at, created_by, updated_by
      ) values (
        ${sqlQuote(organizationId)}::uuid,
        ${sqlQuote(fixture.contactWithEmailId)}::uuid,
        ${sqlQuote(fixture.litterId)}::uuid,
        ${sqlQuote(fixture.groupId)}::uuid,
        ${sqlQuote(fixture.templateId)}::uuid,
        'mating_confirmation', 'alice.saillie@example.invalid', 'Alice Saillie',
        '{}'::jsonb, ${sqlQuote(successIdempotencyKey)}, 'sending', 1,
        now(), ${sqlQuote(ownerId)}::uuid, ${sqlQuote(ownerId)}::uuid
      );
    `);

    const result = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithEmailId,
        litterId: fixture.litterId,
      },
      { supabase, transport },
    );

    expect(result.status).toBe("in_progress");
    expect(sendEmailCalls).toHaveLength(0);
  } finally {
    cleanupFixture();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("Brevo configuration and certain provider failures are distinguished", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  createFixture();
  const { transport } = createInjectedTransport();

  try {
    const notConfigured = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithEmailId,
        litterId: fixture.litterId,
      },
      { supabase, transport: { ...transport, isConfigured: () => false } },
    );
    expect(notConfigured.status).toBe("brevo_not_configured");

    const certainFailure = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithEmailId,
        litterId: fixture.litterId,
      },
      {
        supabase,
        transport: {
          ...transport,
          sendEmail: async () => ({ ok: false, reason: "unauthorized" }),
        },
      },
    );
    expect(certainFailure).toMatchObject({
      status: "failed",
      deliveryState: "not_sent",
      errorCode: "unauthorized",
    });

    const attemptStatus = runSql(`
      select status from public.email_delivery_attempts
      where idempotency_key = ${sqlQuote(successIdempotencyKey)};
    `);
    expect(attemptStatus).toBe("failed");
  } finally {
    cleanupFixture();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("ambiguous provider results remain uncertain and cannot be reclaimed", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  createFixture();
  const { transport, sendEmailCalls } = createInjectedTransport();
  const uncertainTransport: MatingConfirmationEmailTransport = {
    ...transport,
    sendEmail: async (input) => {
      sendEmailCalls.push(input);
      return { ok: false, reason: "timeout" };
    },
  };

  try {
    const first = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithEmailId,
        litterId: fixture.litterId,
      },
      { supabase, transport: uncertainTransport },
    );
    expect(first).toMatchObject({
      status: "failed",
      deliveryState: "uncertain",
      errorCode: "timeout",
    });

    const second = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithEmailId,
        litterId: fixture.litterId,
      },
      { supabase, transport: uncertainTransport },
    );
    expect(second.status).toBe("in_progress");
    expect(sendEmailCalls).toHaveLength(1);
    expect(
      runSql(`
        select status from public.email_delivery_attempts
        where idempotency_key = ${sqlQuote(successIdempotencyKey)};
      `),
    ).toBe("sending");
  } finally {
    cleanupFixture();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("a persistence failure after a possible send is uncertain", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  createFixture();
  const { transport, sendEmailCalls } = createInjectedTransport();

  try {
    const result = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithEmailId,
        litterId: fixture.litterId,
      },
      {
        supabase,
        transport,
        transitions: {
          markSent: async () => ({
            outcome: "error",
            error: { code: "database_error", message: "Injected failure." },
          }),
        },
      },
    );

    expect(result).toMatchObject({
      status: "failed",
      deliveryState: "uncertain",
      errorCode: "database_error",
    });
    expect(sendEmailCalls).toHaveLength(1);
    expect(
      runSql(`
        select status from public.email_delivery_attempts
        where idempotency_key = ${sqlQuote(successIdempotencyKey)};
      `),
    ).toBe("sending");
  } finally {
    cleanupFixture();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("mating confirmation skips contacts without email and missing Brevo template", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  createFixture({ includeTemplate: false });
  const { transport, getTemplateCalls, sendEmailCalls } = createInjectedTransport();

  try {
    const missingEmailResult = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithoutEmailId,
        litterId: fixture.litterId,
      },
      { supabase, transport },
    );

    expect(missingEmailResult.status).toBe("missing_email");
    expect(getTemplateCalls).toHaveLength(0);
    expect(sendEmailCalls).toHaveLength(0);

    const missingTemplateResult = await sendMatingConfirmationEmailForApplication(
      {
        applicationId: fixture.applicationWithEmailId,
        litterId: fixture.litterId,
      },
      { supabase, transport },
    );

    expect(missingTemplateResult.status).toBe("missing_template");
    expect(getTemplateCalls).toHaveLength(0);
    expect(sendEmailCalls).toHaveLength(0);

    const attempts = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("litter_id", fixture.litterId),
      "read skipped mating confirmation attempts",
    );

    expect(attempts).toHaveLength(0);
    expect(countFixtureBusinessMutations()).toEqual({
      reservations: 0,
      payments: 0,
      documents: 0,
    });
  } finally {
    cleanupFixture();
    expect(countRemainingFixtures()).toBe(0);
  }
});
