import type {
  ApplicationFormErrors,
  ApplicationFormValues,
} from "./types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+()\d\s.-]{8,25}$/;
const postalCodePattern = /^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/;

export function validateApplicationForm(values: ApplicationFormValues) {
  const errors: ApplicationFormErrors = {};

  if (!values.firstName.trim()) {
    errors.firstName = "Indiquez votre prénom.";
  }

  if (!values.lastName.trim()) {
    errors.lastName = "Indiquez votre nom.";
  }

  if (!emailPattern.test(values.email.trim())) {
    errors.email = "Indiquez une adresse email valide.";
  }

  if (!phonePattern.test(values.phone.trim())) {
    errors.phone = "Indiquez un numéro de téléphone valide.";
  }

  if (!values.addressLine1.trim()) {
    errors.addressLine1 = "Indiquez votre adresse.";
  }

  if (!postalCodePattern.test(values.postalCode.trim())) {
    errors.postalCode = "Indiquez un code postal valide.";
  }

  if (!values.city.trim()) {
    errors.city = "Indiquez votre ville.";
  }

  if (!values.desiredSexPreference) {
    errors.desiredSexPreference = "Choisissez une préférence.";
  }

  if (values.projectDescription.trim().length < 20) {
    errors.projectDescription =
      "Décrivez votre projet en quelques phrases (20 caractères minimum).";
  }

  if (!values.consentDataProcessing) {
    errors.consentDataProcessing =
      "Ce consentement est nécessaire pour traiter votre candidature.";
  }

  if (!values.consentContact) {
    errors.consentContact =
      "Ce consentement est nécessaire pour pouvoir vous recontacter.";
  }

  return errors;
}
