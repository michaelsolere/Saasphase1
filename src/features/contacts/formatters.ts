const roleLabels: Record<string, string> = {
  prospect: "Prospect",
  candidate: "Candidat",
  pre_reservation_holder: "Titulaire de pré-réservation",
  reservation_holder: "Titulaire de réservation",
  adopter: "Adoptant",
  former_adopter: "Ancien adoptant",
  stud_owner: "Propriétaire d'étalon",
  veterinarian: "Vétérinaire",
  partner_breeder: "Éleveur partenaire",
  mediation_organization: "Organisme de médiation",
  supplier: "Fournisseur",
  other: "Autre",
};

export function getContactRoleLabel(value: string | null) {
  if (!value) {
    return "Aucun rôle";
  }

  return roleLabels[value] ?? value.replaceAll("_", " ");
}
