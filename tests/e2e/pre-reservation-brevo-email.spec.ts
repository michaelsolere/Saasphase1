import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import {
  runE2eSqlSync,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";
import {
  sendPreReservationEmailForReservation,
  type PreReservationEmailTransport,
} from "../../src/features/communications/pre-reservation-email-core";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const contactId = "70000000-0000-4000-8000-000000000004";
const applicationId = "80000000-0000-4000-8000-000000000004";
const reservationId = "90000000-0000-4000-8000-000000000002";
const litterId = "c0000000-0000-4000-8000-000000000002";
const litterGroupId = "50000000-0000-4000-8000-000000000001";
const templateId = "92000000-0000-4000-8000-000000000101";
const brevoTemplateId = 123456;
const brevoMockPort = 15432;
const otherOrganizationId = "21000000-0000-4000-8000-000000009101";
const otherLitterGroupId = "51000000-0000-4000-8000-000000009101";
const otherContactId = "71000000-0000-4000-8000-000000009101";
const otherReservationId = "91000000-0000-4000-8000-000000009101";
const otherPaymentId = "a1000000-0000-4000-8000-000000009101";
const otherTemplateId = "92000000-0000-4000-8000-000000009101";
const protectedServerImports = [
  "@/lib/brevo/server",
  "@/features/communications/pre-reservation-email",
  "@/features/communications/email-delivery-attempts",
];

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSql(sql: string) {
  return runE2eSqlSync(sql);
}

type BrevoTemplateIdSnapshot = Array<{
  id: string;
  brevoTemplateId: string | null;
}>;

function readSeedPreReservationBrevoTemplateIds(): BrevoTemplateIdSnapshot {
  const output = runSql(`
    select id::text || '|' || coalesce(brevo_template_id::text, '')
    from public.email_templates
    where organization_id = ${sqlQuote(organizationId)}::uuid
      and template_key = 'pre_reservation'
      and id <> ${sqlQuote(templateId)}::uuid
    order by id;
  `);

  if (!output) {
    return [];
  }

  return output.split(/\r?\n/).map((line) => {
    const [id, rawBrevoTemplateId = ""] = line.split("|");

    return {
      id,
      brevoTemplateId: rawBrevoTemplateId || null,
    };
  });
}

function restoreSeedPreReservationBrevoTemplateIds(
  snapshot: BrevoTemplateIdSnapshot,
) {
  snapshot.forEach((template) => {
    runSql(`
      update public.email_templates
      set
        brevo_template_id = ${
          template.brevoTemplateId === null
            ? "null"
            : Number(template.brevoTemplateId)
        },
        updated_by = ${sqlQuote(ownerId)}::uuid
      where id = ${sqlQuote(template.id)}::uuid
        and organization_id = ${sqlQuote(organizationId)}::uuid;
    `);
  });
}

function clearSeedPreReservationBrevoTemplateIds() {
  runSql(`
    update public.email_templates
    set
      brevo_template_id = null,
      updated_by = ${sqlQuote(ownerId)}::uuid
    where organization_id = ${sqlQuote(organizationId)}::uuid
      and template_key = 'pre_reservation'
      and id <> ${sqlQuote(templateId)}::uuid;
  `);
}

function buildIdempotencyKey() {
  const logicalParts = [
    ["organization", organizationId],
    ["campaign", "pre_reservation"],
    ["dossier", applicationId],
    ["version", "v1"],
  ];
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(logicalParts))
    .digest("hex")
    .slice(0, 40);

  return `pre_reservation:${fingerprint}`;
}

const idempotencyKey = buildIdempotencyKey();

function restoreSeedRows() {
  runSql(`
    update public.email_templates
    set
      template_key = 'pre_reservation',
      deleted_at = null,
      is_active = true,
      brevo_template_id = null,
      updated_by = ${sqlQuote(ownerId)}::uuid
    where organization_id = ${sqlQuote(organizationId)}::uuid
      and template_key = 'pre_reservation_seed_qa_disabled'
      and id <> ${sqlQuote(templateId)}::uuid;

    update public.contacts
    set
      email = 'nicolas.bernard@example.com',
      updated_by = ${sqlQuote(ownerId)}::uuid
    where id = ${sqlQuote(contactId)}::uuid
      and organization_id = ${sqlQuote(organizationId)}::uuid;

    update public.reservations
    set
      status = 'pre_reservation_requested',
      pre_reservation_deadline = '2026-06-21 12:00:00+00',
      updated_by = ${sqlQuote(ownerId)}::uuid
    where id = ${sqlQuote(reservationId)}::uuid
      and organization_id = ${sqlQuote(organizationId)}::uuid;

    update public.payments
    set
      amount_cents = 25000,
      currency = 'EUR',
      status = 'requested',
      due_date = '2026-06-21',
      paid_at = null,
      deleted_at = null,
      updated_by = ${sqlQuote(ownerId)}::uuid
    where id = 'a0000000-0000-4000-8000-000000000001'::uuid
      and organization_id = ${sqlQuote(organizationId)}::uuid;
  `);
}

function cleanupQaFixtures() {
  runSql(`
    delete from public.email_delivery_attempts
    where (
      organization_id = ${sqlQuote(organizationId)}::uuid
      and (
        idempotency_key = ${sqlQuote(idempotencyKey)}
        or email_template_id = ${sqlQuote(templateId)}::uuid
      )
    )
    or organization_id = ${sqlQuote(otherOrganizationId)}::uuid;

    delete from public.email_templates
    where id = ${sqlQuote(templateId)}::uuid
      and organization_id = ${sqlQuote(organizationId)}::uuid
      and template_key = 'pre_reservation';

    delete from public.email_templates
    where id = ${sqlQuote(otherTemplateId)}::uuid
      and organization_id = ${sqlQuote(otherOrganizationId)}::uuid;

    delete from public.payments
    where id = ${sqlQuote(otherPaymentId)}::uuid
      and organization_id = ${sqlQuote(otherOrganizationId)}::uuid;

    delete from public.reservations
    where id = ${sqlQuote(otherReservationId)}::uuid
      and organization_id = ${sqlQuote(otherOrganizationId)}::uuid;

    delete from public.contacts
    where id = ${sqlQuote(otherContactId)}::uuid
      and organization_id = ${sqlQuote(otherOrganizationId)}::uuid;

    delete from public.litter_groups
    where id = ${sqlQuote(otherLitterGroupId)}::uuid
      and organization_id = ${sqlQuote(otherOrganizationId)}::uuid;

    delete from public.organizations
    where id = ${sqlQuote(otherOrganizationId)}::uuid;
  `);
  restoreSeedRows();
}

function countRemainingFixtures() {
  return Number(
    runSql(`
      select count(*)
      from (
        select id::text from public.email_delivery_attempts
        where (
          organization_id = ${sqlQuote(organizationId)}::uuid
          and (
            idempotency_key = ${sqlQuote(idempotencyKey)}
            or email_template_id = ${sqlQuote(templateId)}::uuid
          )
        )
        or organization_id = ${sqlQuote(otherOrganizationId)}::uuid
        union all
        select id::text from public.email_templates
        where id = ${sqlQuote(templateId)}::uuid
          and organization_id = ${sqlQuote(organizationId)}::uuid
        union all
        select id::text from public.email_templates
        where id = ${sqlQuote(otherTemplateId)}::uuid
          and organization_id = ${sqlQuote(otherOrganizationId)}::uuid
        union all
        select id::text from public.payments
        where id = ${sqlQuote(otherPaymentId)}::uuid
          and organization_id = ${sqlQuote(otherOrganizationId)}::uuid
        union all
        select id::text from public.reservations
        where id = ${sqlQuote(otherReservationId)}::uuid
          and organization_id = ${sqlQuote(otherOrganizationId)}::uuid
        union all
        select id::text from public.contacts
        where id = ${sqlQuote(otherContactId)}::uuid
          and organization_id = ${sqlQuote(otherOrganizationId)}::uuid
        union all
        select id::text from public.litter_groups
        where id = ${sqlQuote(otherLitterGroupId)}::uuid
          and organization_id = ${sqlQuote(otherOrganizationId)}::uuid
        union all
        select id::text from public.organizations
        where id = ${sqlQuote(otherOrganizationId)}::uuid
      ) remaining;
    `),
  );
}

function insertQaTemplate() {
  runSql(`
    update public.email_templates
    set
      template_key = 'pre_reservation_seed_qa_disabled',
      deleted_at = now(),
      updated_by = ${sqlQuote(ownerId)}::uuid
    where organization_id = ${sqlQuote(organizationId)}::uuid
      and template_key = 'pre_reservation'
      and id <> ${sqlQuote(templateId)}::uuid;

    insert into public.email_templates (
      id,
      organization_id,
      template_key,
      title,
      category,
      subject,
      body,
      is_active,
      brevo_template_id,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(templateId)}::uuid,
      ${sqlQuote(organizationId)}::uuid,
      'pre_reservation',
      'Pré-réservation QA Brevo',
      'adopter_journey',
      'Pré-réservation QA',
      'Corps QA',
      true,
      ${brevoTemplateId},
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );
  `);
}

function insertQaAttemptWithUnexpectedIdempotencyKey() {
  runSql(`
    insert into public.email_delivery_attempts (
      organization_id,
      contact_id,
      reservation_id,
      litter_id,
      litter_group_id,
      email_template_id,
      message_type,
      recipient_email,
      idempotency_key,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(organizationId)}::uuid,
      ${sqlQuote(contactId)}::uuid,
      ${sqlQuote(reservationId)}::uuid,
      ${sqlQuote(litterId)}::uuid,
      ${sqlQuote(litterGroupId)}::uuid,
      ${sqlQuote(templateId)}::uuid,
      'pre_reservation',
      'cleanup-qa@example.invalid',
      'pre_reservation:unexpected-cleanup-key',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );
  `);
}

function insertOtherOrganizationFixtures() {
  runSql(`
    insert into public.organizations (id, name, slug)
    values (
      ${sqlQuote(otherOrganizationId)}::uuid,
      'QA Brevo Other Organization',
      'qa-brevo-other-organization'
    );

    insert into public.litter_groups (
      id,
      organization_id,
      name,
      status,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(otherLitterGroupId)}::uuid,
      ${sqlQuote(otherOrganizationId)}::uuid,
      'Groupe QA autre organisation',
      'planned',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );

    insert into public.contacts (
      id,
      organization_id,
      contact_type,
      first_name,
      last_name,
      display_name,
      email,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(otherContactId)}::uuid,
      ${sqlQuote(otherOrganizationId)}::uuid,
      'person',
      'Autre',
      'Famille',
      'Autre Famille',
      'autre-famille@example.invalid',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );

    insert into public.reservations (
      id,
      organization_id,
      contact_id,
      litter_group_id,
      species,
      breed,
      status,
      pre_reservation_deadline,
      currency,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(otherReservationId)}::uuid,
      ${sqlQuote(otherOrganizationId)}::uuid,
      ${sqlQuote(otherContactId)}::uuid,
      ${sqlQuote(otherLitterGroupId)}::uuid,
      'dog',
      'Golden Retriever',
      'pre_reservation_requested',
      '2026-08-01 12:00:00+00',
      'EUR',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );

    insert into public.payments (
      id,
      organization_id,
      contact_id,
      reservation_id,
      amount_cents,
      currency,
      payment_type,
      status,
      due_date,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(otherPaymentId)}::uuid,
      ${sqlQuote(otherOrganizationId)}::uuid,
      ${sqlQuote(otherContactId)}::uuid,
      ${sqlQuote(otherReservationId)}::uuid,
      25000,
      'EUR',
      'pre_reservation_deposit_refundable',
      'requested',
      '2026-08-01',
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );

    insert into public.email_templates (
      id,
      organization_id,
      template_key,
      title,
      category,
      subject,
      body,
      is_active,
      brevo_template_id,
      created_by,
      updated_by
    )
    values (
      ${sqlQuote(otherTemplateId)}::uuid,
      ${sqlQuote(otherOrganizationId)}::uuid,
      'pre_reservation',
      'Pré-réservation autre organisation',
      'adopter_journey',
      'Sujet autre organisation',
      'Corps autre organisation',
      true,
      ${brevoTemplateId},
      ${sqlQuote(ownerId)}::uuid,
      ${sqlQuote(ownerId)}::uuid
    );
  `);
}

function createInjectedTransport({
  failFirstPost = false,
  inactiveTemplate = false,
  sendDelayMs = 0,
} = {}) {
  const getTemplateCalls: number[] = [];
  const sendEmailCalls: unknown[] = [];
  let sendCount = 0;
  const transport: PreReservationEmailTransport = {
    isConfigured: () => true,
    getTemplate: async (requestedTemplateId) => {
      getTemplateCalls.push(requestedTemplateId);
      return {
        ok: true,
        template: {
          id: requestedTemplateId,
          name: "Pré-réservation transactionnelle QA",
          subject: "Votre pré-réservation",
          isActive: !inactiveTemplate,
          modifiedAt: "2026-07-10T12:34:56.000Z",
          sender: { email: "elevage@example.invalid", name: "Élevage QA" },
          replyTo: { email: "reply@example.invalid" },
        },
      };
    },
    sendEmail: async (input) => {
      sendCount += 1;
      sendEmailCalls.push(input);
      if (sendDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, sendDelayMs));
      }
      if (failFirstPost && sendCount === 1) {
        return { ok: false, reason: "unauthorized" };
      }
      return { ok: true, messageId: `qa-message-${sendCount}` };
    },
  };

  return { transport, getTemplateCalls, sendEmailCalls };
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return listSourceFiles(path);
    }

    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function startBrevoMock({
  failFirstPost = false,
  inactiveTemplate = false,
}: {
  failFirstPost?: boolean;
  inactiveTemplate?: boolean;
}) {
  const requests: Array<{ method: string; url: string; body: unknown }> = [];
  let postCount = 0;

  const server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      const parsedBody = body ? JSON.parse(body) : null;
      requests.push({
        method: request.method ?? "",
        url: request.url ?? "",
        body: parsedBody,
      });

      response.setHeader("content-type", "application/json");

      if (
        request.method === "GET" &&
        request.url === `/v3/smtp/templates/${brevoTemplateId}`
      ) {
        response.end(
          JSON.stringify({
            id: brevoTemplateId,
            name: "Pré-réservation transactionnelle QA",
            subject: "Votre pré-réservation",
            isActive: !inactiveTemplate,
            modifiedAt: "2026-07-10T12:34:56.000Z",
            sender: { email: "elevage@example.invalid", name: "Élevage QA" },
            replyTo: { email: "reply@example.invalid" },
          }),
        );
        return;
      }

      if (request.method === "POST" && request.url === "/v3/smtp/email") {
        postCount += 1;
        if (failFirstPost && postCount === 1) {
          response.statusCode = 503;
          response.end(JSON.stringify({ code: "temporarily_unavailable" }));
          return;
        }

        response.end(JSON.stringify({ messageId: `qa-message-${postCount}` }));
        return;
      }

      response.statusCode = 404;
      response.end(JSON.stringify({ code: "not_found" }));
    });
  });

  return new Promise<{
    requests: typeof requests;
    stop: () => Promise<void>;
  }>((resolve) => {
    server.listen(brevoMockPort, "127.0.0.1", () => {
      resolve({
        requests,
        stop: () =>
          new Promise<void>((stopResolve, stopReject) => {
            server.close((error) => {
              if (error) {
                stopReject(error);
                return;
              }
              stopResolve();
            });
          }),
      });
    });
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

test("client components do not import protected server communication modules", () => {
  const violations = listSourceFiles(join(process.cwd(), "src"))
    .filter((filePath) => {
      const content = readFileSync(filePath, "utf8");
      const firstStatement = content.trimStart().split(/\r?\n/, 1)[0];

      return (
        (firstStatement === '"use client";' || firstStatement === "'use client';") &&
        protectedServerImports.some((importPath) => content.includes(importPath))
      );
    })
    .map((filePath) => filePath.replace(`${process.cwd()}/`, ""));

  expect(violations).toEqual([]);
});

test("cleanup removes attempts linked to the QA template with an unexpected idempotency key", () => {
  cleanupQaFixtures();
  insertQaTemplate();

  try {
    insertQaAttemptWithUnexpectedIdempotencyKey();
    expect(countRemainingFixtures()).toBe(2);

    cleanupQaFixtures();

    expect(countRemainingFixtures()).toBe(0);
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("reservation page does not call Brevo when the template id is absent", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const brevoTemplateIdSnapshot = readSeedPreReservationBrevoTemplateIds();
  cleanupQaFixtures();
  clearSeedPreReservationBrevoTemplateIds();

  try {
    await login(page);
    await page.goto(`/reservations/${reservationId}`);

    await expect(
      page.getByRole("heading", { name: "E-mail de pré-réservation" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Envoyer via Brevo" }),
    ).toBeDisabled();
    await expect(page.getByText("Envoi transactionnel")).toBeVisible();
    expect(
      expectSupabaseData(
        await supabase
          .from("email_delivery_attempts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("idempotency_key", idempotencyKey),
        "read missing template attempts from page",
      ),
    ).toHaveLength(0);
  } finally {
    cleanupQaFixtures();
    restoreSeedPreReservationBrevoTemplateIds(brevoTemplateIdSnapshot);
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("does not post an email when the Brevo template is inactive", async ({
  page,
}) => {
  cleanupQaFixtures();
  insertQaTemplate();
  const mock = await startBrevoMock({ inactiveTemplate: true });

  try {
    await login(page);
    await page.goto(`/reservations/${reservationId}`);
    await page.getByRole("button", { name: "Envoyer via Brevo" }).click();
    await page.getByRole("button", { name: "Envoyer via Brevo" }).last().click();

    await expect(page).toHaveURL(/pre_reservation_email_status=missing_template/);
    await expect(page.getByText("modèle interne de pré-réservation")).toBeVisible();

    expect(
      mock.requests.filter(
        (request) => request.method === "POST" && request.url === "/v3/smtp/email",
      ),
    ).toHaveLength(0);
  } finally {
    await mock.stop();
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("orchestrator allows only one concurrent pre-reservation send", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  restoreSeedRows();
  insertQaTemplate();
  const { transport, getTemplateCalls, sendEmailCalls } = createInjectedTransport({
    sendDelayMs: 150,
  });

  try {
    const [firstResult, secondResult] = await Promise.all([
      sendPreReservationEmailForReservation(
        { reservationId },
        { supabase, transport },
      ),
      sendPreReservationEmailForReservation(
        { reservationId },
        { supabase, transport },
      ),
    ]);

    expect([firstResult.status, secondResult.status].sort()).toEqual([
      "in_progress",
      "success",
    ]);
    expect(getTemplateCalls).toHaveLength(1);
    expect(sendEmailCalls).toHaveLength(1);

    const attempts = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("id, status, attempt_count, idempotency_key")
        .eq("organization_id", organizationId)
        .eq("idempotency_key", idempotencyKey),
      "read concurrent attempts",
    );

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      status: "sent",
      attempt_count: 1,
      idempotency_key: idempotencyKey,
    });
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("orchestrator returns already_sent after success without another Brevo call", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  restoreSeedRows();
  insertQaTemplate();
  const { transport, getTemplateCalls, sendEmailCalls } = createInjectedTransport();

  try {
    const firstResult = await sendPreReservationEmailForReservation(
      { reservationId },
      { supabase, transport },
    );
    expect(firstResult.status).toBe("success");

    const attemptBefore = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("id, attempt_count, idempotency_key")
        .eq("organization_id", organizationId)
        .eq("idempotency_key", idempotencyKey)
        .single(),
      "read sent attempt before replay",
    );

    const secondResult = await sendPreReservationEmailForReservation(
      { reservationId },
      { supabase, transport },
    );
    expect(secondResult.status).toBe("already_sent");
    expect(getTemplateCalls).toHaveLength(1);
    expect(sendEmailCalls).toHaveLength(1);

    const attemptAfter = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("id, attempt_count, idempotency_key")
        .eq("organization_id", organizationId)
        .eq("idempotency_key", idempotencyKey)
        .single(),
      "read sent attempt after replay",
    );

    expect(attemptAfter).toEqual(attemptBefore);
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("orchestrator refreshes recipient and variables snapshots on retry", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  restoreSeedRows();
  insertQaTemplate();
  const { transport, sendEmailCalls } = createInjectedTransport({
    failFirstPost: true,
  });

  try {
    const failedResult = await sendPreReservationEmailForReservation(
      { reservationId },
      { supabase, transport },
    );
    expect(failedResult.status).toBe("failed");

    runSql(`
      update public.contacts
      set email = 'nicolas.retry@example.invalid'
      where id = ${sqlQuote(contactId)}::uuid
        and organization_id = ${sqlQuote(organizationId)}::uuid;

      update public.payments
      set amount_cents = 27500,
          due_date = '2026-06-24'
      where id = 'a0000000-0000-4000-8000-000000000001'::uuid
        and organization_id = ${sqlQuote(organizationId)}::uuid;
    `);

    const retryResult = await sendPreReservationEmailForReservation(
      { reservationId },
      { supabase, transport },
    );
    expect(retryResult.status).toBe("success");
    expect(sendEmailCalls).toHaveLength(2);
    expect(sendEmailCalls[1]).toMatchObject({
      to: { email: "nicolas.retry@example.invalid" },
      params: {
        montant_pre_reservation: "275,00 €",
        echeance_pre_reservation: "24 juin 2026",
      },
    });

    const attempt = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("status, attempt_count, recipient_email, variables_snapshot")
        .eq("organization_id", organizationId)
        .eq("idempotency_key", idempotencyKey)
        .single(),
      "read retry snapshot",
    );

    expect(attempt.status).toBe("sent");
    expect(attempt.attempt_count).toBe(2);
    expect(attempt.recipient_email).toBe("nicolas.retry@example.invalid");
    expect(attempt.variables_snapshot).toMatchObject({
      montant_pre_reservation: "275,00 €",
      echeance_pre_reservation: "24 juin 2026",
    });
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("orchestrator does not send or create attempts for ineligible reservation status", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  restoreSeedRows();
  insertQaTemplate();
  const { transport, getTemplateCalls, sendEmailCalls } = createInjectedTransport();

  try {
    runSql(`
      update public.reservations
      set status = 'draft'
      where id = ${sqlQuote(reservationId)}::uuid
        and organization_id = ${sqlQuote(organizationId)}::uuid;
    `);

    const result = await sendPreReservationEmailForReservation(
      { reservationId },
      { supabase, transport },
    );

    expect(result.status).toBe("not_eligible");
    expect(getTemplateCalls).toHaveLength(0);
    expect(sendEmailCalls).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase
          .from("email_delivery_attempts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("idempotency_key", idempotencyKey),
        "read ineligible status attempts",
      ),
    ).toHaveLength(0);
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("orchestrator does not send or create attempts when contact email is invalid", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  restoreSeedRows();
  insertQaTemplate();
  const { transport, getTemplateCalls, sendEmailCalls } = createInjectedTransport();

  try {
    runSql(`
      update public.contacts
      set email = 'email-invalide'
      where id = ${sqlQuote(contactId)}::uuid
        and organization_id = ${sqlQuote(organizationId)}::uuid;
    `);

    const result = await sendPreReservationEmailForReservation(
      { reservationId },
      { supabase, transport },
    );

    expect(result.status).toBe("missing_email");
    expect(getTemplateCalls).toHaveLength(0);
    expect(sendEmailCalls).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase
          .from("email_delivery_attempts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("idempotency_key", idempotencyKey),
        "read missing email attempts",
      ),
    ).toHaveLength(0);
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("orchestrator does not send when the initial payment is already paid", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  restoreSeedRows();
  insertQaTemplate();
  const { transport, getTemplateCalls, sendEmailCalls } = createInjectedTransport();

  try {
    runSql(`
      update public.payments
      set status = 'paid',
          paid_at = '2026-06-07 10:00:00+00'
      where id = 'a0000000-0000-4000-8000-000000000001'::uuid
        and organization_id = ${sqlQuote(organizationId)}::uuid;
    `);

    const result = await sendPreReservationEmailForReservation(
      { reservationId },
      { supabase, transport },
    );

    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("created_resource_read_failed");
    expect(getTemplateCalls).toHaveLength(1);
    expect(sendEmailCalls).toHaveLength(0);
    const attempts = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select("id, status, last_error_code")
        .eq("organization_id", organizationId)
        .eq("idempotency_key", idempotencyKey),
      "read paid payment attempts",
    );
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      status: "failed",
      last_error_code: "created_resource_read_failed",
    });
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("orchestrator does not send or create attempts when Brevo template id is absent", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  restoreSeedRows();
  const { transport, getTemplateCalls, sendEmailCalls } = createInjectedTransport();

  try {
    const result = await sendPreReservationEmailForReservation(
      { reservationId },
      { supabase, transport },
    );

    expect(result.status).toBe("missing_template");
    expect(getTemplateCalls).toHaveLength(0);
    expect(sendEmailCalls).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase
          .from("email_delivery_attempts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("idempotency_key", idempotencyKey),
        "read missing template attempts",
      ),
    ).toHaveLength(0);
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});

test("orchestrator isolates reservations from other organizations", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  restoreSeedRows();
  insertOtherOrganizationFixtures();
  const { transport, getTemplateCalls, sendEmailCalls } = createInjectedTransport();

  try {
    const result = await sendPreReservationEmailForReservation(
      { reservationId: otherReservationId },
      { supabase, transport },
    );

    expect(result.status).toBe("not_eligible");
    expect(getTemplateCalls).toHaveLength(0);
    expect(sendEmailCalls).toHaveLength(0);
    expect(
      expectSupabaseData(
        await supabase
          .from("email_delivery_attempts")
          .select("id")
          .eq("organization_id", otherOrganizationId),
        "read other organization attempts",
      ),
    ).toHaveLength(0);
  } finally {
    cleanupQaFixtures();
    expect(countRemainingFixtures()).toBe(0);
  }
});
