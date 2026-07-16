import { expect, test } from "@playwright/test";

import type { Database } from "../../src/types/database.types";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";
const prefix = "9e160100-0000-4000-8000-0000000000";
const hash = "b".repeat(64);

const ids = {
  otherOrganization: `${prefix}01`,
  contact: `${prefix}02`,
  otherContact: `${prefix}03`,
  reservationCommon: `${prefix}10`,
  reservationOne: `${prefix}11`,
  reservationTwo: `${prefix}12`,
  reservationSent: `${prefix}13`,
  reservationReplace: `${prefix}14`,
  otherReservation: `${prefix}15`,
  familyA: `${prefix}20`,
  familyB: `${prefix}21`,
  otherFamily: `${prefix}22`,
  templateA: `${prefix}30`,
  templateB: `${prefix}31`,
  otherTemplate: `${prefix}32`,
  variantOneA: `${prefix}40`,
  variantOneB: `${prefix}41`,
  variantTwoA: `${prefix}42`,
  variantSentA: `${prefix}43`,
  variantSentB: `${prefix}44`,
  variantReplaceA: `${prefix}45`,
  variantReplaceB: `${prefix}46`,
  otherVariant: `${prefix}47`,
  versionOnePublished: `${prefix}50`,
  versionOneDraft: `${prefix}51`,
  versionOneAlternative: `${prefix}52`,
  versionTwoPublished: `${prefix}53`,
  versionSentA: `${prefix}54`,
  versionSentB: `${prefix}55`,
  versionReplaceA: `${prefix}56`,
  versionReplaceB: `${prefix}57`,
  otherVersion: `${prefix}58`,
  versionOneDeleted: `${prefix}59`,
  commonDocument: `${prefix}60`,
  validDocument: `${prefix}61`,
  sentDocument: `${prefix}62`,
  replacementInitial: `${prefix}63`,
  replacementNext: `${prefix}64`,
  legacyDocument: `${prefix}65`,
  rejectedDraft: `${prefix}70`,
  rejectedReservation: `${prefix}71`,
  rejectedOrganization: `${prefix}72`,
  rejectedType: `${prefix}73`,
  rejectedSource: `${prefix}74`,
  rejectedGenerated: `${prefix}75`,
  rejectedMissingReservation: `${prefix}76`,
  rejectedDeleted: `${prefix}77`,
} as const;

type StoreArgs = Database["public"]["Functions"]["store_document_pdf_version"]["Args"];

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(value: string) {
  return runE2eSqlSync(value);
}

function content(title: string) {
  return JSON.stringify({
    schemaVersion: 2,
    locale: "fr-FR",
    documentType: "reservation_contract",
    title,
    body: `Corps ${title}`,
  });
}

function expectSqlFailure(value: string, expected: RegExp) {
  expect(() => sql(value)).toThrow(expected);
}

function cleanup() {
  sql(`
    delete from public.documents
    where id::text like '9e160100-%' and replaces_document_id is not null;
    delete from public.documents where id::text like '9e160100-%';
    delete from public.reservation_document_variant_versions
    where id::text like '9e160100-%' or variant_id::text like '9e160100-%';
    delete from public.reservation_document_variants where id::text like '9e160100-%';
    delete from public.document_templates where id::text like '9e160100-%';
    delete from public.document_template_families where id::text like '9e160100-%';
    delete from public.reservations where id::text like '9e160100-%';
    delete from public.contacts where id::text like '9e160100-%';
    delete from public.organizations where id::text like '9e160100-%';
  `);
}

function fixtureCounts() {
  return JSON.parse(sql(`
    select json_build_object(
      'storage_objects', (select count(*) from storage.objects
        where bucket_id = 'documents' and name like 'organizations/%/documents/9e160100-%'),
      'documents', (select count(*) from public.documents where id::text like '9e160100-%'),
      'variant_versions', (select count(*) from public.reservation_document_variant_versions
        where id::text like '9e160100-%' or variant_id::text like '9e160100-%'),
      'variants', (select count(*) from public.reservation_document_variants where id::text like '9e160100-%'),
      'templates', (select count(*) from public.document_templates where id::text like '9e160100-%'),
      'families', (select count(*) from public.document_template_families where id::text like '9e160100-%'),
      'reservations', (select count(*) from public.reservations where id::text like '9e160100-%'),
      'contacts', (select count(*) from public.contacts where id::text like '9e160100-%'),
      'organizations', (select count(*) from public.organizations where id::text like '9e160100-%')
    )::text;
  `)) as Record<string, number>;
}

function expectClean() {
  expect(fixtureCounts()).toEqual({
    storage_objects: 0,
    documents: 0,
    variant_versions: 0,
    variants: 0,
    templates: 0,
    families: 0,
    reservations: 0,
    contacts: 0,
    organizations: 0,
  });
}

function createFixtures() {
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.otherOrganization)}::uuid, 'Organisation usage variante E2E', 'variant-usage-other-e2e');

    insert into public.contacts (id, organization_id, display_name) values
      (${q(ids.contact)}::uuid, ${q(organizationId)}::uuid, 'Contact usage variante E2E'),
      (${q(ids.otherContact)}::uuid, ${q(ids.otherOrganization)}::uuid, 'Contact variante autre organisation');

    insert into public.reservations (id, organization_id, contact_id, species, breed) values
      (${q(ids.reservationCommon)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, 'dog', 'Golden Retriever'),
      (${q(ids.reservationOne)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, 'dog', 'Golden Retriever'),
      (${q(ids.reservationTwo)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, 'dog', 'Golden Retriever'),
      (${q(ids.reservationSent)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, 'dog', 'Golden Retriever'),
      (${q(ids.reservationReplace)}::uuid, ${q(organizationId)}::uuid, ${q(ids.contact)}::uuid, 'dog', 'Golden Retriever'),
      (${q(ids.otherReservation)}::uuid, ${q(ids.otherOrganization)}::uuid, ${q(ids.otherContact)}::uuid, 'dog', 'Golden Retriever');

    insert into public.document_template_families (
      id, organization_id, name, document_type, species, breed, created_by, updated_by
    ) values
      (${q(ids.familyA)}::uuid, ${q(organizationId)}::uuid, 'Contrat source A', 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.familyB)}::uuid, ${q(organizationId)}::uuid, 'Contrat source B', 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherFamily)}::uuid, ${q(ids.otherOrganization)}::uuid, 'Contrat autre organisation', 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.document_templates (
      id, organization_id, family_id, name, document_type, species, breed,
      template_format, template_content, version, lifecycle_status, is_active,
      published_at, published_by, created_by, updated_by
    ) values
      (${q(ids.templateA)}::uuid, ${q(organizationId)}::uuid, ${q(ids.familyA)}::uuid, 'Contrat source A', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(content("Source A"))}, 1, 'published', true, now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.templateB)}::uuid, ${q(organizationId)}::uuid, ${q(ids.familyB)}::uuid, 'Contrat source B', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(content("Source B"))}, 1, 'published', true, now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherTemplate)}::uuid, ${q(ids.otherOrganization)}::uuid, ${q(ids.otherFamily)}::uuid, 'Contrat autre organisation', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(content("Autre organisation"))}, 1, 'published', true, now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.reservation_document_variants (
      id, organization_id, reservation_id, template_family_id,
      document_type, species, breed, created_by, updated_by
    ) values
      (${q(ids.variantOneA)}::uuid, ${q(organizationId)}::uuid, ${q(ids.reservationOne)}::uuid, ${q(ids.familyA)}::uuid, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.variantOneB)}::uuid, ${q(organizationId)}::uuid, ${q(ids.reservationOne)}::uuid, ${q(ids.familyB)}::uuid, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.variantTwoA)}::uuid, ${q(organizationId)}::uuid, ${q(ids.reservationTwo)}::uuid, ${q(ids.familyA)}::uuid, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.variantSentA)}::uuid, ${q(organizationId)}::uuid, ${q(ids.reservationSent)}::uuid, ${q(ids.familyA)}::uuid, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.variantSentB)}::uuid, ${q(organizationId)}::uuid, ${q(ids.reservationSent)}::uuid, ${q(ids.familyB)}::uuid, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.variantReplaceA)}::uuid, ${q(organizationId)}::uuid, ${q(ids.reservationReplace)}::uuid, ${q(ids.familyA)}::uuid, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.variantReplaceB)}::uuid, ${q(organizationId)}::uuid, ${q(ids.reservationReplace)}::uuid, ${q(ids.familyB)}::uuid, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherVariant)}::uuid, ${q(ids.otherOrganization)}::uuid, ${q(ids.otherReservation)}::uuid, ${q(ids.otherFamily)}::uuid, 'reservation_contract', 'dog', 'Golden Retriever', ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.reservation_document_variant_versions (
      id, organization_id, variant_id, version, source_template_id,
      source_template_version, template_format, template_content,
      lifecycle_status, published_at, published_by, created_by, updated_by
    ) values
      (${q(ids.versionOnePublished)}::uuid, ${q(organizationId)}::uuid, ${q(ids.variantOneA)}::uuid, 1, ${q(ids.templateA)}::uuid, 1, 'json', ${q(content("Variante publiée A"))}, 'published', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.versionOneDraft)}::uuid, ${q(organizationId)}::uuid, ${q(ids.variantOneA)}::uuid, 2, ${q(ids.templateA)}::uuid, 1, 'json', ${q(content("Variante brouillon"))}, 'draft', null, null, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.versionOneAlternative)}::uuid, ${q(organizationId)}::uuid, ${q(ids.variantOneB)}::uuid, 1, ${q(ids.templateB)}::uuid, 1, 'json', ${q(content("Variante publiée B"))}, 'published', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.versionTwoPublished)}::uuid, ${q(organizationId)}::uuid, ${q(ids.variantTwoA)}::uuid, 1, ${q(ids.templateA)}::uuid, 1, 'json', ${q(content("Variante réservation 2"))}, 'published', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.versionSentA)}::uuid, ${q(organizationId)}::uuid, ${q(ids.variantSentA)}::uuid, 1, ${q(ids.templateA)}::uuid, 1, 'json', ${q(content("Variante envoyée A"))}, 'published', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.versionSentB)}::uuid, ${q(organizationId)}::uuid, ${q(ids.variantSentB)}::uuid, 1, ${q(ids.templateB)}::uuid, 1, 'json', ${q(content("Variante envoyée B"))}, 'published', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.versionReplaceA)}::uuid, ${q(organizationId)}::uuid, ${q(ids.variantReplaceA)}::uuid, 1, ${q(ids.templateA)}::uuid, 1, 'json', ${q(content("Variante remplacement A"))}, 'published', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.versionReplaceB)}::uuid, ${q(organizationId)}::uuid, ${q(ids.variantReplaceB)}::uuid, 1, ${q(ids.templateB)}::uuid, 1, 'json', ${q(content("Variante remplacement B"))}, 'published', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid),
      (${q(ids.otherVersion)}::uuid, ${q(ids.otherOrganization)}::uuid, ${q(ids.otherVariant)}::uuid, 1, ${q(ids.otherTemplate)}::uuid, 1, 'json', ${q(content("Variante autre organisation"))}, 'published', now(), ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid);

    insert into public.reservation_document_variant_versions (
      id, organization_id, variant_id, version, source_template_id,
      source_template_version, template_format, template_content,
      lifecycle_status, published_at, published_by, created_by, updated_by, deleted_at
    ) values (
      ${q(ids.versionOneDeleted)}::uuid, ${q(organizationId)}::uuid,
      ${q(ids.variantOneA)}::uuid, 3, ${q(ids.templateA)}::uuid, 1,
      'json', ${q(content("Variante supprimée"))}, 'published', now(),
      ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, ${q(ownerId)}::uuid, now()
    );

    insert into public.documents (
      id, organization_id, document_type, status, title, reservation_document_variant_version_id
    ) values (
      ${q(ids.legacyDocument)}::uuid, ${q(organizationId)}::uuid,
      'other', 'uploaded', 'Ancienne ligne compatible', null
    );
  `);
}

function storeArgs(
  documentId: string,
  reservationId: string | null,
  templateId: string | null,
  variantVersionId?: string | null,
  overrides: Partial<StoreArgs> = {},
): StoreArgs {
  const version = overrides.p_version ?? 1;
  return {
    p_organization_id: organizationId,
    p_document_id: documentId,
    p_replaces_document_id: null,
    p_version: version,
    p_document_type: "reservation_contract",
    p_title: `Document ${documentId}`,
    p_file_path: `organizations/${organizationId}/documents/${documentId}/v${version}/${hash}.pdf`,
    p_file_sha256: hash,
    p_file_size_bytes: 42,
    p_contact_id: ids.contact,
    p_reservation_id: reservationId,
    p_template_id: templateId,
    p_generated_from_template: true,
    p_generated_at: "2026-07-16T12:00:00.000Z",
    p_source_template_version: templateId ? 1 : null,
    p_generation_data: { source: "document-variant-usage-e2e" },
    p_signature_required: true,
    ...(variantVersionId === undefined
      ? {}
      : { p_reservation_document_variant_version_id: variantVersionId }),
    ...overrides,
  };
}

test("links exact published variant versions to stored documents and cleans every fixture", async () => {
  cleanup();
  expectClean();

  try {
    createFixtures();
    const owner = await createAuthenticatedSupabaseClient();

    const common = await owner.rpc(
      "store_document_pdf_version",
      storeArgs(ids.commonDocument, ids.reservationCommon, ids.templateA),
    );
    expect(common.error).toBeNull();
    expect(common.data).toEqual([{ outcome: "created", document_id: ids.commonDocument }]);
    expect(sql(`select reservation_document_variant_version_id is null from public.documents where id = ${q(ids.commonDocument)}::uuid;`)).toBe("t");
    expect(sql(`select reservation_document_variant_version_id is null from public.documents where id = ${q(ids.legacyDocument)}::uuid;`)).toBe("t");

    const validArgs = storeArgs(
      ids.validDocument,
      ids.reservationOne,
      ids.templateA,
      ids.versionOnePublished,
    );
    const valid = await owner.rpc("store_document_pdf_version", validArgs);
    expect(valid.error).toBeNull();
    expect(valid.data).toEqual([{ outcome: "created", document_id: ids.validDocument }]);

    const replay = await owner.rpc("store_document_pdf_version", validArgs);
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual([{ outcome: "existing", document_id: ids.validDocument }]);

    const conflict = await owner.rpc("store_document_pdf_version", {
      ...validArgs,
      p_template_id: ids.templateB,
      p_reservation_document_variant_version_id: ids.versionOneAlternative,
    });
    expect(conflict.error?.message).toMatch(/conflicts with existing metadata/);

    for (const [documentId, args, expected] of [
      [ids.rejectedDraft, storeArgs(ids.rejectedDraft, ids.reservationOne, ids.templateA, ids.versionOneDraft), /published non-deleted/],
      [ids.rejectedReservation, storeArgs(ids.rejectedReservation, ids.reservationOne, ids.templateA, ids.versionTwoPublished), /match the reservation/],
      [ids.rejectedOrganization, storeArgs(ids.rejectedOrganization, ids.reservationOne, ids.templateA, ids.otherVersion), /belong to the document organization/],
      [ids.rejectedType, storeArgs(ids.rejectedType, ids.reservationOne, ids.templateA, ids.versionOnePublished, { p_document_type: "commitment_certificate" }), /match the reservation and document type/],
      [ids.rejectedSource, storeArgs(ids.rejectedSource, ids.reservationOne, ids.templateB, ids.versionOnePublished), /match the exact variant source/],
      [ids.rejectedGenerated, storeArgs(ids.rejectedGenerated, ids.reservationOne, ids.templateA, ids.versionOnePublished, { p_generated_from_template: false, p_generated_at: null }), /requires a generated reservation document/],
      [ids.rejectedMissingReservation, storeArgs(ids.rejectedMissingReservation, null, ids.templateA, ids.versionOnePublished), /requires a generated reservation document/],
      [ids.rejectedDeleted, storeArgs(ids.rejectedDeleted, ids.reservationOne, ids.templateA, ids.versionOneDeleted), /published non-deleted/],
    ] as const) {
      const rejected = await owner.rpc("store_document_pdf_version", args);
      expect(rejected.error?.message, documentId).toMatch(expected);
      expect(sql(`select count(*) from public.documents where id = ${q(documentId)}::uuid;`)).toBe("0");
    }

    expect(sql(`select public.reservation_document_variant_version_is_used(${q(organizationId)}::uuid, ${q(ids.versionOnePublished)}::uuid);`)).toBe("t");
    sql(`update public.documents set deleted_at = now() where id = ${q(ids.validDocument)}::uuid;`);
    expect(sql(`select public.reservation_document_variant_version_is_used(${q(organizationId)}::uuid, ${q(ids.versionOnePublished)}::uuid);`)).toBe("t");
    sql(`update public.reservation_document_variant_versions set lifecycle_status = 'retired' where id = ${q(ids.versionOnePublished)}::uuid;`);
    expect(sql(`select lifecycle_status || '|' || public.reservation_document_variant_version_is_used(${q(organizationId)}::uuid, id)::text from public.reservation_document_variant_versions where id = ${q(ids.versionOnePublished)}::uuid;`)).toBe("retired|true");
    expectSqlFailure(`update public.reservation_document_variant_versions set template_content = ${q(content("Mutation interdite"))} where id = ${q(ids.versionOnePublished)}::uuid;`, /immutable/);

    const sent = await owner.rpc(
      "store_document_pdf_version",
      storeArgs(ids.sentDocument, ids.reservationSent, ids.templateA, ids.versionSentA),
    );
    expect(sent.error).toBeNull();
    sql(`update public.documents set status = 'sent', sent_at = now() where id = ${q(ids.sentDocument)}::uuid;`);
    expectSqlFailure(`update public.documents set template_id = ${q(ids.templateB)}::uuid, source_template_version = 1, reservation_document_variant_version_id = ${q(ids.versionSentB)}::uuid where id = ${q(ids.sentDocument)}::uuid;`, /content and origin are immutable/);
    sql(`update public.documents set status = 'signed', signed_at = now() where id = ${q(ids.sentDocument)}::uuid;`);
    expectSqlFailure(`update public.documents set reservation_document_variant_version_id = null where id = ${q(ids.sentDocument)}::uuid;`, /content and origin are immutable/);

    const initial = await owner.rpc(
      "store_document_pdf_version",
      storeArgs(ids.replacementInitial, ids.reservationReplace, ids.templateA, ids.versionReplaceA),
    );
    expect(initial.error).toBeNull();
    const successorArgs = storeArgs(
      ids.replacementNext,
      ids.reservationReplace,
      ids.templateB,
      ids.versionReplaceB,
      { p_replaces_document_id: ids.replacementInitial, p_version: 2 },
    );
    const successor = await owner.rpc("store_document_pdf_version", successorArgs);
    expect(successor.error).toBeNull();
    expect(successor.data).toEqual([{ outcome: "created", document_id: ids.replacementNext }]);
    expect(sql(`select string_agg(id::text || ':' || source_template_version::text || ':' || reservation_document_variant_version_id::text, ',' order by id) from public.documents where id in (${q(ids.replacementInitial)}::uuid, ${q(ids.replacementNext)}::uuid);`)).toContain(ids.versionReplaceA);
    expect(sql(`select string_agg(id::text || ':' || source_template_version::text || ':' || reservation_document_variant_version_id::text, ',' order by id) from public.documents where id in (${q(ids.replacementInitial)}::uuid, ${q(ids.replacementNext)}::uuid);`)).toContain(ids.versionReplaceB);
    expect(sql(`select (select superseded_at is not null from public.documents where id = ${q(ids.replacementInitial)}::uuid)::text || '|' || (select replaces_document_id = ${q(ids.replacementInitial)}::uuid from public.documents where id = ${q(ids.replacementNext)}::uuid)::text;`)).toBe("true|true");

    console.info(`document-variant-usage fixtures: ${Object.values(ids).join(",")}`);
  } finally {
    cleanup();
    expectClean();
  }
});
