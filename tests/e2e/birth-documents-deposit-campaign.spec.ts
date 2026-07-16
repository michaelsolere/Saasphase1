import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  assessBirthDocumentsDepositDocumentRows,
} from "../../src/features/communications/birth-documents-deposit-attachments";
import {
  sendBirthDocumentsDepositEmailForReservation,
  type BirthDocumentsDepositEmailTransport,
} from "../../src/features/communications/birth-documents-deposit-email-core";
import { buildDocumentGenerationSnapshot } from "../../src/features/documents/build-document-generation-snapshot";
import { buildDocumentPdfPath } from "../../src/features/documents/document-pdf-storage-core";
import {
  createAuthenticatedSupabaseClient,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  runE2eSqlSync,
} from "./helpers/supabase";

const org = "20000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000001";
const ids = {
  group: "97000000-0000-4000-8000-000000000001",
  litter: "97000000-0000-4000-8000-000000000002",
  emailTemplate: "97000000-0000-4000-8000-000000000003",
  contact: "97000000-0000-4000-8000-000000000004",
  app: "97000000-0000-4000-8000-000000000005",
  reservation: "97000000-0000-4000-8000-000000000006",
  paid: "97000000-0000-4000-8000-000000000007",
  active: "97000000-0000-4000-8000-000000000008",
  unrelatedPaid: "97000000-0000-4000-8000-000000000009",
  commitmentFamily: "97000000-0000-4000-8000-000000000010",
  commitmentTemplate: "97000000-0000-4000-8000-000000000011",
  contractFamily: "97000000-0000-4000-8000-000000000012",
  contractTemplate: "97000000-0000-4000-8000-000000000013",
  commitment: "97000000-0000-4000-8000-000000000014",
  contract: "97000000-0000-4000-8000-000000000015",
  commitmentV2: "97000000-0000-4000-8000-000000000016",
  contractV2: "97000000-0000-4000-8000-000000000017",
  variant: "97000000-0000-4000-8000-000000000018",
  variantVersion: "97000000-0000-4000-8000-000000000019",
} as const;

const capturedAt = "2026-07-17T10:15:00.000+02:00";
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const sql = (value: string) => runE2eSqlSync(value);

const commitmentDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "commitment_certificate",
  title: "Certificat campagne QA",
  introduction: ["Introduction."],
  sections: {
    animalNeeds: ["Besoins."],
    health: ["Santé."],
    educationAndBehavior: ["Éducation."],
    costsAndConstraints: ["Contraintes."],
    holderObligations: ["Obligations."],
  },
  acknowledgmentText: ["Reconnaissance."],
  signatureLabels: { holder: "Détenteur", issuer: "Cédant" },
};

const contractDefinition = {
  schemaVersion: 1,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat campagne QA",
  preamble: ["Préambule."],
  clauses: {
    reservationPurpose: ["Objet."],
    priceAndPayments: ["Prix."],
    deposit: ["Arrhes."],
    cancellationAndRefund: ["Annulation."],
    postponementAndCredit: ["Report."],
    potentialWithholding: ["Retenue."],
    finalConditions: ["Conditions finales."],
  },
  signatureLabels: { breeder: "Éleveur", reservingParty: "Réservant" },
};

type Supabase = Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>;
type DocumentType = "commitment_certificate" | "reservation_contract";

function fixtureRows({ active = false, email = "camille.birth@example.invalid" } = {}) {
  sql(`
    insert into public.litter_groups(id,organization_id,name,species,status,created_by,updated_by)
    values(${q(ids.group)},${q(org)},'E2E naissance groupe','dog','born',${q(owner)},${q(owner)});
    insert into public.litters(id,organization_id,litter_group_id,name,species,breed,status,actual_birth_date,created_by,updated_by)
    values(${q(ids.litter)},${q(org)},${q(ids.group)},'E2E naissance portée','dog','Golden Retriever','born','2026-07-10',${q(owner)},${q(owner)});
    insert into public.contacts(id,organization_id,contact_type,first_name,last_name,display_name,email,origin_channel,primary_status,created_by,updated_by)
    values(${q(ids.contact)},${q(org)},'person','Camille','Naissance','Camille Naissance',${email ? q(email) : "null"},'manual','active',${q(owner)},${q(owner)});
    insert into public.applications(id,organization_id,contact_id,species,breed,desired_litter_id,desired_litter_group_id,desired_sex_preference,desired_quantity,status,created_by,updated_by)
    values(${q(ids.app)},${q(org)},${q(ids.contact)},'dog','Golden Retriever',${q(ids.litter)},${q(ids.group)},'female_preferred_male_possible',1,'qualified',${q(owner)},${q(owner)});
    insert into public.reservations(id,organization_id,application_id,contact_id,litter_id,litter_group_id,species,breed,reserved_sex_preference,status,currency,created_by,updated_by)
    values(${q(ids.reservation)},${q(org)},${q(ids.app)},${q(ids.contact)},${q(ids.litter)},${q(ids.group)},'dog','Golden Retriever','female_preferred_male_possible','pre_reservation_paid','EUR',${q(owner)},${q(owner)});
    insert into public.payments(id,organization_id,contact_id,reservation_id,amount_cents,currency,payment_type,status,paid_at,payment_method,notes,created_by,updated_by)
    values(${q(ids.paid)},${q(org)},${q(ids.contact)},${q(ids.reservation)},25000,'EUR','pre_reservation_deposit_refundable','paid',now(),'bank_transfer','Demande 1/2 réglée',${q(owner)},${q(owner)});
    insert into public.email_templates(id,organization_id,template_key,title,category,subject,body,is_active,brevo_template_id,created_by,updated_by)
    values(${q(ids.emailTemplate)},${q(org)},'birth_documents_deposit','Contrat + certificat et complément d’arrhes','adopter_journey','Registre technique','Registre technique',true,765432,${q(owner)},${q(owner)});
    insert into public.document_template_families(id,organization_id,name,document_type,species,breed,created_by,updated_by)
    values
      (${q(ids.commitmentFamily)},${q(org)},'Certificat campagne QA','commitment_certificate','dog','Golden Retriever',${q(owner)},${q(owner)}),
      (${q(ids.contractFamily)},${q(org)},'Contrat campagne QA','reservation_contract','dog','Golden Retriever',${q(owner)},${q(owner)});
    insert into public.document_templates(id,organization_id,family_id,name,document_type,species,breed,template_format,template_content,version,lifecycle_status,is_active,published_at,published_by,created_by,updated_by)
    values
      (${q(ids.commitmentTemplate)},${q(org)},${q(ids.commitmentFamily)},'Certificat campagne QA','commitment_certificate','dog','Golden Retriever','json',${q(JSON.stringify(commitmentDefinition))},1,'published',true,now(),${q(owner)},${q(owner)},${q(owner)}),
      (${q(ids.contractTemplate)},${q(org)},${q(ids.contractFamily)},'Contrat campagne QA','reservation_contract','dog','Golden Retriever','json',${q(JSON.stringify(contractDefinition))},1,'published',true,now(),${q(owner)},${q(owner)},${q(owner)});
    ${active ? `insert into public.payments(id,organization_id,contact_id,reservation_id,amount_cents,currency,payment_type,status,payment_method,due_date,notes,created_by,updated_by) values(${q(ids.active)},${q(org)},${q(ids.contact)},${q(ids.reservation)},25000,'EUR','arrhes','requested','bank_transfer','2031-02-03','Demande 2/2 — complément d’arrhes [birth_documents_deposit:v1]',${q(owner)},${q(owner)});` : ""}
  `);
}

function snapshot(documentType: DocumentType, variant = false) {
  const definition = documentType === "commitment_certificate"
    ? commitmentDefinition
    : contractDefinition;
  const templateId = documentType === "commitment_certificate"
    ? ids.commitmentTemplate
    : ids.contractTemplate;
  const built = buildDocumentGenerationSnapshot({
    documentType,
    capturedAt,
    template: {
      id: templateId,
      selectedId: variant ? ids.variantVersion : templateId,
      version: 1,
      format: "json",
      documentType,
      content: JSON.stringify(definition),
      sourceKind: variant ? "reservation_variant" : "common",
      reservationDocumentVariantVersionId: variant ? ids.variantVersion : null,
      reservationDocumentVariantVersion: variant ? 1 : null,
    },
    sources: { organizationId: org, reservationId: ids.reservation, contactId: ids.contact, applicationId: ids.app, litterId: ids.litter, litterGroupId: ids.group },
    seller: { tradeName: "Élevage QA", country: "FR" },
    adopter: { displayName: "Camille Naissance", firstName: "Camille", lastName: "Naissance", email: "camille.birth@example.invalid", country: "FR" },
    adoptionProject: { species: "dog", breed: "Golden Retriever", sexPreference: "female_preferred_male_possible", litter: { id: ids.litter, name: "E2E naissance portée", actualBirthDate: "2026-07-10" }, litterGroup: { id: ids.group, name: "E2E naissance groupe" } },
    reservation: { id: ids.reservation, status: "pre_reservation_paid", createdAt: capturedAt },
    financials: documentType === "reservation_contract" ? { currency: "EUR", priceCents: null, paidCents: 25000, refundedCents: 0, depositPaidCents: 25000, fullDepositTargetCents: 50000 } : undefined,
  });
  if (!built.success) throw new Error(`Snapshot fixture failed: ${built.error}`);
  return built.snapshot;
}

async function createDocument(
  supabase: Supabase,
  documentType: DocumentType,
  documentId: string,
  version: number,
  options: { variant?: boolean; bytes?: Buffer; status?: string; partialMetadata?: boolean } = {},
) {
  const bytes = options.bytes ?? Buffer.from(`%PDF-1.4\n${documentType}-v${version}\n%%EOF`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const path = buildDocumentPdfPath(org, documentId, version, sha);
  if (!path) throw new Error("Invalid fixture PDF path");
  if (!options.partialMetadata) {
    const uploaded = await supabase.storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (uploaded.error) throw new Error(`Storage fixture failed: ${uploaded.error.message}`);
  }
  sql(`insert into public.documents(
      id,organization_id,template_id,generated_from_template,generated_at,generation_data,
      contact_id,application_id,reservation_id,litter_id,document_type,status,title,file_path,file_name,
      mime_type,file_size_bytes,file_sha256,source_template_version,reservation_document_variant_version_id,
      signature_required,created_by,updated_by
    ) values(
      ${q(documentId)},${q(org)},${q(documentType === "commitment_certificate" ? ids.commitmentTemplate : ids.contractTemplate)},true,${q(capturedAt)},${q(JSON.stringify(snapshot(documentType, options.variant)))}::jsonb,
      ${q(ids.contact)},${q(ids.app)},${q(ids.reservation)},${q(ids.litter)},${q(documentType)},${q(options.status ?? "to_generate")},${q(documentType)},
      ${options.partialMetadata ? "null" : q(path)},${options.partialMetadata ? "null" : q(`${sha}.pdf`)},${options.partialMetadata ? "null" : q("application/pdf")},${options.partialMetadata ? "null" : bytes.length},${options.partialMetadata ? "null" : q(sha)},1,${options.variant ? q(ids.variantVersion) : "null"},true,${q(owner)},${q(owner)}
    );`);
  return { bytes, sha, path, documentId, version };
}

async function createDocuments(supabase: Supabase, options: { variantContract?: boolean } = {}) {
  if (options.variantContract) {
    sql(`insert into public.reservation_document_variants(id,organization_id,reservation_id,template_family_id,document_type,species,breed,created_by,updated_by) values(${q(ids.variant)},${q(org)},${q(ids.reservation)},${q(ids.contractFamily)},'reservation_contract','dog','Golden Retriever',${q(owner)},${q(owner)});
      insert into public.reservation_document_variant_versions(id,organization_id,variant_id,version,source_template_id,source_template_version,template_format,template_content,lifecycle_status,published_at,published_by,created_by,updated_by) values(${q(ids.variantVersion)},${q(org)},${q(ids.variant)},1,${q(ids.contractTemplate)},1,'json',${q(JSON.stringify(contractDefinition))},'published',now(),${q(owner)},${q(owner)},${q(owner)});`);
  }
  const commitment = await createDocument(supabase, "commitment_certificate", ids.commitment, 1);
  const contract = await createDocument(supabase, "reservation_contract", ids.contract, 1, { variant: options.variantContract });
  return { commitment, contract };
}

async function storagePaths() {
  const value = sql(`select name from storage.objects where bucket_id='documents' and name like 'organizations/${org}/documents/97000000-0000-4000-8000-%';`);
  return value ? value.split("\n").filter(Boolean) : [];
}

async function cleanup(supabase: Supabase) {
  const paths = await storagePaths();
  if (paths.length) {
    const removed = await supabase.storage.from("documents").remove(paths);
    if (removed.error) throw new Error(`Storage cleanup failed: ${removed.error.message}`);
  }
  sql(`delete from public.email_delivery_attempts where reservation_id=${q(ids.reservation)}::uuid;
    delete from public.payments where reservation_id=${q(ids.reservation)}::uuid;
    delete from public.documents where reservation_id=${q(ids.reservation)}::uuid;
    delete from public.reservation_document_variant_versions where id=${q(ids.variantVersion)}::uuid;
    delete from public.reservation_document_variants where id=${q(ids.variant)}::uuid;
    delete from public.document_templates where id in (${q(ids.commitmentTemplate)}::uuid,${q(ids.contractTemplate)}::uuid);
    delete from public.document_template_families where id in (${q(ids.commitmentFamily)}::uuid,${q(ids.contractFamily)}::uuid);
    delete from public.reservations where id=${q(ids.reservation)}::uuid;
    delete from public.applications where id=${q(ids.app)}::uuid;
    delete from public.contacts where id=${q(ids.contact)}::uuid;
    delete from public.email_templates where id=${q(ids.emailTemplate)}::uuid;
    delete from public.litters where id=${q(ids.litter)}::uuid;
    delete from public.litter_groups where id=${q(ids.group)}::uuid;`);
}

function remaining() {
  return Number(sql(`select count(*) from (
    select id from public.email_delivery_attempts where reservation_id=${q(ids.reservation)}::uuid
    union all select id from public.payments where reservation_id=${q(ids.reservation)}::uuid
    union all select id from public.documents where reservation_id=${q(ids.reservation)}::uuid
    union all select id from public.reservation_document_variants where id=${q(ids.variant)}::uuid
    union all select id from public.document_templates where id in (${q(ids.commitmentTemplate)}::uuid,${q(ids.contractTemplate)}::uuid)
    union all select id from public.document_template_families where id in (${q(ids.commitmentFamily)}::uuid,${q(ids.contractFamily)}::uuid)
    union all select id from public.reservations where id=${q(ids.reservation)}::uuid
    union all select id from public.applications where id=${q(ids.app)}::uuid
    union all select id from public.contacts where id=${q(ids.contact)}::uuid
    union all select id from public.email_templates where id=${q(ids.emailTemplate)}::uuid
    union all select id from public.litters where id=${q(ids.litter)}::uuid
    union all select id from public.litter_groups where id=${q(ids.group)}::uuid
    union all select id from storage.objects where bucket_id='documents' and name like 'organizations/${org}/documents/97000000-0000-4000-8000-%'
  ) fixtures;`));
}

async function fixture(supabase: Supabase, options: { active?: boolean; email?: string; documents?: boolean; variantContract?: boolean } = {}) {
  await cleanup(supabase);
  fixtureRows(options);
  return options.documents === false ? null : createDocuments(supabase, options);
}

function transport(mode: "success" | "certain" | "uncertain" = "success") {
  const sends: Parameters<BirthDocumentsDepositEmailTransport["sendEmail"]>[0][] = [];
  const value: BirthDocumentsDepositEmailTransport = {
    isConfigured: () => true,
    getTemplate: async (id) => ({ ok: true, template: { id, name: "QA", subject: "Sujet Brevo QA", isActive: true, modifiedAt: "2026-07-12T10:00:00Z", sender: null, replyTo: null } }),
    sendEmail: async (input) => {
      sends.push(input);
      if (mode === "certain") return { ok: false, reason: "invalid_request" };
      if (mode === "uncertain") return { ok: false, reason: "timeout" };
      return { ok: true, messageId: "qa-birth-1" };
    },
  };
  return { value, sends };
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Mot de passe").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/candidatures/, { timeout: 20_000 });
}

test("sends exactly the two authoritative PDFs in order and atomically marks them sent", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  const docs = await fixture(supabase, { variantContract: true });
  const t = transport();
  try {
    const result = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: t.value },
    );
    expect(result).toMatchObject({ status: "success", paymentAction: "created" });
    expect(t.sends).toHaveLength(1);
    expect(t.sends[0].attachments).toEqual([
      { name: "certificat-engagement-v1.pdf", content: docs!.commitment.bytes.toString("base64") },
      { name: "contrat-reservation-v1.pdf", content: docs!.contract.bytes.toString("base64") },
    ]);
    const manifest = JSON.parse(sql(`select attachments_snapshot::text from public.email_delivery_attempts where reservation_id=${q(ids.reservation)}::uuid;`));
    expect(manifest.map((entry: Record<string, unknown>) => [entry.document_id, entry.file_name, entry.version])).toEqual([
      [ids.commitment, "certificat-engagement-v1.pdf", 1],
      [ids.contract, "contrat-reservation-v1.pdf", 1],
    ]);
    expect(sql(`select count(distinct sent_at) || ':' || string_agg(distinct status, ',') from public.documents where reservation_id=${q(ids.reservation)}::uuid;`)).toBe("1:sent");
    const persisted = sql(`select row_to_json(attempt)::text from public.email_delivery_attempts attempt where reservation_id=${q(ids.reservation)}::uuid;`);
    expect(persisted).not.toContain(docs!.commitment.bytes.toString("base64"));
    expect(persisted).not.toContain(docs!.contract.bytes.toString("base64"));
  } finally { await cleanup(supabase); expect(remaining()).toBe(0); }
});

test("missing, duplicated, incomplete and non-sendable documents fail before payment mutation", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  try {
    await fixture(supabase, { documents: false });
    await createDocument(supabase, "reservation_contract", ids.contract, 1);
    let result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: transport().value });
    expect(result.status).toBe("missing_documents");
    expect(sql(`select count(*) from public.payments where reservation_id=${q(ids.reservation)}::uuid and payment_type='arrhes';`)).toBe("0");

    await cleanup(supabase); fixtureRows();
    await createDocument(supabase, "commitment_certificate", ids.commitment, 1);
    result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: transport().value });
    expect(result.status).toBe("missing_documents");
    expect(sql(`select count(*) from public.payments where reservation_id=${q(ids.reservation)}::uuid and payment_type='arrhes';`)).toBe("0");

    await cleanup(supabase); fixtureRows();
    await createDocument(supabase, "commitment_certificate", ids.commitment, 1, { partialMetadata: true });
    await createDocument(supabase, "reservation_contract", ids.contract, 1);
    result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: transport().value });
    expect(result.status).toBe("incoherent_documents");

    sql(`delete from public.documents where id=${q(ids.commitment)}::uuid; update public.documents set status='sent',sent_at=now() where id=${q(ids.contract)}::uuid; update public.documents set status='signed',signed_at=now() where id=${q(ids.contract)}::uuid;`);
    await createDocument(supabase, "commitment_certificate", ids.commitment, 1);
    result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: transport().value });
    expect(result.status).toBe("documents_not_sendable");

    const base = sql(`select row_to_json(document)::text from public.documents document where id=${q(ids.commitment)}::uuid;`);
    const row = JSON.parse(base);
    const contractRow = JSON.parse(sql(`select row_to_json(document)::text from public.documents document where id=${q(ids.contract)}::uuid;`));
    expect(assessBirthDocumentsDepositDocumentRows({ organizationId: org, reservationId: ids.reservation, documents: [row, row, contractRow] })).toEqual({ ok: false, errorCode: "incoherent_documents" });
    expect(assessBirthDocumentsDepositDocumentRows({ organizationId: org, reservationId: "97000000-0000-4000-8000-000000000099", documents: [row, { ...contractRow, status: "to_generate" }] })).toEqual({ ok: false, errorCode: "incoherent_documents" });
    expect(sql(`select count(*) from public.payments where reservation_id=${q(ids.reservation)}::uuid and payment_type='arrhes';`)).toBe("0");
  } finally { await cleanup(supabase); expect(remaining()).toBe(0); }
});

test("hash, stored bytes and manifest drift are rejected before Brevo", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  const docs = await fixture(supabase);
  try {
    sql(`update public.documents set file_size_bytes=file_size_bytes+1 where id=${q(ids.commitment)}::uuid;`);
    const t = transport();
    let result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: t.value });
    expect(result.status).toBe("incoherent_documents"); expect(t.sends).toHaveLength(0);
    sql(`update public.documents set file_size_bytes=file_size_bytes-1 where id=${q(ids.commitment)}::uuid;`);
    const corrupted = await supabase.storage.from("documents").update(docs!.commitment.path, Buffer.from("%PDF-1.4\ncorrupted bytes\n%%EOF"), { contentType: "application/pdf" });
    if (corrupted.error) throw new Error(corrupted.error.message);
    result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: t.value });
    expect(result.status).toBe("incoherent_documents"); expect(t.sends).toHaveLength(0);
    await cleanup(supabase);
    await fixture(supabase);
    const failed = transport("certain");
    result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: failed.value });
    expect(result).toMatchObject({ deliveryState: "not_sent", compensated: true });
    sql(`update public.documents set file_size_bytes=file_size_bytes+1 where id=${q(ids.commitment)}::uuid;`);
    const retry = transport();
    result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: retry.value });
    expect(result.status).toBe("incoherent_documents"); expect(retry.sends).toHaveLength(0);
  } finally { await cleanup(supabase); expect(remaining()).toBe(0); }
});

test("certain failure compensates payment while uncertainty preserves payment, manifest and documents", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  try {
    await fixture(supabase);
    let result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: transport("certain").value });
    expect(result).toMatchObject({ deliveryState: "not_sent", compensated: true });
    expect(sql(`select string_agg(status, ',' order by document_type) from public.documents where reservation_id=${q(ids.reservation)}::uuid;`)).toBe("to_generate,to_generate");
    await cleanup(supabase);
    await fixture(supabase);
    result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: transport("uncertain").value });
    expect(result).toMatchObject({ deliveryState: "uncertain", compensated: false });
    expect(sql(`select status || ':' || jsonb_array_length(attachments_snapshot) from public.email_delivery_attempts where reservation_id=${q(ids.reservation)}::uuid;`)).toBe("sending:2");
    expect(sql(`select count(*) from public.payments where reservation_id=${q(ids.reservation)}::uuid and payment_type='arrhes' and deleted_at is null;`)).toBe("1");
    expect(sql(`select count(*) from public.documents where reservation_id=${q(ids.reservation)}::uuid and status='to_generate';`)).toBe("2");
  } finally { await cleanup(supabase); expect(remaining()).toBe(0); }
});

test("post-provider callback failure is uncertain; final attempt failure leaves both documents sent", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  try {
    await fixture(supabase);
    let result = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: transport().value, documentDelivery: async () => ({ ok: false, errorCode: "qa_delivery_failure" }) },
    );
    expect(result).toMatchObject({ deliveryState: "uncertain", errorCode: "qa_delivery_failure", compensated: false });
    expect(sql(`select count(*) from public.documents where reservation_id=${q(ids.reservation)}::uuid and status='to_generate';`)).toBe("2");
    await cleanup(supabase);
    await fixture(supabase);
    result = await sendBirthDocumentsDepositEmailForReservation(
      { reservationId: ids.reservation, litterId: ids.litter },
      { supabase, transport: transport().value, transitions: { markSent: async () => ({ outcome: "error", error: { code: "database_error", message: "QA" } }) } },
    );
    expect(result.deliveryState).toBe("uncertain");
    expect(sql(`select status from public.email_delivery_attempts where reservation_id=${q(ids.reservation)}::uuid;`)).toBe("sending");
    expect(sql(`select count(*) from public.documents where reservation_id=${q(ids.reservation)}::uuid and status='sent';`)).toBe("2");
  } finally { await cleanup(supabase); expect(remaining()).toBe(0); }
});

test("retry reuses the photographed historical versions and exact bytes", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  const initial = await fixture(supabase);
  try {
    await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: transport("certain").value });
    sql(`update public.documents set superseded_at=now() where id in (${q(ids.commitment)}::uuid,${q(ids.contract)}::uuid);`);
    await createDocument(supabase, "commitment_certificate", ids.commitmentV2, 2, { bytes: Buffer.from("%PDF-1.4\nnew commitment\n%%EOF") });
    await createDocument(supabase, "reservation_contract", ids.contractV2, 2, { bytes: Buffer.from("%PDF-1.4\nnew contract\n%%EOF") });
    const retry = transport();
    const result = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: retry.value });
    expect(result.status).toBe("success");
    expect(retry.sends[0].attachments).toEqual([
      { name: "certificat-engagement-v1.pdf", content: initial!.commitment.bytes.toString("base64") },
      { name: "contrat-reservation-v1.pdf", content: initial!.contract.bytes.toString("base64") },
    ]);
    expect(sql(`select count(*) from public.documents where id in (${q(ids.commitmentV2)}::uuid,${q(ids.contractV2)}::uuid) and status='to_generate';`)).toBe("2");
  } finally { await cleanup(supabase); expect(remaining()).toBe(0); }
});

test("an historical sent attempt with an empty manifest remains blocking", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  await fixture(supabase, { documents: false });
  try {
    const first = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: transport().value });
    expect(first.status).toBe("missing_documents");
    sql(`update public.email_delivery_attempts set status='sent',sent_at=now(),last_error_code=null where reservation_id=${q(ids.reservation)}::uuid;`);
    await createDocuments(supabase);
    const t = transport();
    const retried = await sendBirthDocumentsDepositEmailForReservation({ reservationId: ids.reservation, litterId: ids.litter }, { supabase, transport: t.value });
    expect(retried.status).toBe("already_sent"); expect(t.sends).toHaveLength(0);
  } finally { await cleanup(supabase); expect(remaining()).toBe(0); }
});

test("the litter interface shows exact versions, neutral ineligibility and no technical identifiers at 390px", async ({ page }) => {
  test.setTimeout(60_000);
  const supabase = await createAuthenticatedSupabaseClient();
  await fixture(supabase);
  try {
    await login(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/litters/${ids.litter}`);
    await page.getByText("Campagnes d’e-mails").click();
    await page.getByRole("button", { name: "Préparer le complément et envoyer via Brevo" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText(/Camille Naissance — variables prévisualisées/).click();
    await expect(dialog.getByText("Certificat d’engagement — version 1")).toBeVisible();
    await expect(dialog.getByText("Contrat de réservation — version 1")).toBeVisible();
    await expect(dialog.getByText("Les deux PDF exacts affichés seront joints à l’e-mail Brevo.")).toBeVisible();
    await expect(dialog).not.toContainText(ids.commitment);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Annuler" }).click();
    sql(`update public.documents set status='sent',sent_at=now() where id in (${q(ids.commitment)}::uuid,${q(ids.contract)}::uuid);`);
    await page.reload(); await page.getByText("Campagnes d’e-mails").click();
    await expect(page.getByText("Inéligible : documents déjà envoyés ou non envoyables")).toBeVisible();
  } finally { await cleanup(supabase); expect(remaining()).toBe(0); }
});
