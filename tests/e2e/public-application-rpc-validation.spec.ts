import { expect, test } from "@playwright/test";

import { createAnonymousSupabaseClient } from "./helpers/supabase";

function validPublicApplication(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    p_organization_slug: "elevage-demo",
    p_form_slug: "golden-retriever-2026",
    p_first_name: "Alice",
    p_last_name: "Martin",
    p_family_or_structure_name: undefined,
    p_email: `alice.rpc.${suffix}@example.invalid`,
    p_phone: "+33612345678",
    p_address_line1: "12 rue des Tests",
    p_address_line2: undefined,
    p_postal_code: "33000",
    p_city: "Bordeaux",
    p_country: "FR",
    p_desired_sex_preference: "female_only",
    p_project_description:
      "Nous avons un cadre familial stable et du temps pour accueillir un chiot.",
    p_source_channel: "website",
    p_consent_data_processing: true,
    p_consent_contact: true,
    p_raw_data: {
      submitted_from: "public_application_rpc_validation_test",
    },
    ...overrides,
  };
}

test("accepts a valid anonymous public application RPC submission", async () => {
  const supabase = createAnonymousSupabaseClient();

  const { data, error } = await supabase.rpc(
    "submit_public_application",
    validPublicApplication(),
  );

  expect(error).toBeNull();
  expect(data?.[0]).toMatchObject({
    status: "accepted",
  });
  expect(data?.[0]?.public_submission_reference).toEqual(expect.any(String));
});

test("rejects an invalid anonymous public application RPC submission server-side", async () => {
  const supabase = createAnonymousSupabaseClient();

  const { data, error } = await supabase.rpc(
    "submit_public_application",
    validPublicApplication({
      p_first_name: " ",
      p_email: "not-an-email",
      p_project_description: "Trop court",
      p_consent_contact: false,
    }),
  );

  expect(data).toBeNull();
  expect(error?.message).toContain("Invalid public application submission");
});
