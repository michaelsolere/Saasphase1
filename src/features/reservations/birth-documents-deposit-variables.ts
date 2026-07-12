import { getSexPreferenceLabel } from "@/features/applications/formatters";
import {
  formatPreReservationEuros,
  formatPreReservationParisDate,
} from "@/features/communications/pre-reservation-email-core";

export type BirthDocumentsDepositVariables = {
  prenom: string;
  nom: string;
  nom_complet: string;
  portee: string;
  groupe_portees: string;
  mere: string;
  pere: string;
  date_naissance: string;
  sexe_souhaite: string;
  montant_deja_regle: string;
  montant_complement_arrhes: string;
  echeance_complement_arrhes: string;
  arrhes_totales: string;
  nom_elevage: string;
};

export function buildBirthDocumentsDepositVariables(input: {
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  litterName: string | null;
  litterGroupName: string | null;
  motherName: string | null;
  fatherName: string | null;
  birthDate: string | null;
  desiredSexPreference: string | null;
  paidArrhesCents: number;
  complementAmountCents: number;
  complementDueDate: string | null;
  completeDepositCents: number;
  organizationName: string | null;
}): BirthDocumentsDepositVariables {
  return {
    prenom: input.firstName ?? "",
    nom: input.lastName ?? "",
    nom_complet: input.fullName,
    portee: input.litterName ?? "",
    groupe_portees: input.litterGroupName ?? "",
    mere: input.motherName ?? "",
    pere: input.fatherName ?? "",
    date_naissance: formatPreReservationParisDate(input.birthDate),
    sexe_souhaite: input.desiredSexPreference
      ? getSexPreferenceLabel(input.desiredSexPreference)
      : "",
    montant_deja_regle: formatPreReservationEuros(input.paidArrhesCents),
    montant_complement_arrhes: formatPreReservationEuros(
      input.complementAmountCents,
    ),
    echeance_complement_arrhes: formatPreReservationParisDate(
      input.complementDueDate,
    ),
    arrhes_totales: formatPreReservationEuros(input.completeDepositCents),
    nom_elevage: input.organizationName ?? "",
  };
}

