export const CONTACT_TYPES = [
  "person",
  "family",
  "organization",
  "professional",
  "other",
] as const;

export const CONTACT_EDIT_NO_EMAIL_VALUE = "__contact_edit_no_email__";

export type ContactType = (typeof CONTACT_TYPES)[number];

export type ContactEditableValues = {
  contactType: ContactType;
  firstName: string | null;
  lastName: string | null;
  familyOrStructureName: string | null;
  requestedDisplayName: string | null;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
};

export type ContactValidationResult =
  | { ok: true; values: ContactEditableValues; displayName: string }
  | {
      ok: false;
      code:
        | "invalid"
        | "invalid_email"
        | "invalid_phone"
        | "empty_contact";
    };

export function normalizeOptionalText(
  value: FormDataEntryValue | null,
  maxLength = 255,
) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim().replace(/\s+/g, " ");

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.slice(0, maxLength);
}

export function normalizeEmail(value: FormDataEntryValue | null) {
  const email = normalizeOptionalText(value, 320)?.toLowerCase() ?? null;

  if (!email) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "invalid";
}

export function normalizeCountry(value: FormDataEntryValue | null) {
  const country = normalizeOptionalText(value, 2)?.toUpperCase() ?? "FR";

  return /^[A-Z]{2}$/.test(country) ? country : "invalid";
}

export function normalizePhone(value: FormDataEntryValue | null) {
  const phone = normalizeOptionalText(value, 40);

  if (!phone) {
    return null;
  }

  if (!/^[+\d\s()./-]+$/.test(phone)) {
    return "invalid";
  }

  const digits = phone.replace(/\D/g, "");

  if (digits.length < 6 || digits.length > 20) {
    return "invalid";
  }

  return phone;
}

export function normalizePhoneForComparison(value: string | null) {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits.startsWith("00") ? digits.slice(2) : digits;
}

export function isContactType(value: string | null): value is ContactType {
  return CONTACT_TYPES.includes(value as ContactType);
}

export function buildContactDisplayName({
  requestedDisplayName,
  firstName,
  lastName,
  familyOrStructureName,
  email,
  phone,
  secondaryPhone,
  addressLine1,
  postalCode,
  city,
}: Omit<ContactEditableValues, "contactType" | "addressLine2" | "country">) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const nameWithStructure =
    fullName && familyOrStructureName
      ? `${fullName} — ${familyOrStructureName}`
      : null;
  const addressLabel = [addressLine1, postalCode, city]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    requestedDisplayName ||
    nameWithStructure ||
    fullName ||
    familyOrStructureName ||
    email ||
    phone ||
    secondaryPhone ||
    addressLabel ||
    "Contact sans nom"
  );
}

export function readContactEditableValues(
  formData: FormData,
): ContactValidationResult {
  const rawContactType = normalizeOptionalText(formData.get("contact_type"));
  const contactType = isContactType(rawContactType) ? rawContactType : null;
  const firstName = normalizeOptionalText(formData.get("first_name"));
  const lastName = normalizeOptionalText(formData.get("last_name"));
  const familyOrStructureName = normalizeOptionalText(
    formData.get("family_or_structure_name"),
  );
  const requestedDisplayName = normalizeOptionalText(
    formData.get("display_name"),
  );
  const email = normalizeEmail(formData.get("email"));
  const phone = normalizePhone(formData.get("phone"));
  const secondaryPhone = normalizePhone(formData.get("secondary_phone"));
  const addressLine1 = normalizeOptionalText(formData.get("address_line1"));
  const addressLine2 = normalizeOptionalText(formData.get("address_line2"));
  const postalCode = normalizeOptionalText(formData.get("postal_code"));
  const city = normalizeOptionalText(formData.get("city"));
  const country = normalizeCountry(formData.get("country"));

  if (!contactType || country === "invalid") {
    return { ok: false, code: "invalid" };
  }

  if (email === "invalid") {
    return { ok: false, code: "invalid_email" };
  }

  if (phone === "invalid" || secondaryPhone === "invalid") {
    return { ok: false, code: "invalid_phone" };
  }

  const hasUsefulContactInformation = Boolean(
    requestedDisplayName ||
      firstName ||
      lastName ||
      familyOrStructureName ||
      email ||
      phone ||
      secondaryPhone ||
      addressLine1 ||
      postalCode ||
      city,
  );

  if (!hasUsefulContactInformation) {
    return { ok: false, code: "empty_contact" };
  }

  const values = {
    contactType,
    firstName,
    lastName,
    familyOrStructureName,
    requestedDisplayName,
    email,
    phone,
    secondaryPhone,
    addressLine1,
    addressLine2,
    postalCode,
    city,
    country,
  };

  return {
    ok: true,
    values,
    displayName: buildContactDisplayName(values),
  };
}
