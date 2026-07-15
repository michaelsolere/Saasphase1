import type { ReservationContractGenerationSnapshot } from "./document-generation-snapshot-schemas";
import type { FreeReservationContractTemplateDefinition } from "./document-template-definition-schemas";

export type ReservationContractVariableCategory =
  | "Vendeur"
  | "Adoptant"
  | "Projet et animal"
  | "Réservation et finances"
  | "Portée et parents"
  | "Groupe de portées"
  | "Document";

type VariableDefinition = {
  key: string;
  label: string;
  missingLabel: string;
  category: ReservationContractVariableCategory;
  resolve: (snapshot: ReservationContractGenerationSnapshot) => string | null;
};

export type TemplateVariableIssue = {
  code: "unknown_variable" | "unclosed_variable" | "invalid_syntax" | "forbidden_characters";
  token: string;
  offset: number;
  message: string;
};

type TemplateSegment =
  | { type: "text"; value: string }
  | { type: "variable"; key: string };

export type FreeTextRun = {
  text: string;
  bold: boolean;
};

export type FreeTextParagraph = {
  runs: FreeTextRun[];
};

export type TemplateFormattingIssue = {
  code:
    | "unclosed_bold"
    | "unexpected_bold_closer"
    | "empty_bold"
    | "nested_bold"
    | "formatting_in_title";
  offset: number;
};

type FreeTextTemplateNode =
  | { type: "text"; value: string; bold: boolean }
  | { type: "variable"; key: string; bold: boolean };

type FreeTextTemplateParagraph = {
  nodes: FreeTextTemplateNode[];
};

export type ParseFreeReservationContractBodyResult =
  | { success: true; paragraphs: FreeTextTemplateParagraph[]; variables: string[] }
  | { success: false; error: "invalid_template_formatting"; issues: TemplateFormattingIssue[] }
  | { success: false; error: "invalid_template_variables"; issues: TemplateVariableIssue[] };

export type ParseReservationContractVariablesResult =
  | { success: true; segments: TemplateSegment[]; variables: string[] }
  | { success: false; issues: TemplateVariableIssue[] };

export type ResolveReservationContractTextResult =
  | { success: true; text: string; missingVariables: string[] }
  | {
      success: false;
      error:
        | "invalid_template_variables"
        | "missing_template_variables"
        | "invalid_template_variable_value";
      issues?: TemplateVariableIssue[];
      missingVariables?: string[];
      invalidVariables?: string[];
    };

export type ResolveFreeReservationContractBodyResult =
  | {
      success: true;
      paragraphs: FreeTextParagraph[];
      text: string;
      missingVariables: string[];
    }
  | {
      success: false;
      error:
        | "invalid_template_formatting"
        | "invalid_template_variables"
        | "missing_template_variables"
        | "invalid_template_variable_value";
      formattingIssues?: TemplateFormattingIssue[];
      issues?: TemplateVariableIssue[];
      missingVariables?: string[];
      invalidVariables?: string[];
    };

const compact = (values: Array<string | null | undefined>) =>
  values.filter((value): value is string => Boolean(value?.trim()));

function normalizeIdentityPart(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") || null;
}

function resolveSellerFullIdentity(snapshot: ReservationContractGenerationSnapshot) {
  const signerName = normalizeIdentityPart(snapshot.signer?.displayName);
  const organizationName = normalizeIdentityPart(snapshot.seller.legalName)
    ?? normalizeIdentityPart(snapshot.seller.tradeName);

  if (!signerName) return organizationName;
  if (!organizationName) return signerName;
  if (signerName.toLocaleLowerCase("fr-FR") === organizationName.toLocaleLowerCase("fr-FR")) {
    return signerName;
  }
  return `${signerName} ${organizationName}`;
}

function formatAddress(
  address: ReservationContractGenerationSnapshot["seller"]["address"],
  country: string | null,
) {
  if (!address && !country) return null;
  return compact([
    address?.line1,
    address?.line2,
    compact([address?.postalCode, address?.city]).join(" ") || null,
    address?.region,
    country,
  ]).join(", ") || null;
}

export function formatFrenchDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatFrenchMoney(cents: number, currency = "EUR") {
  const amount = cents / 100;
  const hasCents = cents % 100 !== 0;
  const formatted = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount).replace(/[\u00a0\u202f]/g, " ");
  return `${formatted} ${currency === "EUR" ? "€" : currency}`;
}

const SMALL_NUMBERS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit",
  "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
] as const;

function numberUnderHundred(value: number): string {
  if (value <= 16) return SMALL_NUMBERS[value];
  if (value < 20) return `dix-${SMALL_NUMBERS[value - 10]}`;
  if (value < 70) {
    const tens = Math.floor(value / 10);
    const unit = value % 10;
    const tensWord = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][tens];
    if (unit === 0) return tensWord;
    return `${tensWord}${unit === 1 ? "-et-" : "-"}${SMALL_NUMBERS[unit]}`;
  }
  if (value < 80) {
    const remainder = value - 60;
    return `soixante${remainder === 11 ? "-et-" : "-"}${numberUnderHundred(remainder)}`;
  }
  const remainder = value - 80;
  if (remainder === 0) return "quatre-vingts";
  return `quatre-vingt-${numberUnderHundred(remainder)}`;
}

function integerToFrenchWords(value: number): string {
  if (value < 100) return numberUnderHundred(value);
  if (value < 1_000) {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    const prefix = hundreds === 1 ? "cent" : `${SMALL_NUMBERS[hundreds]} cents`;
    return remainder === 0 ? prefix : `${prefix.replace(/s$/, "")} ${integerToFrenchWords(remainder)}`;
  }
  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1_000);
    const remainder = value % 1_000;
    const prefix = thousands === 1 ? "mille" : `${integerToFrenchWords(thousands)} mille`;
    return remainder === 0 ? prefix : `${prefix} ${integerToFrenchWords(remainder)}`;
  }
  const millions = Math.floor(value / 1_000_000);
  const remainder = value % 1_000_000;
  const prefix = `${integerToFrenchWords(millions)} million${millions > 1 ? "s" : ""}`;
  return remainder === 0 ? prefix : `${prefix} ${integerToFrenchWords(remainder)}`;
}

export function formatFrenchMoneyInWords(cents: number, currency = "EUR") {
  const whole = Math.floor(cents / 100);
  const decimal = cents % 100;
  const currencyWord = currency === "EUR" ? (whole === 1 ? "euro" : "euros") : currency;
  const main = `${integerToFrenchWords(whole)} ${currencyWord}`;
  if (decimal === 0) return main;
  return `${main} et ${integerToFrenchWords(decimal)} centime${decimal > 1 ? "s" : ""}`;
}

const speciesLabels: Record<string, string> = { dog: "Chien", cat: "Chat" };
const sexLabels: Record<string, string> = { male: "Mâle", female: "Femelle", unknown: "Non renseigné" };
const sexPreferenceLabels: Record<string, string> = {
  male_only: "Mâle",
  female_only: "Femelle",
  male_preferred_female_possible: "Mâle préféré, femelle possible",
  female_preferred_male_possible: "Femelle préférée, mâle possible",
  no_preference: "Sans préférence",
  unknown: "Non renseigné",
};
const legalFormLabels: Record<string, string> = {
  individual: "Entreprise individuelle", earl: "EARL", company: "Société",
  association: "Association", other: "Autre",
};

const variable = (
  key: string,
  label: string,
  missingLabel: string,
  category: ReservationContractVariableCategory,
  resolve: VariableDefinition["resolve"],
): VariableDefinition => ({ key, label, missingLabel, category, resolve });

export const RESERVATION_CONTRACT_VARIABLE_CATALOG: readonly VariableDefinition[] = [
  variable("vendeur.identite_complete", "Identité complète", "identité complète du vendeur", "Vendeur", resolveSellerFullIdentity),
  variable("vendeur.nom_commercial", "Nom commercial", "nom commercial du vendeur", "Vendeur", (s) => s.seller.tradeName),
  variable("vendeur.raison_sociale", "Raison sociale", "raison sociale du vendeur", "Vendeur", (s) => s.seller.legalName),
  variable("vendeur.forme_juridique", "Forme juridique", "forme juridique du vendeur", "Vendeur", (s) => s.seller.legalForm ? legalFormLabels[s.seller.legalForm] ?? s.seller.legalForm : null),
  variable("vendeur.adresse_complete", "Adresse complète", "adresse du vendeur", "Vendeur", (s) => formatAddress(s.seller.address, s.seller.country)),
  variable("vendeur.telephone", "Téléphone", "téléphone du vendeur", "Vendeur", (s) => s.seller.phone),
  variable("vendeur.email", "E-mail", "e-mail du vendeur", "Vendeur", (s) => s.seller.email),
  variable("vendeur.siret", "SIRET", "SIRET du vendeur", "Vendeur", (s) => s.seller.siret),
  variable("adoptant.nom_complet", "Nom complet", "nom complet de l’adoptant", "Adoptant", (s) => s.adopter.displayName),
  variable("adoptant.prenom", "Prénom", "prénom de l’adoptant", "Adoptant", (s) => s.adopter.firstName),
  variable("adoptant.nom", "Nom", "nom de l’adoptant", "Adoptant", (s) => s.adopter.lastName),
  variable("adoptant.adresse_complete", "Adresse complète", "adresse de l’adoptant", "Adoptant", (s) => formatAddress(s.adopter.address, s.adopter.country)),
  variable("adoptant.telephone", "Téléphone", "téléphone de l’adoptant", "Adoptant", (s) => s.adopter.phone),
  variable("adoptant.email", "E-mail", "e-mail de l’adoptant", "Adoptant", (s) => s.adopter.email),
  variable("projet.espece", "Espèce", "espèce du projet", "Projet et animal", (s) => speciesLabels[s.adoptionProject.species] ?? s.adoptionProject.species),
  variable("projet.race", "Race", "race du projet", "Projet et animal", (s) => s.adoptionProject.breed),
  variable("projet.date_naissance", "Date de naissance", "date de naissance de l’animal ou de la portée", "Projet et animal", (s) => formatFrenchDate(s.adoptionProject.animal?.birthDate ?? s.adoptionProject.litter?.actualBirthDate)),
  variable("projet.sexe", "Sexe", "sexe de l’animal ou préférence de la réservation", "Projet et animal", (s) => s.adoptionProject.animal?.sex ? sexLabels[s.adoptionProject.animal.sex] ?? s.adoptionProject.animal.sex : s.adoptionProject.sexPreference ? sexPreferenceLabels[s.adoptionProject.sexPreference] ?? s.adoptionProject.sexPreference : null),
  variable("projet.portee_ou_groupe", "Portée ou groupe", "nom de la portée ou du groupe de portées", "Projet et animal", (s) => s.adoptionProject.litter?.name ?? s.adoptionProject.litterGroup?.name ?? null),
  variable("animal.nom", "Nom", "nom de l’animal", "Projet et animal", (s) => s.adoptionProject.animal?.callName ?? s.adoptionProject.animal?.officialName ?? null),
  variable("animal.nom_officiel", "Nom officiel", "nom officiel de l’animal", "Projet et animal", (s) => s.adoptionProject.animal?.officialName ?? null),
  variable("animal.nom_usage", "Nom d’usage", "nom d’usage de l’animal", "Projet et animal", (s) => s.adoptionProject.animal?.callName ?? null),
  variable("animal.identification", "Identification", "identification de l’animal", "Projet et animal", (s) => s.adoptionProject.animal?.identification ?? null),
  variable("animal.numero_lof", "Numéro LOF", "numéro LOF de l’animal", "Projet et animal", (s) => s.adoptionProject.animal?.lofNumber ?? null),
  variable("animal.couleur", "Couleur / robe", "couleur de robe de l’animal", "Projet et animal", (s) => s.adoptionProject.animal?.color ?? null),
  variable("reservation.rang_choix", "Rang de choix", "rang de choix de la réservation", "Réservation et finances", (s) => s.reservation.choiceRank?.toString() ?? null),
  variable("reservation.prix_formate", "Prix formaté", "prix de la réservation", "Réservation et finances", (s) => s.financials.priceCents === null ? null : formatFrenchMoney(s.financials.priceCents, s.financials.currency)),
  variable("reservation.prix_en_lettres", "Prix en lettres", "prix de la réservation", "Réservation et finances", (s) => s.financials.priceCents === null ? null : formatFrenchMoneyInWords(s.financials.priceCents, s.financials.currency)),
  variable("reservation.arrhes_prevues_formatees", "Arrhes prévues", "montant des arrhes prévues", "Réservation et finances", (s) => formatFrenchMoney(s.financials.depositTargetCents ?? s.financials.fullDepositTargetCents, s.financials.currency)),
  variable("reservation.arrhes_versees_formatees", "Arrhes versées", "montant des arrhes versées", "Réservation et finances", (s) => formatFrenchMoney(s.financials.depositPaidCents, s.financials.currency)),
  variable("reservation.solde_formate", "Solde", "solde de la réservation", "Réservation et finances", (s) => s.financials.remainingCents === null ? null : formatFrenchMoney(s.financials.remainingCents, s.financials.currency)),
  variable("portee.nom", "Nom de la portée", "nom de la portée", "Portée et parents", (s) => s.adoptionProject.litter?.name ?? null),
  variable("portee.date_naissance", "Date de naissance", "date de naissance de la portée", "Portée et parents", (s) => formatFrenchDate(s.adoptionProject.litter?.actualBirthDate)),
  variable("portee.date_disponibilite", "Date de disponibilité", "date de disponibilité de la portée", "Portée et parents", (s) => formatFrenchDate(s.adoptionProject.litter?.availableFrom)),
  ...(["mother", "father"] as const).flatMap((parent) => {
    const prefix = parent === "mother" ? "portee.mere" : "portee.pere";
    const subject = parent === "mother" ? "mère" : "père";
    const get = (s: ReservationContractGenerationSnapshot) => s.adoptionProject.litter?.[parent];
    return [
      variable(`${prefix}.nom`, `Nom ${subject}`, `nom du ${subject}`, "Portée et parents", (s) => get(s)?.officialName ?? get(s)?.callName ?? null),
      variable(`${prefix}.identification`, `Identification ${subject}`, `identification du ${subject}`, "Portée et parents", (s) => get(s)?.identification ?? null),
      variable(`${prefix}.numero_lof`, `Numéro LOF ${subject}`, `numéro LOF du ${subject}`, "Portée et parents", (s) => get(s)?.lofNumber ?? null),
    ];
  }),
  variable("groupe_portees.nom", "Nom du groupe de portées", "nom du groupe de portées", "Groupe de portées", (s) => s.adoptionProject.litterGroup?.name ?? null),
  variable("document.lieu_signature", "Lieu de signature", "lieu de signature", "Document", (s) => s.signature.defaultCity),
  variable("document.date_generation", "Date de génération", "date de génération", "Document", (s) => formatFrenchDate(s.capturedAt)),
] as const;

const VARIABLE_BY_KEY = new Map(
  RESERVATION_CONTRACT_VARIABLE_CATALOG.map((item) => [item.key, item]),
);

export function parseReservationContractVariables(
  text: string,
): ParseReservationContractVariablesResult {
  const segments: TemplateSegment[] = [];
  const variables = new Set<string>();
  const issues: TemplateVariableIssue[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const opener = text.indexOf("[[", cursor);
    const strayCloser = text.indexOf("]]", cursor);
    if (strayCloser !== -1 && (opener === -1 || strayCloser < opener)) {
      issues.push({ code: "invalid_syntax", token: "]]", offset: strayCloser, message: "Doubles crochets fermants sans ouverture." });
      cursor = strayCloser + 2;
      continue;
    }
    if (opener === -1) {
      segments.push({ type: "text", value: text.slice(cursor) });
      break;
    }
    if (opener > cursor) segments.push({ type: "text", value: text.slice(cursor, opener) });
    const closer = text.indexOf("]]", opener + 2);
    if (closer === -1) {
      issues.push({ code: "unclosed_variable", token: text.slice(opener, Math.min(text.length, opener + 102)), offset: opener, message: "Doubles crochets non refermés." });
      break;
    }
    const nestedOpener = text.indexOf("[[", opener + 2);
    if (nestedOpener !== -1 && nestedOpener < closer) {
      issues.push({ code: "invalid_syntax", token: text.slice(opener, closer + 2), offset: opener, message: "Doubles crochets imbriqués interdits." });
      cursor = closer + 2;
      continue;
    }
    const key = text.slice(opener + 2, closer);
    const token = text.slice(opener, closer + 2);
    if (key.length === 0 || key.length > 100 || !/^[a-z0-9_.]+$/.test(key)) {
      issues.push({ code: "forbidden_characters", token, offset: opener, message: `Caractères interdits dans ${token}.` });
    } else if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(key)) {
      issues.push({ code: "invalid_syntax", token, offset: opener, message: `Syntaxe incorrecte pour ${token}.` });
    } else if (!VARIABLE_BY_KEY.has(key)) {
      issues.push({ code: "unknown_variable", token, offset: opener, message: `Variable inconnue : ${token}.` });
    } else {
      segments.push({ type: "variable", key });
      variables.add(key);
    }
    cursor = closer + 2;
  }
  return issues.length > 0
    ? { success: false, issues: issues.slice(0, 50) }
    : { success: true, segments, variables: [...variables] };
}

export function resolveReservationContractText({
  text,
  snapshot,
  allowMissingTemplateVariables = false,
}: {
  text: string;
  snapshot: ReservationContractGenerationSnapshot;
  allowMissingTemplateVariables?: boolean;
}): ResolveReservationContractTextResult {
  const parsed = parseReservationContractVariables(text);
  if (!parsed.success) return { success: false, error: "invalid_template_variables", issues: parsed.issues };
  const missingVariables = new Set<string>();
  const invalidVariables = new Set<string>();
  const resolved = parsed.segments.map((segment) => {
    if (segment.type === "text") return segment.value;
    const definition = VARIABLE_BY_KEY.get(segment.key)!;
    const value = definition.resolve(snapshot);
    if (value !== null && value !== undefined && value !== "") {
      if (value.includes("[[") || value.includes("]]")) {
        invalidVariables.add(segment.key);
        return `[Donnée invalide : la valeur « ${definition.missingLabel} » contient une syntaxe réservée]`;
      }
      return value;
    }
    missingVariables.add(segment.key);
    return `[Donnée manquante : ${definition.missingLabel}]`;
  }).join("");
  if (invalidVariables.size > 0 && !allowMissingTemplateVariables) {
    return {
      success: false,
      error: "invalid_template_variable_value",
      invalidVariables: [...invalidVariables],
    };
  }
  if (missingVariables.size > 0 && !allowMissingTemplateVariables) {
    return { success: false, error: "missing_template_variables", missingVariables: [...missingVariables] };
  }
  return { success: true, text: resolved, missingVariables: [...missingVariables] };
}

function appendTemplateNodes(
  nodes: FreeTextTemplateNode[],
  value: string,
  bold: boolean,
): TemplateVariableIssue[] {
  if (!value) return [];
  const parsed = parseReservationContractVariables(value);
  if (!parsed.success) return parsed.issues;
  for (const segment of parsed.segments) {
    nodes.push(segment.type === "text"
      ? { type: "text", value: segment.value, bold }
      : { type: "variable", key: segment.key, bold });
  }
  return [];
}

export function parseFreeReservationContractBody(
  body: string,
): ParseFreeReservationContractBodyResult {
  const paragraphs: FreeTextTemplateParagraph[] = [];
  const variables = new Set<string>();
  const formattingIssues: TemplateFormattingIssue[] = [];
  const variableIssues: TemplateVariableIssue[] = [];
  let globalOffset = 0;

  for (const line of body.split("\n")) {
    const nodes: FreeTextTemplateNode[] = [];
    let cursor = 0;
    let bold = false;
    let boldOpener = -1;

    while (cursor < line.length) {
      const marker = line.indexOf("**", cursor);
      if (marker === -1) {
        const issues = appendTemplateNodes(nodes, line.slice(cursor), bold);
        variableIssues.push(...issues.map((issue) => ({ ...issue, offset: globalOffset + cursor + issue.offset })));
        cursor = line.length;
        break;
      }

      const issues = appendTemplateNodes(nodes, line.slice(cursor, marker), bold);
      variableIssues.push(...issues.map((issue) => ({ ...issue, offset: globalOffset + cursor + issue.offset })));
      const previousCharacter = marker > 0 ? line[marker - 1] : "";
      const nextCharacter = line[marker + 2] ?? "";
      const canOpen = Boolean(nextCharacter && !/\s/.test(nextCharacter));
      const canClose = Boolean(previousCharacter && !/\s/.test(previousCharacter));

      if (!bold && !canOpen) {
        formattingIssues.push({ code: "unexpected_bold_closer", offset: globalOffset + marker });
        cursor = marker + 2;
        continue;
      }
      if (bold && !canClose) {
        formattingIssues.push({
          code: canOpen ? "nested_bold" : "unclosed_bold",
          offset: globalOffset + marker,
        });
        cursor = marker + 2;
        continue;
      }
      if (bold && marker === boldOpener + 2) {
        formattingIssues.push({ code: "empty_bold", offset: globalOffset + boldOpener });
      }
      bold = !bold;
      boldOpener = bold ? marker : -1;
      cursor = marker + 2;
    }

    if (bold) {
      formattingIssues.push({ code: "unclosed_bold", offset: globalOffset + boldOpener });
    }
    for (const node of nodes) {
      if (node.type === "variable") variables.add(node.key);
    }
    paragraphs.push({ nodes });
    globalOffset += line.length + 1;
  }

  if (formattingIssues.length > 0) {
    return {
      success: false,
      error: "invalid_template_formatting",
      issues: formattingIssues.slice(0, 50),
    };
  }
  if (variableIssues.length > 0) {
    return {
      success: false,
      error: "invalid_template_variables",
      issues: variableIssues.slice(0, 50),
    };
  }
  return { success: true, paragraphs, variables: [...variables] };
}

export function resolveFreeReservationContractBody({
  body,
  snapshot,
  allowMissingTemplateVariables = false,
}: {
  body: string;
  snapshot: ReservationContractGenerationSnapshot;
  allowMissingTemplateVariables?: boolean;
}): ResolveFreeReservationContractBodyResult {
  const parsed = parseFreeReservationContractBody(body);
  if (!parsed.success) {
    return parsed.error === "invalid_template_formatting"
      ? { success: false, error: parsed.error, formattingIssues: parsed.issues }
      : { success: false, error: parsed.error, issues: parsed.issues };
  }

  const missingVariables = new Set<string>();
  const invalidVariables = new Set<string>();
  const paragraphs = parsed.paragraphs.map(({ nodes }) => ({
    runs: nodes.map((node): FreeTextRun => {
      if (node.type === "text") return { text: node.value, bold: node.bold };
      const definition = VARIABLE_BY_KEY.get(node.key)!;
      const value = definition.resolve(snapshot);
      if (value !== null && value !== undefined && value !== "") {
        if (value.includes("[[") || value.includes("]]")) {
          invalidVariables.add(node.key);
          return {
            text: `[Donnée invalide : la valeur « ${definition.missingLabel} » contient une syntaxe réservée]`,
            bold: node.bold,
          };
        }
        return { text: value, bold: node.bold };
      }
      missingVariables.add(node.key);
      return { text: `[Donnée manquante : ${definition.missingLabel}]`, bold: node.bold };
    }),
  }));

  if (invalidVariables.size > 0 && !allowMissingTemplateVariables) {
    return { success: false, error: "invalid_template_variable_value", invalidVariables: [...invalidVariables] };
  }
  if (missingVariables.size > 0 && !allowMissingTemplateVariables) {
    return { success: false, error: "missing_template_variables", missingVariables: [...missingVariables] };
  }
  return {
    success: true,
    paragraphs,
    text: paragraphs.map((paragraph) => paragraph.runs.map((run) => run.text).join("")).join("\n"),
    missingVariables: [...missingVariables],
  };
}

export function resolveFreeReservationContractDefinition({
  definition,
  snapshot,
  allowMissingTemplateVariables = false,
}: {
  definition: FreeReservationContractTemplateDefinition;
  snapshot: ReservationContractGenerationSnapshot;
  allowMissingTemplateVariables?: boolean;
}) {
  if (definition.title.includes("**")) {
    return {
      success: false as const,
      error: "invalid_template_formatting" as const,
      formattingIssues: [{ code: "formatting_in_title" as const, offset: definition.title.indexOf("**") }],
    };
  }
  const title = resolveReservationContractText({
    text: definition.title,
    snapshot,
    allowMissingTemplateVariables,
  });
  if (!title.success) return title;
  const body = resolveFreeReservationContractBody({
    body: definition.body,
    snapshot,
    allowMissingTemplateVariables,
  });
  if (!body.success) return body;
  return {
    success: true as const,
    title: title.text,
    body: body.text,
    bodyParagraphs: body.paragraphs,
    missingVariables: [...new Set([...title.missingVariables, ...body.missingVariables])],
  };
}
