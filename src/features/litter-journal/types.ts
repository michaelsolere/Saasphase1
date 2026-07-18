import type { Database } from "@/types/database.types";

export const ACTIVE_LITTER_JOURNAL_STATUSES = [
  "mating_done",
  "pregnancy_unconfirmed",
  "pregnancy_confirmed",
  "birth_expected",
  "birth_in_progress",
  "born",
  "puppies_created",
  "choice_period",
  "ready_to_leave",
] as const;

export type ActiveLitterJournalStatus =
  (typeof ACTIVE_LITTER_JOURNAL_STATUSES)[number];

export type LitterJournalListItem = Pick<
  Database["public"]["Views"]["litter_overview"]["Row"],
  | "id"
  | "name"
  | "species"
  | "breed"
  | "status"
  | "mother_id"
  | "mother_display_name"
  | "father_id"
  | "father_display_name"
  | "expected_birth_date"
  | "actual_birth_date"
  | "expected_puppy_count"
  | "born_total_count"
  | "alive_count"
  | "animal_count"
  | "reservation_count"
  | "created_at"
>;

export type LitterJournalDetails = Pick<
  Database["public"]["Tables"]["litters"]["Row"],
  | "id"
  | "mating_date"
  | "mating_date_2"
  | "estimated_ovulation_date"
  | "pregnancy_confirmed_at"
  | "pregnancy_confirmation_method"
>;

export type LitterJournalSelection = {
  litters: LitterJournalListItem[];
  selectedLitter: LitterJournalListItem | null;
  selectedDetails: LitterJournalDetails | null;
};
