export type ReservationDocumentType =
  | "commitment_certificate"
  | "reservation_contract";

type TaxonomySource = {
  species: string | null | undefined;
  breed: string | null | undefined;
};

type ReservationDocumentTemplateCandidate = TaxonomySource & {
  document_type: string;
  template_format: string;
  is_active: boolean;
  deleted_at: string | null;
};

export function normalizeDocumentTaxonomy(value: string) {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR");
}

export function resolveEffectiveReservationDocumentTaxonomy({
  animal,
  litter,
  application,
}: {
  animal?: TaxonomySource | null;
  litter?: TaxonomySource | null;
  application?: TaxonomySource | null;
}) {
  const species = animal?.species ?? litter?.species ?? application?.species;
  const breed = animal?.breed ?? litter?.breed ?? application?.breed;

  return species?.trim() && breed?.trim() ? { species, breed } : null;
}

export function isReservationDocumentTemplateCompatible({
  template,
  documentType,
  taxonomy,
}: {
  template: ReservationDocumentTemplateCandidate;
  documentType: ReservationDocumentType;
  taxonomy: TaxonomySource;
}) {
  return Boolean(
    template.is_active &&
      template.deleted_at === null &&
      template.template_format === "json" &&
      template.document_type === documentType &&
      taxonomy.species?.trim() &&
      taxonomy.breed?.trim() &&
      normalizeDocumentTaxonomy(template.species ?? "") ===
        normalizeDocumentTaxonomy(taxonomy.species) &&
      normalizeDocumentTaxonomy(template.breed ?? "") ===
        normalizeDocumentTaxonomy(taxonomy.breed),
  );
}
