import type { LitterJournalListItem } from "@/features/litter-journal/types";
import type { WhelpingSessionSummary } from "@/features/whelping/whelping-core";

export function parsePublicLitterIndex(value: string | undefined): number | null {
  if (value === undefined || !/^(0|[1-9]\d*)$/.test(value)) return null;

  const index = Number(value);
  return Number.isSafeInteger(index) ? index : null;
}

export function selectDefaultMobileLitterIndex(
  litters: LitterJournalListItem[],
  sessionsByLitterIndex: ReadonlyArray<readonly WhelpingSessionSummary[]>,
): number | null {
  if (litters.length === 0) return null;

  let selectedIndex = 0;
  let latestOpenStartedAt: string | null = null;
  sessionsByLitterIndex.forEach((sessions, index) => {
    for (const session of sessions) {
      if (
        session.status === "open" &&
        (latestOpenStartedAt === null ||
          session.startedAt.localeCompare(latestOpenStartedAt) > 0)
      ) {
        selectedIndex = index;
        latestOpenStartedAt = session.startedAt;
      }
    }
  });

  return selectedIndex;
}

export function resolveMobileLitterIndex(
  requestedValue: string | undefined,
  litterCount: number,
  defaultIndex: number | null,
): number | null {
  const requestedIndex = parsePublicLitterIndex(requestedValue);
  return requestedIndex !== null && requestedIndex < litterCount
    ? requestedIndex
    : defaultIndex;
}
