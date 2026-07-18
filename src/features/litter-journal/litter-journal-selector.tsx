"use client";

import { useRouter } from "next/navigation";

import { getLitterDisplayName } from "@/features/litters/formatters";

import type { LitterJournalListItem } from "./types";

export function LitterJournalSelector({
  litters,
  selectedLitterId,
}: {
  litters: LitterJournalListItem[];
  selectedLitterId: string;
}) {
  const router = useRouter();

  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-foreground sm:items-end">
      <span>Portée affichée</span>
      <select
        aria-label="Portée affichée"
        value={selectedLitterId}
        onChange={(event) => {
          router.push(`/litters/journal?litter=${encodeURIComponent(event.target.value)}`);
        }}
        className="min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground sm:w-72"
      >
        {litters.map((litter) => (
          <option key={litter.id} value={litter.id ?? ""}>
            {getLitterDisplayName(litter.name, litter.id)}
          </option>
        ))}
      </select>
    </label>
  );
}
