"use client";

import { useRouter } from "next/navigation";

import { getLitterDisplayName } from "@/features/litters/formatters";

import type { LitterJournalListItem } from "./types";

export function LitterJournalSelector({
  litters,
  selectedLitterId,
  basePath = "/litters/journal",
  preservedSearchParams = {},
}: {
  litters: LitterJournalListItem[];
  selectedLitterId: string;
  basePath?: string;
  preservedSearchParams?: Record<string, string | undefined>;
}) {
  const router = useRouter();

  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-foreground sm:items-end">
      <span>Portée affichée</span>
      <select
        aria-label="Portée affichée"
        value={selectedLitterId}
        onChange={(event) => {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(preservedSearchParams)) {
            if (value) params.set(key, value);
          }
          params.set("litter", event.target.value);
          router.push(`${basePath}?${params.toString()}`);
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
