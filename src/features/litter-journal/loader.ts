import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import {
  ACTIVE_LITTER_JOURNAL_STATUSES,
  type LitterJournalDetails,
  type LitterJournalListItem,
  type LitterJournalSelection,
} from "./types";

type JournalClient = SupabaseClient<Database>;

function journalDueDate(litter: LitterJournalListItem) {
  return litter.actual_birth_date ?? litter.expected_birth_date;
}

function isUpcoming(date: string | null) {
  if (!date) {
    return false;
  }

  return date >= new Date().toISOString().slice(0, 10);
}

export function orderLitterJournalItems(
  litters: LitterJournalListItem[],
) {
  return [...litters].sort((left, right) => {
    const leftDueDate = journalDueDate(left);
    const rightDueDate = journalDueDate(right);
    const leftIsUpcoming = isUpcoming(leftDueDate);
    const rightIsUpcoming = isUpcoming(rightDueDate);

    if (leftIsUpcoming !== rightIsUpcoming) {
      return leftIsUpcoming ? -1 : 1;
    }

    if (leftIsUpcoming && rightIsUpcoming && leftDueDate && rightDueDate) {
      const byUpcomingDate = leftDueDate.localeCompare(rightDueDate);
      if (byUpcomingDate !== 0) {
        return byUpcomingDate;
      }
    }

    const leftCreatedAt = left.created_at ?? "";
    const rightCreatedAt = right.created_at ?? "";
    const byRecency = rightCreatedAt.localeCompare(leftCreatedAt);
    if (byRecency !== 0) {
      return byRecency;
    }

    return (left.id ?? "").localeCompare(right.id ?? "");
  });
}

export async function loadLitterJournal(
  supabase: JournalClient,
  requestedLitterId?: string,
): Promise<LitterJournalSelection> {
  const { data, error } = await supabase
    .from("litter_overview")
    .select(
      "id, name, species, breed, status, mother_id, mother_display_name, father_id, father_display_name, expected_birth_date, actual_birth_date, expected_puppy_count, born_total_count, alive_count, animal_count, reservation_count, created_at",
    )
    .in("status", ACTIVE_LITTER_JOURNAL_STATUSES)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Unable to load active litters for the journal.");
  }

  const litters = orderLitterJournalItems(
    (data ?? []) as LitterJournalListItem[],
  );
  const selectedLitter =
    litters.find((litter) => litter.id === requestedLitterId) ??
    litters[0] ??
    null;

  if (!selectedLitter?.id) {
    return { litters, selectedLitter: null, selectedDetails: null };
  }

  const { data: details, error: detailsError } = await supabase
    .from("litters")
    .select(
      "id, mating_date, mating_date_2, estimated_ovulation_date, pregnancy_confirmed_at, pregnancy_confirmation_method",
    )
    .eq("id", selectedLitter.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (detailsError) {
    throw new Error("Unable to load the selected litter journal.");
  }

  return {
    litters,
    selectedLitter,
    selectedDetails: details as LitterJournalDetails | null,
  };
}
