import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608160002_reservation_preparation_permissions.sql",
  ),
  "utf8",
);

test("garde un filet statique sur l’autorisation, l’atomicité et la tentative envoyée", () => {
  expect(migration).toContain(
    "membership.role in ('owner', 'admin')",
  );
  expect(migration).not.toContain(
    "membership.role in ('owner', 'admin', 'member')",
  );
  expect(migration).toContain(
    "mark_birth_documents_deposit_documents_sent",
  );
  expect(migration).toContain("security definer");
  expect(migration).toContain("for update");
  expect(migration).toContain("v_updated_count <> 2");
  expect(migration).toContain("sent delivery attempt required");
  expect(migration).toContain("jsonb_array_length(attempt.attachments_snapshot) = 2");
});
