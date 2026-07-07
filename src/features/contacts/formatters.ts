import { CONTACT_ROLE_LABELS, isContactRole } from "./roles";

export function getContactRoleLabel(value: string | null) {
  if (!value) {
    return "Non attribué";
  }

  return isContactRole(value) ? CONTACT_ROLE_LABELS[value] : value.replaceAll("_", " ");
}
