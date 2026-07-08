const assignableAnimalStatuses = new Set(["available"]);

export type AssignableAnimalCandidate = {
  litter_id: string | null;
  status: string | null;
  ownership_status: string | null;
  is_breeder: boolean | null;
  is_external: boolean | null;
  is_retired: boolean | null;
};

export function isAssignableReservationAnimal(
  animal: AssignableAnimalCandidate,
) {
  return (
    Boolean(animal.litter_id) &&
    assignableAnimalStatuses.has(animal.status ?? "") &&
    animal.ownership_status === "produced" &&
    !animal.is_breeder &&
    !animal.is_external &&
    !animal.is_retired
  );
}
