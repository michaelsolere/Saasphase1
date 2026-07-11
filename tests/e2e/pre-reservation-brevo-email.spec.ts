import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import http from "node:http";

import { expect, test, type Page } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const contactId = "70000000-0000-4000-8000-000000000004";
const reservationId = "90000000-0000-4000-8000-000000000002";
const litterId = "c0000000-0000-4000-8000-000000000002";
const litterGroupId = "50000000-0000-4000-8000-000000000001";
const templateId = "92000000-0000-4000-8000-000000000101";
const brevoTemplateId = 123456;
const brevoMockPort = 15432;

function sqlQuote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runSql(sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_saasphase1",
      "psql",
      "-X",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

function buildIdempotencyKey() {
  const logicalParts = [
    ["organization", organizationId],
    ["message_type", "pre_reservation"],
    ["contact", contactId],
    ["reservation", reservationId],
    ["litter", litterId],
    ["litter_group", litterGroupId],
    ["version", "v1"],
  ];
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(logicalParts))
    .digest("hex")
    .slice(0, 40);

  return `pre_reservation:${fingerprint}`;
}

const idempotencyKey = buildIdempotencyKey();

function cleanupQaFixtures() {
  runSql(`
    delete from public.email_delivery_attempts
    where organization_id = ${sqlQuote(organizationId)}::uuid
      and idempotency_key = ${sqlQuote(idempotencyKey)};

    delete from public.email_templates
    where id = ${sqlQuote(templateId)}::uuid
      and organization_id = ${sqlQuote(organizationId)}::uuid
      and template_key = 'pre_reservation';
  `);
}

function countRemainingFixtures() {
  return Number(
    runSql(`
      select count(*)
      from (
        select id::text from public.email_delivery_attempts
        where organization_id = ${sqlQuote(organizationId)}::uuid
          and idempotency_key = ${sqlQuote(idempotencyKey)}
        union all
        select id::text from public.email_templates
        where id = ${sqlQuote(templateId)}::uuid
          and organization_id = ${sqlQuote(organizationId)}::uuid
          and template_key = 'pre_reservation'
      ) remaining;
    `),
  );
}

function insertQaTemplate() {
  runSql(`
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
  await page.getByLabel("Email").fill("owner@saasphase1.invalid");
  await page.getByLabel("Mot de passe").fill("LocalDevOwner-2026!");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/);
}

test("sends and retries the individual pre-reservation Brevo email without real Brevo calls", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  cleanupQaFixtures();
  insertQaTemplate();
  const mock = await startBrevoMock({ failFirstPost: true });

  try {
    await login(page);
    await page.goto(`/reservations/${reservationId}`);

    await expect(
      page.getByRole("heading", { name: "E-mail de pré-réservation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Envoyer via Brevo" }).click();
    await expect(page.getByText("Un véritable e-mail transactionnel")).toBeVisible();
    await page.getByRole("button", { name: "Envoyer via Brevo" }).last().click();

    await expect(page).toHaveURL(/pre_reservation_email_status=failed/);
    await expect(page.getByText("L’envoi Brevo a échoué")).toBeVisible();

    let attempt = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select(
          "id, status, attempt_count, brevo_message_id, brevo_template_id, brevo_template_modified_at, subject_snapshot, last_error_code",
        )
        .eq("organization_id", organizationId)
        .eq("idempotency_key", idempotencyKey)
        .single(),
      "read failed attempt",
    );

    expect(attempt).toMatchObject({
      status: "failed",
      attempt_count: 1,
      brevo_message_id: null,
      brevo_template_id: brevoTemplateId,
      subject_snapshot: "Votre pré-réservation",
      last_error_code: "provider_unavailable",
    });

    await page.getByRole("button", { name: "Réessayer l’envoi" }).click();
    await page.getByRole("button", { name: "Réessayer l’envoi" }).last().click();

    await expect(page).toHaveURL(/pre_reservation_email_status=success/);
    await expect(page.getByText("a bien été envoyé via Brevo")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Envoyer via Brevo" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Réessayer l’envoi" }),
    ).not.toBeVisible();

    attempt = expectSupabaseData(
      await supabase
        .from("email_delivery_attempts")
        .select(
          "id, status, attempt_count, brevo_message_id, brevo_template_id, brevo_template_modified_at, subject_snapshot, last_error_code",
        )
        .eq("organization_id", organizationId)
        .eq("idempotency_key", idempotencyKey)
        .single(),
      "read sent attempt",
    );

    expect(attempt).toMatchObject({
      status: "sent",
      attempt_count: 2,
      brevo_message_id: "qa-message-2",
      brevo_template_id: brevoTemplateId,
      subject_snapshot: "Votre pré-réservation",
      last_error_code: null,
    });
    expect(attempt.brevo_template_modified_at).toBe(
      "2026-07-10T12:34:56+00:00",
    );

    const postRequests = mock.requests.filter(
      (request) => request.method === "POST" && request.url === "/v3/smtp/email",
    );
    expect(postRequests).toHaveLength(2);
    expect(postRequests[1].body).toMatchObject({
      templateId: brevoTemplateId,
      params: {
        prenom: "Nicolas",
        nom: "Bernard",
        nom_complet: "Nicolas Bernard",
        montant_pre_reservation: "250,00 €",
        nom_elevage: "du Val de Démo",
      },
      headers: {
        "Idempotency-Key": idempotencyKey,
      },
      tags: ["saas_elevage", "pre_reservation"],
    });
  } finally {
    await mock.stop();
    cleanupQaFixtures();
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
