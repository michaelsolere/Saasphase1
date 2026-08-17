import { expect, test } from "@playwright/test";

import {
  chooseTransactionalCampaignStaleAction,
  readTransactionalCampaignContext,
} from "../../src/features/communications/transactional-campaign-core";

test("résout l’adhésion sur l’organisation demandée au lieu de la première adhésion", async () => {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    is: () => query,
    in: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    maybeSingle: async () => ({
      data: filters.some(([column, value]) =>
        column === "organization_id" && value === "org-b")
        ? { organization_id: "org-b" }
        : null,
      error: null,
    }),
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => query,
  };

  const context = await readTransactionalCampaignContext(
    client as never,
    { organizationId: "org-b", roles: ["owner", "admin"] },
  );

  expect(context).toEqual({ userId: "user-1", organizationId: "org-b" });
  expect(filters).toContainEqual(["organization_id", "org-b"]);
  expect(filters).toContainEqual(["role", ["owner", "admin"]]);
});

test("reprend seulement un claim expiré qui n’a pas encore atteint Brevo", () => {
  const now = new Date("2026-08-16T12:30:00.000Z");
  expect(chooseTransactionalCampaignStaleAction({
    lastAttemptAt: "2026-08-16T12:29:30.000Z",
    providerCallStartedAt: null,
  }, now)).toBe("wait");
  expect(chooseTransactionalCampaignStaleAction({
    lastAttemptAt: "2026-08-16T12:00:00.000Z",
    providerCallStartedAt: null,
  }, now)).toBe("retry");
  expect(chooseTransactionalCampaignStaleAction({
    lastAttemptAt: "2026-08-16T12:00:00.000Z",
    providerCallStartedAt: "2026-08-16T12:00:05.000Z",
  }, now)).toBe("uncertain");
});