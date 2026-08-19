import { expect, test } from "@playwright/test";

import { evaluateDepartureReadiness } from "../../src/features/departures/departure-readiness-core";

const ready = {
  role: "owner",
  appointmentConfirmed: true,
  identificationNumber: "250269000000001",
  balanceRemainingCents: 0,
  saleCertificateGenerated: true,
  saleCertificateMatchesAnimal: true,
  saleCertificateSigned: true,
  sensitiveIncidentOpen: false,
  physicalDocumentsHandedOver: true,
  adoptionAt: "2026-09-04T10:00:00.000Z",
  now: "2026-09-04T10:05:00.000Z",
  animalBirthDate: "2026-07-01",
};

test("allows only owner-admin to finalize a complete departure", () => {
  expect(evaluateDepartureReadiness(ready)).toEqual({ blockers: [], canFinalize: true });
  expect(evaluateDepartureReadiness({ ...ready, role: "member" })).toMatchObject({ canFinalize: false, blockers: ["role_forbidden"] });
});

test("never permits an override for identification, final balance or signed sale certificate", () => {
  expect(evaluateDepartureReadiness({ ...ready, identificationNumber: null, balanceRemainingCents: 100, saleCertificateSigned: false }).blockers).toEqual([
    "identification_missing",
    "balance_remaining",
    "sale_certificate_not_signed",
  ]);
});

test("blocks an active incident, missing appointment and future departure", () => {
  expect(evaluateDepartureReadiness({ ...ready, appointmentConfirmed: false, sensitiveIncidentOpen: true, adoptionAt: "2026-09-05T10:00:00.000Z" }).blockers).toEqual([
    "appointment_not_confirmed",
    "sensitive_incident_open",
    "adoption_in_future",
  ]);
});
