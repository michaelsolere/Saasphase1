import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildPublicApplicationPath,
  getPublicFormCapabilities,
  parsePublicFormDraft,
} from "../../src/features/public-forms/core";

test("builds a stable organization-scoped public URL without internal ids", () => {
  expect(buildPublicApplicationPath("elevage-du-val", "candidature-generale")).toBe(
    "/candidature/elevage-du-val/candidature-generale",
  );
});

test("protects publication while allowing every active member to share", () => {
  expect(getPublicFormCapabilities("owner")).toEqual({ canEdit: true, canPublish: true, canShare: true });
  expect(getPublicFormCapabilities("admin")).toEqual({ canEdit: true, canPublish: true, canShare: true });
  expect(getPublicFormCapabilities("member")).toEqual({ canEdit: false, canPublish: false, canShare: true });
  expect(getPublicFormCapabilities("viewer")).toEqual({ canEdit: false, canPublish: false, canShare: false });
});

test("keeps the standard dog contract authoritative", () => {
  expect(parsePublicFormDraft({
    name: " Candidature générale ",
    slug: "candidature-generale",
    title: " Présentez-nous votre projet ",
    description: "Nous étudions chaque projet avec attention.",
    successMessage: "Merci, votre candidature a été transmise.",
    breed: "",
  })).toEqual({
    ok: true,
    value: {
      name: "Candidature générale",
      slug: "candidature-generale",
      title: "Présentez-nous votre projet",
      description: "Nous étudions chaque projet avec attention.",
      successMessage: "Merci, votre candidature a été transmise.",
      species: "dog",
      breed: "Golden Retriever",
    },
  });
});

test("rejects deceptive slugs and incomplete public copy", () => {
  expect(parsePublicFormDraft({ name: "Formulaire", slug: "Admin_Login", title: "Candidature", description: "Trop court", successMessage: "Merci", breed: "Golden Retriever" })).toMatchObject({ ok: false });
});

test("database contract keeps versions, lifecycle commands and public retries authoritative", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/202608090001_public_form_administration_foundation.sql"),
    "utf8",
  );
  expect(migration).toContain("create table public.public_form_versions");
  expect(migration).toContain("create table public.public_form_events");
  expect(migration).toContain("Public form history is append-only");
  expect(migration).toContain("create or replace function public.submit_public_application_v2");
  expect(migration).toContain("p_submission_key uuid");
  expect(migration).toContain("for update");
  expect(migration).toContain("public_form_version_id");
  expect(migration).toContain("Published public URL is stable");
  expect(migration).toContain("revoke select on public.public_form_public_view from anon, authenticated");
  expect(migration).not.toContain("role in (\n      'prospect',");
});

test("keeps organization resolution and sharing permissions on the server", () => {
  const actions = readFileSync(
    resolve(process.cwd(), "src/features/public-forms/actions.ts"),
    "utf8",
  );
  const page = readFileSync(
    resolve(process.cwd(), "src/app/settings/public-form/page.tsx"),
    "utf8",
  );
  const administration = readFileSync(
    resolve(process.cwd(), "src/features/public-forms/public-form-administration.tsx"),
    "utf8",
  );
  const serverContext = readFileSync(
    resolve(process.cwd(), "src/features/public-forms/server-context.ts"),
    "utf8",
  );

  expect(actions).toContain("resolvePublicFormOrganization(supabase, user.id)");
  expect(actions).not.toContain('formData.get("organization_id")');
  expect(actions).not.toContain('formData.get("form_id")');
  expect(page).toContain("canShare={capabilities.canShare}");
  expect(administration).not.toContain('name="organization_id"');
  expect(administration).not.toContain('name="form_id"');
  expect(administration).toContain("readOnly={Boolean(form?.publishedVersionNo)}");
  expect(serverContext).toContain("getSupabaseConfig()");
  expect(serverContext).toContain('.eq("slug", organizationSlug)');
  expect(serverContext).not.toContain('.order("created_at"');
});
