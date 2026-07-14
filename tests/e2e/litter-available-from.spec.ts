import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import {
  createAuthenticatedSupabaseClient,
  runE2eSql,
} from "./helpers/supabase";

const organizationId = "20000000-0000-4000-8000-000000000001";

test("creates and updates the manually entered litter availability date", async ({
  page,
}) => {
  const supabase = await createAuthenticatedSupabaseClient();
  const fixtureKey = randomUUID();
  const litterName = `Portée disponibilité ${fixtureKey}`;
  let createdId: string | null = null;

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-owner@saasphase1.invalid");
    await page.getByLabel("Mot de passe").fill("LocalE2EOwner-2026!");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/candidatures/);

    await page.goto("/litters/new");
    await page.getByLabel("Nom de la portée").fill(litterName);
    await page.getByLabel("Disponible à partir du").fill("2026-02-28");
    await page.getByRole("button", { name: "Créer la portée" }).click();
    await expect(page).toHaveURL(/\/litters\/[0-9a-f-]+$/);

    createdId = new URL(page.url()).pathname.split("/").at(-1) ?? null;
    expect(createdId).toMatch(/^[0-9a-f-]{36}$/);
    if (!createdId) throw new Error("Missing created litter identifier");

    const created = await supabase
      .from("litters")
      .select("id, available_from")
      .eq("organization_id", organizationId)
      .eq("id", createdId)
      .single();
    expect(created.error).toBeNull();
    expect(created.data).toEqual({ id: createdId, available_from: "2026-02-28" });

    await page.locator("#modifier-portee").getByText("Modifier la portée").click();
    await page.getByLabel("Disponible à partir du").fill("2026-03-01");
    await page.getByRole("button", { name: "Enregistrer la portée" }).click();
    await expect(page).toHaveURL(/detail_status=success/);

    const updated = await supabase
      .from("litters")
      .select("available_from")
      .eq("organization_id", organizationId)
      .eq("id", createdId)
      .single();
    expect(updated.error).toBeNull();
    expect(updated.data?.available_from).toBe("2026-03-01");

  } finally {
    const escapedName = litterName.replaceAll("'", "''");
    const deletedIds = await runE2eSql(`
      delete from public.litters
      where organization_id = '${organizationId}'::uuid
        and name = '${escapedName}'
      returning id;
    `);
    if (createdId) expect(deletedIds.split(/\s+/)).toContain(createdId);

    const remaining = await runE2eSql(`
      select count(*) from public.litters
      where organization_id = '${organizationId}'::uuid
        and name = '${escapedName}';
    `);
    expect(Number(remaining)).toBe(0);
  }
});
