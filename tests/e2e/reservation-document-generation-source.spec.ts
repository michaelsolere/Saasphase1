import { expect, test } from "@playwright/test";

import { resolveReservationDocumentGenerationSourceCore } from "../../src/features/documents/resolve-reservation-document-generation-source-core";
import {
  createAuthenticatedSupabaseClient,
  runE2eSqlSync,
} from "./helpers/supabase";

const ids = {
  organization: "6e160000-0000-4000-8000-000000000001",
  membership: "6e160000-0000-4000-8000-000000000002",
  contact: "6e160000-0000-4000-8000-000000000003",
  reservation: "6e160000-0000-4000-8000-000000000004",
  otherReservation: "6e160000-0000-4000-8000-000000000005",
  family: "6e160000-0000-4000-8000-000000000006",
  template: "6e160000-0000-4000-8000-000000000007",
  otherFamily: "6e160000-0000-4000-8000-000000000008",
  otherTemplate: "6e160000-0000-4000-8000-000000000009",
  inactiveFamily: "6e160000-0000-4000-8000-000000000010",
  inactiveTemplate: "6e160000-0000-4000-8000-000000000011",
  variant: "6e160000-0000-4000-8000-000000000012",
  publication: "6e160000-0000-4000-8000-000000000013",
  otherReservationVariant: "6e160000-0000-4000-8000-000000000014",
  otherReservationPublication: "6e160000-0000-4000-8000-000000000015",
  otherFamilyVariant: "6e160000-0000-4000-8000-000000000016",
  otherFamilyPublication: "6e160000-0000-4000-8000-000000000017",
  originTemplate: "6e160000-0000-4000-8000-000000000018",
} as const;

const ownerId = "10000000-0000-4000-8000-000000000001";
const commonContent = JSON.stringify({
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat commun résolveur",
  body: "Contenu commun.",
});
const variantContent = JSON.stringify({
  schemaVersion: 2,
  locale: "fr-FR",
  documentType: "reservation_contract",
  title: "Contrat personnalisé résolveur",
  body: "Contenu personnalisé.",
});

function q(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function sql(statement: string) {
  return runE2eSqlSync(statement);
}

function cleanup() {
  sql(`
    delete from public.documents where organization_id = ${q(ids.organization)}::uuid;
    delete from public.reservation_document_variant_versions where organization_id = ${q(ids.organization)}::uuid;
    delete from public.reservation_document_variants where organization_id = ${q(ids.organization)}::uuid;
    delete from public.reservations where organization_id = ${q(ids.organization)}::uuid;
    delete from public.document_templates where organization_id = ${q(ids.organization)}::uuid;
    delete from public.document_template_families where organization_id = ${q(ids.organization)}::uuid;
    delete from public.contacts where organization_id = ${q(ids.organization)}::uuid;
    delete from public.memberships where organization_id = ${q(ids.organization)}::uuid;
    delete from public.organizations where id = ${q(ids.organization)}::uuid;
  `);
}

function seed() {
  cleanup();
  sql(`
    insert into public.organizations (id, name, slug)
    values (${q(ids.organization)}, 'Élevage résolveur E2E', 'resolver-e2e');
    insert into public.memberships (id, organization_id, profile_id, role, status)
    values (${q(ids.membership)}, ${q(ids.organization)}, ${q(ownerId)}, 'member', 'active');
    insert into public.contacts (id, organization_id, display_name)
    values (${q(ids.contact)}, ${q(ids.organization)}, 'Contact résolveur E2E');
    insert into public.reservations (id, organization_id, contact_id, status)
    values
      (${q(ids.reservation)}, ${q(ids.organization)}, ${q(ids.contact)}, 'active'),
      (${q(ids.otherReservation)}, ${q(ids.organization)}, ${q(ids.contact)}, 'active');
    insert into public.document_template_families
      (id, organization_id, name, document_type, species, breed)
    values
      (${q(ids.family)}, ${q(ids.organization)}, 'Famille choisie', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.otherFamily)}, ${q(ids.organization)}, 'Autre famille', 'reservation_contract', 'dog', 'Golden Retriever'),
      (${q(ids.inactiveFamily)}, ${q(ids.organization)}, 'Famille inactive', 'reservation_contract', 'dog', 'Golden Retriever');
    insert into public.document_templates
      (id, organization_id, family_id, name, document_type, species, breed,
       template_format, template_content, version, lifecycle_status, is_active,
       published_at, published_by)
    values
      (${q(ids.template)}, ${q(ids.organization)}, ${q(ids.family)}, 'Modèle choisi', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(commonContent)}, 3, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.originTemplate)}, ${q(ids.organization)}, ${q(ids.family)}, 'Origine historique', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(commonContent)}, 2, 'retired', false, now(), ${q(ownerId)}),
      (${q(ids.otherTemplate)}, ${q(ids.organization)}, ${q(ids.otherFamily)}, 'Autre modèle', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(commonContent)}, 2, 'published', true, now(), ${q(ownerId)}),
      (${q(ids.inactiveTemplate)}, ${q(ids.organization)}, ${q(ids.inactiveFamily)}, 'Modèle brouillon', 'reservation_contract', 'dog', 'Golden Retriever', 'json', ${q(commonContent)}, 1, 'draft', false, null, null);
  `);
}

function insertVariant(
  variantId: string,
  versionId: string,
  reservationId: string,
  familyId: string,
  templateId: string,
  lifecycleStatus: "draft" | "published",
  content: string | null = variantContent,
) {
  sql(`
    insert into public.reservation_document_variants
      (id, organization_id, reservation_id, template_family_id, document_type, species, breed)
    values
      (${q(variantId)}, ${q(ids.organization)}, ${q(reservationId)}, ${q(familyId)}, 'reservation_contract', 'dog', 'Golden Retriever');
    insert into public.reservation_document_variant_versions
      (id, organization_id, variant_id, version, source_template_id,
       source_template_version, template_format, template_content,
       lifecycle_status, published_at, published_by)
    values
      (${q(versionId)}, ${q(ids.organization)}, ${q(variantId)}, 1,
       ${q(templateId)}, ${templateId === ids.template ? 3 : 2}, 'json',
       ${content === null ? "null" : q(content)}, ${q(lifecycleStatus)},
       ${lifecycleStatus === "published" ? "now()" : "null"},
       ${lifecycleStatus === "published" ? `${q(ownerId)}::uuid` : "null"});
  `);
}

test("résout la publication de variante exacte et retombe uniquement sur le commun admissible", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  const resolve = () =>
    resolveReservationDocumentGenerationSourceCore({
      organizationId: ids.organization,
      reservationId: ids.reservation,
      documentType: "reservation_contract",
      selectedTemplateId: ids.template,
      taxonomy: { species: "dog", breed: "Golden Retriever" },
      supabase,
    });

  try {
    seed();
    await expect(resolve()).resolves.toMatchObject({
      outcome: "success",
      sourceKind: "common",
      selectedTemplateId: ids.template,
      effectiveTemplateId: ids.template,
      effectiveTemplateVersion: 3,
      templateContent: commonContent,
      reservationDocumentVariantVersionId: null,
    });

    insertVariant(
      ids.otherReservationVariant,
      ids.otherReservationPublication,
      ids.otherReservation,
      ids.family,
      ids.originTemplate,
      "published",
    );
    insertVariant(
      ids.otherFamilyVariant,
      ids.otherFamilyPublication,
      ids.reservation,
      ids.otherFamily,
      ids.otherTemplate,
      "published",
    );
    await expect(resolve()).resolves.toMatchObject({
      outcome: "success",
      sourceKind: "common",
    });

    insertVariant(
      ids.variant,
      ids.publication,
      ids.reservation,
      ids.family,
      ids.template,
      "draft",
    );
    await expect(resolve()).resolves.toMatchObject({
      outcome: "success",
      sourceKind: "common",
    });
    sql(`delete from public.reservation_document_variant_versions where id = ${q(ids.publication)}::uuid;`);
    sql(`
      insert into public.reservation_document_variant_versions
        (id, organization_id, variant_id, version, source_template_id,
         source_template_version, template_format, template_content,
         lifecycle_status, published_at, published_by)
      values
        (${q(ids.publication)}, ${q(ids.organization)}, ${q(ids.variant)}, 2,
         ${q(ids.originTemplate)}, 2, 'json', ${q(variantContent)}, 'published', now(), ${q(ownerId)});
    `);
    await expect(resolve()).resolves.toMatchObject({
      outcome: "success",
      sourceKind: "reservation_variant",
      effectiveTemplateId: ids.originTemplate,
      effectiveTemplateVersion: 2,
      templateContent: variantContent,
      reservationDocumentVariantId: ids.variant,
      reservationDocumentVariantVersionId: ids.publication,
      reservationDocumentVariantVersion: 2,
    });

    sql(`delete from public.reservation_document_variant_versions where id = ${q(ids.publication)}::uuid;`);
    sql(`
      insert into public.reservation_document_variant_versions
        (id, organization_id, variant_id, version, source_template_id,
         source_template_version, template_format, template_content,
         lifecycle_status, published_at, published_by)
      values
        (${q(ids.publication)}, ${q(ids.organization)}, ${q(ids.variant)}, 3,
         ${q(ids.originTemplate)}, 2, 'json', null, 'published', now(), ${q(ownerId)});
    `);
    await expect(resolve()).resolves.toEqual({
      outcome: "error",
      error: { code: "invalid_template" },
    });

    await expect(
      resolveReservationDocumentGenerationSourceCore({
        organizationId: ids.organization,
        reservationId: ids.reservation,
        documentType: "reservation_contract",
        selectedTemplateId: ids.inactiveTemplate,
        taxonomy: { species: "dog", breed: "Golden Retriever" },
        supabase,
      }),
    ).resolves.toEqual({
      outcome: "error",
      error: { code: "template_not_found" },
    });
    await expect(
      resolveReservationDocumentGenerationSourceCore({
        organizationId: ids.organization,
        reservationId: ids.reservation,
        documentType: "reservation_contract",
        selectedTemplateId: ids.template,
        taxonomy: { species: "cat", breed: "Maine Coon" },
        supabase,
      }),
    ).resolves.toEqual({
      outcome: "error",
      error: { code: "template_mismatch" },
    });
  } finally {
    cleanup();
    const remaining = Number(
      sql(`
        select count(*) from (
          select id from public.documents where organization_id = ${q(ids.organization)}::uuid
          union all select id from public.reservation_document_variant_versions where organization_id = ${q(ids.organization)}::uuid
          union all select id from public.reservation_document_variants where organization_id = ${q(ids.organization)}::uuid
          union all select id from public.document_templates where organization_id = ${q(ids.organization)}::uuid
          union all select id from public.document_template_families where organization_id = ${q(ids.organization)}::uuid
          union all select id from public.reservations where organization_id = ${q(ids.organization)}::uuid
          union all select id from public.contacts where organization_id = ${q(ids.organization)}::uuid
          union all select id from public.memberships where organization_id = ${q(ids.organization)}::uuid
          union all select id from public.organizations where id = ${q(ids.organization)}::uuid
        ) fixtures;
      `),
    );
    expect(remaining).toBe(0);
  }
});
