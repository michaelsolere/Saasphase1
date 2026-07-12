import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createAnonymousSupabaseClient,
  createAuthenticatedSupabaseClient,
  expectSupabaseData,
  type SupabaseTestClient,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";
const publicFormId = "60000000-0000-4000-8000-000000000001";
const existingContactId = "70000000-0000-4000-8000-000000000001";

function uniqueSuffix() {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function validPublicApplication(overrides = {}) {
  const suffix = uniqueSuffix();

  return {
    p_organization_slug: "elevage-e2e",
    p_form_slug: "golden-retriever-2026",
    p_first_name: "Intégrité",
    p_last_name: `Publique ${suffix}`,
    p_family_or_structure_name: undefined,
    p_email: `integrity-public-${suffix}@example.invalid`,
    p_phone: `+336${Math.floor(10000000 + Math.random() * 89999999)}`,
    p_address_line1: "12 rue des Tests",
    p_address_line2: undefined,
    p_postal_code: "33000",
    p_city: "Bordeaux",
    p_country: "FR",
    p_desired_sex_preference: "female_only",
    p_project_description:
      "Nous avons une organisation familiale stable pour accueillir un chiot.",
    p_source_channel: "email_link",
    p_consent_data_processing: true,
    p_consent_contact: true,
    p_raw_data: {
      submitted_from: "form_submission_integrity_test",
    },
    ...overrides,
  };
}

async function createSuspectSubmission(
  supabase: SupabaseTestClient,
  overrides = {},
) {
  const submissionId = randomUUID();
  const suffix = submissionId.slice(0, 8);

  const { error } = await supabase.from("form_submissions").insert({
    id: submissionId,
    organization_id: organizationId,
    public_form_id: publicFormId,
    form_type: "adoption_application",
    species: "dog",
    breed: "Golden Retriever",
    first_name: "Suspect",
    last_name: `Integrity ${suffix}`,
    email: `suspect-integrity-${suffix}@example.invalid`,
    phone: `+336${Math.floor(10000000 + Math.random() * 89999999)}`,
    address_line1: "1 rue de la Revue",
    postal_code: "33000",
    city: "Bordeaux",
    country: "FR",
    desired_sex_preference: "female_only",
    project_description:
      "Soumission de test dédiée au durcissement du workflow suspect.",
    raw_data: {
      submitted_from: "form_submission_integrity_test",
    },
    source_channel: "facebook_link",
    status: "duplicate_suspected",
    duplicate_resolution: "pending_human_review",
    consent_data_processing: true,
    consent_contact: true,
    ...overrides,
  });

  if (error) {
    throw new Error(`create suspect form submission: ${error.message}`);
  }

  return submissionId;
}

async function readSubmission(supabase: SupabaseTestClient, submissionId: string) {
  return expectSupabaseData(
    await supabase
      .from("form_submissions")
      .select("id, status, duplicate_resolution, contact_id, application_id")
      .eq("id", submissionId)
      .single(),
    "read form submission",
  );
}

async function readApplicationBySubmission(
  supabase: SupabaseTestClient,
  submissionId: string,
) {
  return expectSupabaseData(
    await supabase
      .from("applications")
      .select("id, contact_id, form_submission_id, source_channel, status")
      .eq("form_submission_id", submissionId)
      .single(),
    "read application by form submission",
  );
}

test("public application keeps returning only accepted and stores source_channel on created application", async () => {
  const anonymousSupabase = createAnonymousSupabaseClient();
  const authenticatedSupabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await anonymousSupabase.rpc(
    "submit_public_application",
    validPublicApplication({ p_source_channel: "email_link" }),
  );

  expect(error).toBeNull();
  expect(data?.[0]).toMatchObject({ status: "accepted" });
  expect(data?.[0]?.public_submission_reference).toEqual(expect.any(String));
  expect(Object.keys(data?.[0] ?? {}).sort()).toEqual([
    "public_submission_reference",
    "status",
  ]);

  const submission = expectSupabaseData(
    await authenticatedSupabase
      .from("form_submissions")
      .select("id, application_id, source_channel")
      .eq("public_reference", data?.[0]?.public_submission_reference ?? "")
      .single(),
    "read public submission",
  );

  expect(submission.source_channel).toBe("email_link");
  expect(submission.application_id).toEqual(expect.any(String));

  const application = await readApplicationBySubmission(
    authenticatedSupabase,
    submission.id,
  );
  expect(application.source_channel).toBe("email_link");
});

test("ambiguous public application remains suspect without exposing internal details", async () => {
  const anonymousSupabase = createAnonymousSupabaseClient();
  const authenticatedSupabase = await createAuthenticatedSupabaseClient();

  const { data, error } = await anonymousSupabase.rpc(
    "submit_public_application",
    validPublicApplication({
      p_email: "jerome.martin@example.com",
      p_phone: "+33655554444",
      p_source_channel: "website",
    }),
  );

  expect(error).toBeNull();
  expect(data?.[0]).toMatchObject({ status: "accepted" });
  expect(Object.keys(data?.[0] ?? {}).sort()).toEqual([
    "public_submission_reference",
    "status",
  ]);

  const submission = expectSupabaseData(
    await authenticatedSupabase
      .from("form_submissions")
      .select(
        "status, duplicate_resolution, duplicate_candidate_contact_id, application_id",
      )
      .eq("public_reference", data?.[0]?.public_submission_reference ?? "")
      .single(),
    "read ambiguous public submission",
  );

  expect(submission.status).toBe("duplicate_suspected");
  expect(submission.duplicate_resolution).toBe("pending_human_review");
  expect(submission.duplicate_candidate_contact_id).toBe(existingContactId);
  expect(submission.application_id).toBeNull();
});

test("existing contact resolution stores source_channel and rejects double processing", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  const submissionId = await createSuspectSubmission(supabase, {
    duplicate_candidate_contact_id: existingContactId,
    source_channel: "instagram_link",
  });

  const { data, error } = await supabase.rpc(
    "resolve_suspect_form_submission_existing_contact",
    {
      p_form_submission_id: submissionId,
      p_contact_id: existingContactId,
    },
  );

  expect(error).toBeNull();
  expect(data?.[0]?.application_id).toEqual(expect.any(String));
  expect(data?.[0]?.contact_id).toBe(existingContactId);

  const application = await readApplicationBySubmission(supabase, submissionId);
  expect(application.source_channel).toBe("instagram_link");

  const secondAttempt = await supabase.rpc(
    "resolve_suspect_form_submission_existing_contact",
    {
      p_form_submission_id: submissionId,
      p_contact_id: existingContactId,
    },
  );

  expect(secondAttempt.data).toBeNull();
  expect(secondAttempt.error?.message).toContain(
    "Form submission is not pending duplicate review",
  );
});

test("new contact resolution stores source_channel and unique index prevents a second application", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  const submissionId = await createSuspectSubmission(supabase, {
    source_channel: "whatsapp_link",
  });

  const { data, error } = await supabase.rpc(
    "resolve_suspect_form_submission_new_contact",
    {
      p_form_submission_id: submissionId,
    },
  );

  expect(error).toBeNull();
  expect(data?.[0]?.application_id).toEqual(expect.any(String));
  expect(data?.[0]?.contact_id).toEqual(expect.any(String));

  const application = await readApplicationBySubmission(supabase, submissionId);
  expect(application.source_channel).toBe("whatsapp_link");

  const duplicateApplication = await supabase.from("applications").insert({
    organization_id: organizationId,
    contact_id: data?.[0]?.contact_id ?? "",
    form_submission_id: submissionId,
    species: "dog",
    breed: "Golden Retriever",
    desired_sex_preference: "female_only",
    desired_quantity: 1,
    project_description:
      "Tentative de deuxième candidature pour la même soumission.",
    form_data: {},
    source_channel: "whatsapp_link",
    status: "to_review",
  });

  expect(duplicateApplication.error?.message).toContain(
    "applications_form_submission_id_unique_idx",
  );
});

test("archive requires strict pending duplicate review with no linked contact or application", async () => {
  const supabase = await createAuthenticatedSupabaseClient();
  const inconsistentSubmissionId = await createSuspectSubmission(supabase, {
    status: "submitted",
  });

  const inconsistentArchive = await supabase.rpc(
    "archive_suspect_form_submission_without_application",
    {
      p_form_submission_id: inconsistentSubmissionId,
      p_internal_comment: "Should be refused",
    },
  );

  expect(inconsistentArchive.data).toBeNull();
  expect(inconsistentArchive.error?.message).toContain(
    "Form submission is not pending duplicate review",
  );

  const validSubmissionId = await createSuspectSubmission(supabase, {
    source_channel: "leboncoin_link",
  });

  const { data, error } = await supabase.rpc(
    "archive_suspect_form_submission_without_application",
    {
      p_form_submission_id: validSubmissionId,
      p_internal_comment: "Soumission archivée par test d'intégrité.",
    },
  );

  expect(error).toBeNull();
  expect(data?.[0]?.form_submission_id).toBe(validSubmissionId);

  const archivedSubmission = await readSubmission(supabase, validSubmissionId);
  expect(archivedSubmission.status).toBe("archived");
  expect(archivedSubmission.duplicate_resolution).toBe("archived");
  expect(archivedSubmission.contact_id).toBeNull();
  expect(archivedSubmission.application_id).toBeNull();

  const secondArchive = await supabase.rpc(
    "archive_suspect_form_submission_without_application",
    {
      p_form_submission_id: validSubmissionId,
    },
  );

  expect(secondArchive.data).toBeNull();
  expect(secondArchive.error?.message).toContain(
    "Form submission is not pending duplicate review",
  );
});
