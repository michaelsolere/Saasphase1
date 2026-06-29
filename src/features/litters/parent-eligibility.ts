export type LitterParentRole = "mother" | "father";

export type LitterParentCandidate = {
  id: string;
  sex: string | null;
  species: string | null;
  status: string | null;
  ownership_status: string | null;
  is_breeder: boolean | null;
  is_external: boolean | null;
  is_retired: boolean | null;
  deleted_at?: string | null;
};

const homeBreedingOwnershipStatuses = new Set([
  "owned",
  "co_owned",
  "produced",
]);

const blockedParentStatuses = new Set([
  "adopted",
  "archived",
  "deceased",
  "retired",
]);

export function isEligibleLitterParent(
  animal: LitterParentCandidate,
  role: LitterParentRole,
  litterSpecies: string,
) {
  if (animal.deleted_at) {
    return false;
  }

  if (animal.species !== litterSpecies) {
    return false;
  }

  if (!animal.is_breeder) {
    return false;
  }

  if (animal.is_retired) {
    return false;
  }

  if (animal.status && blockedParentStatuses.has(animal.status)) {
    return false;
  }

  if (animal.ownership_status === "adopted_out") {
    return false;
  }

  if (role === "mother") {
    if (animal.sex !== "female") {
      return false;
    }

    if (animal.is_external) {
      return animal.ownership_status === "external_female";
    }

    return homeBreedingOwnershipStatuses.has(animal.ownership_status ?? "");
  }

  if (animal.sex !== "male") {
    return false;
  }

  if (animal.is_external) {
    return animal.ownership_status === "external_stud";
  }

  return homeBreedingOwnershipStatuses.has(animal.ownership_status ?? "");
}

export function filterEligibleLitterParents<T extends LitterParentCandidate>(
  animals: T[],
  role: LitterParentRole,
  litterSpecies: string | null,
) {
  const species = litterSpecies || "dog";

  return animals.filter((animal) =>
    isEligibleLitterParent(animal, role, species),
  );
}
