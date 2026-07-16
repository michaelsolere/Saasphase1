import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  runTransactionalCampaignDelivery,
  type TransactionalEmailTransport,
} from "../../src/features/communications/transactional-campaign-core";
import {
  MAX_TRANSACTIONAL_EMAIL_ATTACHMENT_BYTES,
  validateTransactionalEmailAttachments,
  type TransactionalEmailAttachment,
} from "../../src/features/communications/transactional-email-attachments";
import { buildBrevoTransactionalEmailPayload } from "../../src/lib/brevo/transactional-email-payload";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const contactId = "a1600003-0000-4000-8000-000000000001";
const templateId = "a1600003-0000-4000-8000-000000000002";
const historicalAttemptId = "a1600003-0000-4000-8000-000000000003";
const directInsertAttemptIds = [
  "a1600003-0000-4000-8000-000000000031",
  "a1600003-0000-4000-8000-000000000032",
  "a1600003-0000-4000-8000-000000000033",
  "a1600003-0000-4000-8000-000000000034",
] as const;
const campaignKey = "transactional_attachment_qa";
const fixturePrefix = `${campaignKey}:`;

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (value: string) => runE2eSqlSync(value);

function cleanup() {
  sql(`
    delete from public.email_delivery_attempts
    where contact_id = ${quote(contactId)}::uuid
      or idempotency_key like ${quote(`${fixturePrefix}%`)};
    delete from public.email_templates where id = ${quote(templateId)}::uuid;
    delete from public.contacts where id = ${quote(contactId)}::uuid;
  `);
}

function remaining() {
  return Number(
    sql(`
      select count(*) from (
        select id from public.email_delivery_attempts
        where contact_id = ${quote(contactId)}::uuid
          or idempotency_key like ${quote(`${fixturePrefix}%`)}
        union all
        select id from public.email_templates where id = ${quote(templateId)}::uuid
        union all
        select id from public.contacts where id = ${quote(contactId)}::uuid
      ) fixtures;
    `),
  );
}

function createFixture() {
  cleanup();
  sql(`
    insert into public.contacts (
      id, organization_id, contact_type, display_name, email,
      created_by, updated_by
    ) values (
      ${quote(contactId)}::uuid,
      ${quote(organizationId)}::uuid,
      'person',
      'QA pièces jointes transactionnelles',
      'attachments-qa@example.invalid',
      ${quote(ownerId)}::uuid,
      ${quote(ownerId)}::uuid
    );
    insert into public.email_templates (
      id, organization_id, template_key, title, category, subject, body,
      is_active, brevo_template_id, created_by, updated_by
    ) values (
      ${quote(templateId)}::uuid,
      ${quote(organizationId)}::uuid,
      ${quote(campaignKey)},
      'QA pièces jointes transactionnelles',
      'candidate_journey',
      'Sujet QA pièces jointes',
      'Corps Brevo QA',
      true,
      765499,
      ${quote(ownerId)}::uuid,
      ${quote(ownerId)}::uuid
    );
  `);
}

function attachment(
  documentId: string,
  documentType: "commitment_certificate" | "reservation_contract",
  name: string,
  body = "%PDF-1.7\nQA attachment\n%%EOF",
  version = 1,
): TransactionalEmailAttachment {
  const bytes = Buffer.from(body);
  return {
    name,
    content: bytes.toString("base64"),
    snapshot: {
      kind: "document_pdf",
      documentId,
      documentType,
      fileName: name,
      fileSha256: createHash("sha256").update(bytes).digest("hex"),
      fileSizeBytes: bytes.length,
      version,
    },
  };
}

const certificate = () =>
  attachment(
    "a1600003-0000-4000-8000-000000000011",
    "commitment_certificate",
    "certificat-engagement.pdf",
  );
const contract = () =>
  attachment(
    "a1600003-0000-4000-8000-000000000012",
    "reservation_contract",
    "contrat-reservation.pdf",
    "%PDF-1.7\nQA contract attachment\n%%EOF",
    2,
  );

function transport(mode: "success" | "certain" | "timeout" = "success") {
  const templateCalls: number[] = [];
  const sends: Array<Parameters<TransactionalEmailTransport["sendEmail"]>[0]> = [];
  const value: TransactionalEmailTransport = {
    isConfigured: () => true,
    getTemplate: async (id) => {
      templateCalls.push(id);
      return {
        ok: true,
        template: {
          id,
          name: "QA attachments",
          subject: "Sujet fournisseur QA",
          isActive: true,
          modifiedAt: "2026-07-16T10:00:00.000Z",
          sender: null,
          replyTo: null,
        },
      };
    },
    sendEmail: async (input) => {
      sends.push(input);
      if (mode === "certain") return { ok: false, reason: "invalid_request" };
      if (mode === "timeout") return { ok: false, reason: "timeout" };
      return { ok: true, messageId: `qa-attachment-${sends.length}` };
    },
  };
  return { value, templateCalls, sends };
}

async function deliver(input: {
  operationVersion: string;
  attachments?: TransactionalEmailAttachment[];
  transport: TransactionalEmailTransport;
  compensate?: () => Promise<{ ok: true }>;
}) {
  const supabase = await createAuthenticatedSupabaseClient();
  return runTransactionalCampaignDelivery(
    {
      campaignKey,
      operationVersion: input.operationVersion,
      transport: input.transport,
      prepareOperation: async () => ({
        ok: true,
        operation: {
          dossierId: contactId,
          contactId,
          recipientEmail: "attachments-qa@example.invalid",
          recipientName: "QA Attachments",
          variables: { prenom: "QA" },
        },
      }),
      prepareClaimedOperation: async ({ attempt }) => {
        expect(attempt.status).toBe("sending");
        return {
          ok: true,
          claimed: {
            attachments: input.attachments,
            compensate: input.compensate,
          },
        };
      },
    },
    { supabase },
  );
}

test("validates strict Base64, PDF identity, limits, names, duplicates and order", () => {
  const valid = [certificate(), contract()];
  expect(validateTransactionalEmailAttachments(valid)).toMatchObject({ ok: true });

  const invalidBase64 = certificate();
  invalidBase64.content = "%%%not-base64%%%";
  expect(validateTransactionalEmailAttachments([invalidBase64])).toEqual({
    ok: false,
    errorCode: "invalid_attachment_base64",
  });

  const falsePdf = certificate();
  const falsePdfBytes = Buffer.from("not a PDF");
  falsePdf.content = falsePdfBytes.toString("base64");
  falsePdf.snapshot.fileSha256 = createHash("sha256").update(falsePdfBytes).digest("hex");
  falsePdf.snapshot.fileSizeBytes = falsePdfBytes.length;
  expect(validateTransactionalEmailAttachments([falsePdf])).toMatchObject({
    errorCode: "invalid_attachment_pdf",
  });

  const wrongHash = certificate();
  wrongHash.snapshot.fileSha256 = "0".repeat(64);
  expect(validateTransactionalEmailAttachments([wrongHash])).toMatchObject({
    errorCode: "attachment_sha256_mismatch",
  });

  const wrongSize = certificate();
  wrongSize.snapshot.fileSizeBytes += 1;
  expect(validateTransactionalEmailAttachments([wrongSize])).toMatchObject({
    errorCode: "attachment_size_mismatch",
  });

  const dangerousName = certificate();
  dangerousName.name = dangerousName.snapshot.fileName = "../secret.pdf";
  expect(validateTransactionalEmailAttachments([dangerousName])).toMatchObject({
    errorCode: "unsafe_attachment_name",
  });

  const duplicate = contract();
  duplicate.snapshot.documentId = certificate().snapshot.documentId;
  expect(
    validateTransactionalEmailAttachments([certificate(), duplicate]),
  ).toMatchObject({ errorCode: "duplicate_attachment_document" });
  expect(
    validateTransactionalEmailAttachments([contract(), certificate()]),
  ).toMatchObject({ errorCode: "invalid_attachment_order" });
  expect(
    validateTransactionalEmailAttachments(Array.from({ length: 11 }, certificate)),
  ).toMatchObject({ errorCode: "invalid_attachment_count" });

  const oversizedBytes = Buffer.alloc(
    MAX_TRANSACTIONAL_EMAIL_ATTACHMENT_BYTES + 1,
    0x20,
  );
  oversizedBytes.write("%PDF-");
  const oversized = certificate();
  oversized.content = oversizedBytes.toString("base64");
  oversized.snapshot.fileSha256 = createHash("sha256")
    .update(oversizedBytes)
    .digest("hex");
  oversized.snapshot.fileSizeBytes = oversizedBytes.length;
  expect(validateTransactionalEmailAttachments([oversized])).toMatchObject({
    errorCode: "attachment_too_large",
  });

  const cumulative = Array.from({ length: 4 }, (_, index) =>
    attachment(
      `a1600003-0000-4000-8000-00000000002${index}`,
      "commitment_certificate",
      `certificat-${index}.pdf`,
      `%PDF-${"x".repeat(3 * 1024 * 1024)}`,
    ),
  );
  expect(validateTransactionalEmailAttachments(cumulative)).toMatchObject({
    errorCode: "attachments_too_large",
  });
});

test("sends two PDFs, snapshots metadata only, retries identically and rejects drift", async () => {
  createFixture();
  try {
    const withAttachments = transport();
    const sent = await deliver({
      operationVersion: "with-attachments",
      attachments: [certificate(), contract()],
      transport: withAttachments.value,
    });
    expect(sent.outcome).toBe("success");
    expect(withAttachments.sends[0].attachments).toEqual([
      { name: certificate().name, content: certificate().content },
      { name: contract().name, content: contract().content },
    ]);

    const persisted = sql(`
      select jsonb_build_object(
        'manifest', attachments_snapshot,
        'variables', variables_snapshot
      )::text
      from public.email_delivery_attempts
      where id = ${quote(sent.attemptId!)}::uuid;
    `);
    expect(persisted).toContain('"document_type": "commitment_certificate"');
    expect(persisted).toContain('"document_type": "reservation_contract"');
    expect(persisted).not.toContain(certificate().content);
    expect(persisted).not.toContain(contract().content);

    const withoutAttachments = transport();
    const plain = await deliver({
      operationVersion: "without-attachments",
      transport: withoutAttachments.value,
    });
    expect(plain.outcome).toBe("success");
    expect(withoutAttachments.sends[0]).not.toHaveProperty("attachments");
    expect(
      sql(`select attachments_snapshot::text from public.email_delivery_attempts where id=${quote(plain.attemptId!)}::uuid;`),
    ).toBe("[]");

    const driftFirst = transport("certain");
    await deliver({
      operationVersion: "mismatch-retry",
      attachments: [certificate(), contract()],
      transport: driftFirst.value,
    });
    const changedVersion = contract();
    changedVersion.snapshot.version = 3;
    const changedHash = attachment(
      contract().snapshot.documentId,
      "reservation_contract",
      contract().name,
      "%PDF-1.7\nQB contract attachment\n%%EOF",
      2,
    );
    const changedSize = attachment(
      contract().snapshot.documentId,
      "reservation_contract",
      contract().name,
      "%PDF-1.7\nQA contract attachment extended\n%%EOF",
      2,
    );
    const changedName = contract();
    changedName.name = changedName.snapshot.fileName = "contrat-modifie.pdf";
    const changedDocument = contract();
    changedDocument.snapshot.documentId =
      "a1600003-0000-4000-8000-000000000099";

    for (const changedContract of [
      changedVersion,
      changedHash,
      changedSize,
      changedName,
      changedDocument,
    ]) {
      const driftRetry = transport();
      const mismatch = await deliver({
        operationVersion: "mismatch-retry",
        attachments: [certificate(), changedContract],
        transport: driftRetry.value,
      });
      expect(mismatch).toMatchObject({
        outcome: "failed",
        errorCode: "attachment_snapshot_mismatch",
      });
      expect(driftRetry.templateCalls).toHaveLength(0);
      expect(driftRetry.sends).toHaveLength(0);
      expect(JSON.stringify(mismatch)).not.toContain(changedContract.content);
    }

    const retryTransport = transport();
    const retry = await deliver({
      operationVersion: "mismatch-retry",
      attachments: [certificate(), contract()],
      transport: retryTransport.value,
    });
    expect(retry.outcome).toBe("success");
    expect(retryTransport.sends).toHaveLength(1);
  } finally {
    cleanup();
    expect(remaining()).toBe(0);
  }
});

test("validation failure compensates before provider and uncertain send stays sending", async () => {
  createFixture();
  try {
    let compensationCount = 0;
    const invalid = certificate();
    invalid.content = "invalid-base64";
    const invalidTransport = transport();
    const failed = await deliver({
      operationVersion: "validation-compensation",
      attachments: [invalid],
      transport: invalidTransport.value,
      compensate: async () => {
        compensationCount += 1;
        return { ok: true };
      },
    });
    expect(failed).toMatchObject({
      outcome: "failed",
      errorCode: "invalid_attachment_base64",
      compensated: true,
    });
    expect(compensationCount).toBe(1);
    expect(invalidTransport.templateCalls).toHaveLength(0);
    expect(invalidTransport.sends).toHaveLength(0);
    expect(JSON.stringify(failed)).not.toContain(invalid.content);

    const uncertainTransport = transport("timeout");
    const uncertain = await deliver({
      operationVersion: "uncertain-send",
      attachments: [certificate(), contract()],
      transport: uncertainTransport.value,
    });
    expect(uncertain.outcome).toBe("uncertain");
    expect(
      sql(`select status from public.email_delivery_attempts where id=${quote(uncertain.attemptId!)}::uuid;`),
    ).toBe("sending");
    expect(
      sql(`select jsonb_array_length(attachments_snapshot) from public.email_delivery_attempts where id=${quote(uncertain.attemptId!)}::uuid;`),
    ).toBe("2");
  } finally {
    cleanup();
    expect(remaining()).toBe(0);
  }
});

test("snapshots before template failure, compensates, and retries the same PDFs", async () => {
  createFixture();
  try {
    let compensationCount = 0;
    const templateFailure = transport();
    templateFailure.value.getTemplate = async (id) => {
      templateFailure.templateCalls.push(id);
      return { ok: false, reason: "invalid_request" };
    };
    const failed = await deliver({
      operationVersion: "template-failure-retry",
      attachments: [certificate(), contract()],
      transport: templateFailure.value,
      compensate: async () => {
        compensationCount += 1;
        return { ok: true };
      },
    });
    expect(failed).toMatchObject({
      outcome: "failed",
      errorCode: "invalid_request",
      compensated: true,
    });
    expect(compensationCount).toBe(1);
    expect(templateFailure.templateCalls).toHaveLength(1);
    expect(templateFailure.sends).toHaveLength(0);

    const persisted = sql(`
      select jsonb_build_object(
        'status', status,
        'manifest', attachments_snapshot,
        'variables', variables_snapshot,
        'error', last_error_code
      )::text
      from public.email_delivery_attempts
      where id = ${quote(failed.attemptId!)}::uuid;
    `);
    expect(persisted).toContain('"status": "failed"');
    expect(persisted).toContain('"document_type": "commitment_certificate"');
    expect(persisted).toContain('"document_type": "reservation_contract"');
    expect(persisted).not.toContain(certificate().content);
    expect(persisted).not.toContain(contract().content);
    expect(JSON.stringify(failed)).not.toContain(certificate().content);
    expect(JSON.stringify(failed)).not.toContain(contract().content);

    const retryTransport = transport();
    const retried = await deliver({
      operationVersion: "template-failure-retry",
      attachments: [certificate(), contract()],
      transport: retryTransport.value,
    });
    expect(retried.outcome).toBe("success");
    expect(retryTransport.templateCalls).toHaveLength(1);
    expect(retryTransport.sends).toHaveLength(1);
  } finally {
    cleanup();
    expect(remaining()).toBe(0);
  }
});

test("SQL accepts historical empty snapshots and protects a non-empty manifest", async () => {
  createFixture();
  const supabase = await createAuthenticatedSupabaseClient();
  try {
    sql(`
      insert into public.email_delivery_attempts (
        id, organization_id, contact_id, email_template_id, message_type,
        recipient_email, idempotency_key, status, created_by, updated_by
      ) values (
        ${quote(historicalAttemptId)}::uuid,
        ${quote(organizationId)}::uuid,
        ${quote(contactId)}::uuid,
        ${quote(templateId)}::uuid,
        ${quote(campaignKey)},
        'historical-attachments-qa@example.invalid',
        ${quote(`${fixturePrefix}historical`)},
        'pending',
        ${quote(ownerId)}::uuid,
        ${quote(ownerId)}::uuid
      );
      update public.email_delivery_attempts
      set status = 'sending', attempt_count = 1
      where id = ${quote(historicalAttemptId)}::uuid;
    `);
    expect(
      sql(`select attachments_snapshot::text from public.email_delivery_attempts where id=${quote(historicalAttemptId)}::uuid;`),
    ).toBe("[]");

    const sentTransport = transport();
    const sent = await deliver({
      operationVersion: "sql-immutability",
      attachments: [certificate(), contract()],
      transport: sentTransport.value,
    });
    const clear = await supabase
      .from("email_delivery_attempts")
      .update({ attachments_snapshot: [] })
      .eq("id", sent.attemptId!);
    expect(clear.error?.code).toBe("23514");

    const modifiedManifest = [
      {
        kind: "document_pdf",
        document_id: certificate().snapshot.documentId,
        document_type: "commitment_certificate",
        file_name: "different.pdf",
        file_sha256: certificate().snapshot.fileSha256,
        file_size_bytes: certificate().snapshot.fileSizeBytes,
        version: 1,
      },
    ];

    for (const [index, status] of [
      "pending",
      "sending",
      "failed",
      "sent",
    ].entries()) {
      const directInsert = await supabase.from("email_delivery_attempts").insert({
        id: directInsertAttemptIds[index],
        organization_id: organizationId,
        contact_id: contactId,
        email_template_id: templateId,
        message_type: campaignKey,
        recipient_email: `direct-manifest-${status}@example.invalid`,
        idempotency_key: `${fixturePrefix}direct-manifest-${status}`,
        status,
        attachments_snapshot: modifiedManifest,
        created_by: ownerId,
        updated_by: ownerId,
      });
      expect(directInsert.error?.code).toBe("23514");
    }
    expect(
      Number(
        sql(`
          select count(*) from public.email_delivery_attempts
          where id in (${directInsertAttemptIds.map((id) => `${quote(id)}::uuid`).join(",")});
        `),
      ),
    ).toBe(0);

    const modify = await supabase
      .from("email_delivery_attempts")
      .update({ attachments_snapshot: modifiedManifest })
      .eq("id", sent.attemptId!);
    expect(modify.error?.code).toBe("23514");

    const pendingAttempt = await supabase.from("email_delivery_attempts").insert({
      organization_id: organizationId,
      contact_id: contactId,
      email_template_id: templateId,
      message_type: campaignKey,
      recipient_email: "pending-attachments-qa@example.invalid",
      idempotency_key: `${fixturePrefix}pending-manifest`,
      status: "pending",
      created_by: ownerId,
      updated_by: ownerId,
    }).select("id").single();
    expect(pendingAttempt.error).toBeNull();
    const premature = await supabase
      .from("email_delivery_attempts")
      .update({ attachments_snapshot: modifiedManifest })
      .eq("id", pendingAttempt.data!.id);
    expect(premature.error?.code).toBe("23514");
  } finally {
    cleanup();
    expect(remaining()).toBe(0);
  }
});

test("Brevo omits an absent attachment field and forwards two PDFs", () => {
  const common = {
    templateId: 765499,
    to: { email: "brevo-attachments@example.invalid", name: "QA Brevo" },
    params: { prenom: "QA" },
    idempotencyKey: "qa-brevo-attachment-payload",
    tags: ["saas_elevage", campaignKey],
  };
  const configuration = {
    senderEmail: "sender@example.invalid",
    senderName: "Élevage QA",
    replyToEmail: "reply@example.invalid",
  };
  const plainPayload = buildBrevoTransactionalEmailPayload(
    common,
    configuration,
  );
  expect(plainPayload).not.toHaveProperty("attachment");
  expect(plainPayload).toMatchObject({
      templateId: 765499,
      to: [{ email: "brevo-attachments@example.invalid", name: "QA Brevo" }],
      params: { prenom: "QA" },
      headers: { "Idempotency-Key": "qa-brevo-attachment-payload" },
      tags: ["saas_elevage", campaignKey],
      sender: { email: "sender@example.invalid", name: "Élevage QA" },
      replyTo: { email: "reply@example.invalid" },
    });

  const attachments = [certificate(), contract()].map(({ name, content }) => ({
    name,
    content,
  }));
  expect(
    buildBrevoTransactionalEmailPayload(
      { ...common, attachments },
      configuration,
    ).attachment,
  ).toEqual(attachments);
});
