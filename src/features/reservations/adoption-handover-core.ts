export type AdoptionHandoverBlockerCode =
  | "reservation_not_ready"
  | "animal_missing"
  | "animal_inconsistent"
  | "adoption_date_invalid"
  | "adoption_in_future"
  | "adoption_before_birth";

export type AdoptionHandoverExceptionCode =
  | "animal_identification_missing"
  | "price_missing"
  | "balance_remaining"
  | "payment_data_unavailable"
  | "document_data_unavailable"
  | "commitment_certificate_missing"
  | "commitment_certificate_not_signed"
  | "reservation_contract_missing"
  | "reservation_contract_not_signed";

export type AdoptionHandoverReadiness = {
  blockerCodes: AdoptionHandoverBlockerCode[];
  exceptionCodes: AdoptionHandoverExceptionCode[];
  isComplete: boolean;
};

type HandoverDocumentStatus = string | null;

type AdoptionHandoverInput = {
  reservationStatus: string;
  adoptionAt: string;
  now: string;
  animal: {
    id: string;
    birthDate: string | null;
    identificationNumber: string | null;
    isConsistent: boolean;
  } | null;
  priceCents: number | null;
  balanceRemainingCents: number | null;
  paymentDataAvailable: boolean;
  documents: {
    dataAvailable: boolean;
    commitmentCertificateStatus: HandoverDocumentStatus;
    reservationContractStatus: HandoverDocumentStatus;
  };
};

function documentException(
  status: HandoverDocumentStatus,
  missingCode: AdoptionHandoverExceptionCode,
  unsignedCode: AdoptionHandoverExceptionCode,
) {
  if (!status) return missingCode;
  if (status !== "signed") return unsignedCode;
  return null;
}

export function evaluateAdoptionHandoverReadiness(
  input: AdoptionHandoverInput,
): AdoptionHandoverReadiness {
  const blockerCodes: AdoptionHandoverBlockerCode[] = [];
  const exceptionCodes: AdoptionHandoverExceptionCode[] = [];

  if (input.reservationStatus !== "animal_assigned") {
    blockerCodes.push("reservation_not_ready");
  }
  if (!input.animal) {
    blockerCodes.push("animal_missing");
  } else if (!input.animal.isConsistent) {
    blockerCodes.push("animal_inconsistent");
  }

  const adoptionAt = Date.parse(input.adoptionAt);
  const now = Date.parse(input.now);
  if (!Number.isFinite(adoptionAt) || !Number.isFinite(now)) {
    blockerCodes.push("adoption_date_invalid");
  } else {
    if (adoptionAt > now) blockerCodes.push("adoption_in_future");
    if (
      input.animal?.birthDate &&
      input.adoptionAt.slice(0, 10) < input.animal.birthDate
    ) {
      blockerCodes.push("adoption_before_birth");
    }
  }

  if (input.animal && !input.animal.identificationNumber?.trim()) {
    exceptionCodes.push("animal_identification_missing");
  }
  if (!input.paymentDataAvailable) {
    exceptionCodes.push("payment_data_unavailable");
  } else if (input.priceCents === null) {
    exceptionCodes.push("price_missing");
  } else if (
    input.balanceRemainingCents !== null &&
    input.balanceRemainingCents > 0
  ) {
    exceptionCodes.push("balance_remaining");
  }

  if (!input.documents.dataAvailable) {
    exceptionCodes.push("document_data_unavailable");
  } else {
    const commitmentException = documentException(
      input.documents.commitmentCertificateStatus,
      "commitment_certificate_missing",
      "commitment_certificate_not_signed",
    );
    if (commitmentException) exceptionCodes.push(commitmentException);

    const contractException = documentException(
      input.documents.reservationContractStatus,
      "reservation_contract_missing",
      "reservation_contract_not_signed",
    );
    if (contractException) exceptionCodes.push(contractException);
  }

  return {
    blockerCodes,
    exceptionCodes,
    isComplete: blockerCodes.length === 0 && exceptionCodes.length === 0,
  };
}

export function getAdoptionHandoverAuthorization({
  role,
  readiness,
}: {
  role: string | null;
  readiness: AdoptionHandoverReadiness;
}) {
  const requiresJustification = readiness.exceptionCodes.length > 0;
  if (readiness.blockerCodes.length > 0) {
    return { allowed: false, requiresJustification };
  }
  if (role === "owner" || role === "admin") {
    return { allowed: true, requiresJustification };
  }
  if (role === "member") {
    return { allowed: !requiresJustification, requiresJustification };
  }
  return { allowed: false, requiresJustification: false };
}
