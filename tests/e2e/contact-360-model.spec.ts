import { expect, test } from "@playwright/test";

import {
  CONTACT_CHRONOLOGY_PAGE_SIZE,
  buildContactChronology,
  classifyContact360,
  getContactChronologyKindLabel,
  paginateContactChronology,
  type Contact360SourceEntry,
} from "@/features/contacts/contact-360-model";

const entry = (overrides: Partial<Contact360SourceEntry>): Contact360SourceEntry => ({
  id: "entry-1",
  kind: "note",
  label: "Note interne",
  detail: null,
  status: null,
  occurredAt: "2026-08-01T10:00:00.000Z",
  email: null,
  ...overrides,
});

const emailDetails = {
  recipientEmail: "famille@example.invalid",
  subject: "Confirmation de réception",
  status: "sent",
  attemptCount: 1,
  lastErrorCode: null,
  sentAt: "2026-08-01T10:00:00.000Z",
  createdAt: "2026-08-01T09:59:00.000Z",
  attachmentCount: null,
};

test.describe("contact-360-model", () => {
  test("sorts inter-source entries by descending date", () => {
    const chronology = buildContactChronology([
      entry({ id: "old-note", kind: "note", occurredAt: "2026-07-01T10:00:00.000Z" }),
      entry({ id: "payment", kind: "payment", label: "Paiement", occurredAt: "2026-08-10T10:00:00.000Z" }),
      entry({ id: "mid-note", kind: "note", occurredAt: "2026-07-20T10:00:00.000Z" }),
    ]);

    expect(chronology.map((item) => item.id)).toEqual(["payment", "mid-note", "old-note"]);
  });

  test("ignores entries without a usable date", () => {
    const chronology = buildContactChronology([
      entry({ id: "dated", occurredAt: "2026-08-01T10:00:00.000Z" }),
      entry({ id: "undated", occurredAt: null }),
    ]);

    expect(chronology.map((item) => item.id)).toEqual(["dated"]);
  });

  test("returns an empty chronology for an empty source list", () => {
    expect(buildContactChronology([])).toEqual([]);
  });

  test("keeps email technical details folded behind the entry", () => {
    const chronology = buildContactChronology([
      entry({
        id: "email-1",
        kind: "email",
        label: "Email Brevo · confirmation_reception",
        status: "sent",
        email: emailDetails,
      }),
    ]);

    expect(chronology).toHaveLength(1);
    expect(chronology[0].email?.recipientEmail).toBe("famille@example.invalid");
    expect(chronology[0].email?.lastErrorCode).toBeNull();
  });

  test("exposes a stable French label per kind", () => {
    expect(getContactChronologyKindLabel("form_submission")).toBe("Soumission de formulaire");
    expect(getContactChronologyKindLabel("application")).toBe("Candidature");
    expect(getContactChronologyKindLabel("payment")).toBe("Paiement");
    expect(getContactChronologyKindLabel("document")).toBe("Document");
    expect(getContactChronologyKindLabel("appointment")).toBe("Rendez-vous");
    expect(getContactChronologyKindLabel("note")).toBe("Note interne");
    expect(getContactChronologyKindLabel("manual_contact")).toBe("Échange manuel");
    expect(getContactChronologyKindLabel("email")).toBe("Email");
  });

  test("classifies a contact with an active or finalized journey dossier as journey mode", () => {
    expect(
      classifyContact360({ reservations: [{ id: "res-1", status: "active" }] }),
    ).toEqual({ mode: "journey", dossierCount: 1 });
    expect(
      classifyContact360({ reservations: [{ id: "res-1", status: "adopted" }] }),
    ).toEqual({ mode: "journey", dossierCount: 1 });
  });

  test("classifies a contact without any journey reservation as standalone mode", () => {
    expect(classifyContact360({ reservations: [] })).toEqual({ mode: "standalone", dossierCount: 0 });
    expect(classifyContact360({ reservations: [{ id: "res-9", status: "cancelled" }] })).toEqual({
      mode: "journey",
      dossierCount: 1,
    });
  });

  test("paginates the chronology 30 by 30 with a total count", () => {
    const sources = Array.from({ length: 65 }, (_, index) =>
      entry({ id: `entry-${index}`, occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString() }),
    );
    const chronology = buildContactChronology(sources);

    const pageOne = paginateContactChronology(chronology, 1);
    expect(pageOne.items).toHaveLength(CONTACT_CHRONOLOGY_PAGE_SIZE);
    expect(pageOne.totalCount).toBe(65);
    expect(pageOne.hasMore).toBe(true);
    expect(pageOne.items[0].id).toBe("entry-64");

    const pageThree = paginateContactChronology(chronology, 3);
    expect(pageThree.items).toHaveLength(5);
    expect(pageThree.hasMore).toBe(false);

    expect(paginateContactChronology([], 1)).toEqual({
      items: [],
      totalCount: 0,
      hasMore: false,
      pageCount: 0,
    });

    expect(paginateContactChronology(chronology, 99).items).toEqual([]);
    expect(paginateContactChronology(chronology, 99).hasMore).toBe(false);
  });

  test("orders same-date entries deterministically by id", () => {
    const chronology = buildContactChronology([
      entry({ id: "b-same", occurredAt: "2026-08-01T10:00:00.000Z" }),
      entry({ id: "a-same", occurredAt: "2026-08-01T10:00:00.000Z" }),
    ]);

    expect(chronology.map((item) => item.id)).toEqual(["a-same", "b-same"]);
  });
});
