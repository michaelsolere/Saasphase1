import { expect, test } from "@playwright/test";

import {
  chooseTransactionalCampaignStaleAction,
  readTransactionalCampaignContext,
} from "../../src/features/communications/transactional-campaign-core";
import { runBirthDocumentsDepositCampaign } from "../../src/features/reservations/birth-documents-deposit-campaign";

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

test("refuse un contexte transactionnel sans organisation explicite", async () => {
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    in: () => query,
    limit: () => query,
    maybeSingle: async () => ({
      data: { organization_id: "org-arbitrary" },
      error: null,
    }),
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => query,
  };

  const context = await readTransactionalCampaignContext(
    client as never,
    {} as never,
  );

  expect(context).toBeNull();
});

test("borne une campagne naissance à l’organisation et à la portée demandées", async () => {
  const filters = new Map<string, Array<[string, unknown]>>();
  function query(table: string) {
    const tableFilters = filters.get(table) ?? [];
    filters.set(table, tableFilters);
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        tableFilters.push([column, value]);
        return builder;
      },
      is: () => builder,
      in: (column: string, value: unknown) => {
        tableFilters.push([column, value]);
        return builder;
      },
      limit: () => builder,
      maybeSingle: async () => {
        if (table === "litters") return { data: { organization_id: "org-a" }, error: null };
        if (table === "memberships") {
          const explicit = tableFilters.some(([column, value]) =>
            column === "organization_id" && value === "org-a");
          return { data: explicit ? { organization_id: "org-a" } : { organization_id: "org-b" }, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => resolve({
        data: table === "reservations" ? [{ id: "reservation-a" }] : [],
        error: null,
      }),
    };
    return builder;
  }
  const sent: string[] = [];

  const result = await runBirthDocumentsDepositCampaign({
    supabase: { from: query } as never,
    litterId: "litter-a",
    reservationIds: ["reservation-a", "reservation-b"],
    userId: "user-1",
    sendEmail: async ({ reservationId }) => {
      sent.push(reservationId);
      return { status: "success", deliveryState: "sent" };
    },
  });

  expect(filters.get("memberships")).toContainEqual(["organization_id", "org-a"]);
  expect(filters.get("reservations")).toContainEqual(["litter_id", "litter-a"]);
  expect(sent).toEqual(["reservation-a"]);
  expect(result.errorCount).toBe(1);
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