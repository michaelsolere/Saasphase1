"use client";

import { useRouter } from "next/navigation";

export type MobileLitterOption = {
  index: number;
  label: string;
};

export function WhelpingMobileSelector({
  options,
  selectedIndex,
}: {
  options: MobileLitterOption[];
  selectedIndex: number;
}) {
  const router = useRouter();

  if (options.length < 2) return null;

  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
      <span>Portée affichée</span>
      <select
        aria-label="Portée affichée"
        value={String(selectedIndex)}
        onChange={(event) => router.push(`/whelping?litter=${event.target.value}`)}
        className="min-h-11 min-w-0 max-w-full rounded-xl border bg-surface px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.index} value={option.index}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
