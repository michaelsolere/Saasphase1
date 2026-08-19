export type DepartureReadinessBlocker =
  | "role_forbidden"
  | "appointment_not_confirmed"
  | "identification_missing"
  | "balance_unavailable"
  | "balance_remaining"
  | "sale_certificate_not_generated"
  | "sale_certificate_animal_mismatch"
  | "sale_certificate_not_signed"
  | "sensitive_incident_open"
  | "physical_documents_not_handed_over"
  | "adoption_date_invalid"
  | "adoption_in_future"
  | "adoption_before_birth";

export function evaluateDepartureReadiness(input: {
  role: string | null;
  appointmentConfirmed: boolean;
  identificationNumber: string | null;
  balanceRemainingCents: number | null;
  saleCertificateGenerated: boolean;
  saleCertificateMatchesAnimal: boolean;
  saleCertificateSigned: boolean;
  sensitiveIncidentOpen: boolean;
  physicalDocumentsHandedOver: boolean;
  adoptionAt: string;
  now: string;
  animalBirthDate: string | null;
}) {
  const blockers: DepartureReadinessBlocker[] = [];
  if (input.role !== "owner" && input.role !== "admin") blockers.push("role_forbidden");
  if (!input.appointmentConfirmed) blockers.push("appointment_not_confirmed");
  if (!input.identificationNumber?.trim()) blockers.push("identification_missing");
  if (input.balanceRemainingCents === null) blockers.push("balance_unavailable");
  else if (input.balanceRemainingCents !== 0) blockers.push("balance_remaining");
  if (!input.saleCertificateGenerated) blockers.push("sale_certificate_not_generated");
  else if (!input.saleCertificateMatchesAnimal) blockers.push("sale_certificate_animal_mismatch");
  if (!input.saleCertificateSigned) blockers.push("sale_certificate_not_signed");
  if (input.sensitiveIncidentOpen) blockers.push("sensitive_incident_open");
  if (!input.physicalDocumentsHandedOver) blockers.push("physical_documents_not_handed_over");
  const adoptionAt = Date.parse(input.adoptionAt);
  const now = Date.parse(input.now);
  if (!Number.isFinite(adoptionAt) || !Number.isFinite(now)) blockers.push("adoption_date_invalid");
  else {
    if (adoptionAt > now) blockers.push("adoption_in_future");
    if (input.animalBirthDate && input.adoptionAt.slice(0, 10) < input.animalBirthDate) blockers.push("adoption_before_birth");
  }
  return { blockers, canFinalize: blockers.length === 0 };
}
