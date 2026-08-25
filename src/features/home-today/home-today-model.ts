// Pure projection model for the authenticated home "today action queue".
// No server imports: everything here must stay testable without a database.

export type HomeTodayItem = {
  id: string;
  title: string;
  href: string;
  meta?: string | null;
  tagLabel?: string | null;
  tagTone?: "amber" | "green" | "sky" | "rose";
  dueDate?: string | null;
};

export type HomeTodayTabKey = "adopter" | "breeding";

export type HomeTodaySectionInput = {
  key: string;
  title: string;
  zoneLabel: string;
  tab: HomeTodayTabKey;
  items: HomeTodayItem[];
  seeAllHref: string;
  seeAllLabel?: string;
};

export type HomeTodaySection = {
  key: string;
  title: string;
  zoneLabel: string;
  tab: HomeTodayTabKey;
  items: HomeTodayItem[];
  totalCount: number;
  hiddenCount: number;
  seeAllHref: string;
  seeAllLabel: string;
};

export type HomeTodayTabs = {
  sections: HomeTodaySection[];
  adopterCount: number;
  breedingCount: number;
  isEmpty: boolean;
};

const MAX_ITEMS_PER_SECTION = 3;

// Canonical display order across both tabs (adopter journey first, breeding after).
const SECTION_ORDER = [
  "applications",
  "payments",
  "documents",
  "reservations",
  "post_adoption",
  "litter_today",
  "reproduction",
  "reminders",
] as const;

function compareBySectionOrder(a: HomeTodaySectionInput, b: HomeTodaySectionInput) {
  const left = SECTION_ORDER.indexOf(a.key as (typeof SECTION_ORDER)[number]);
  const right = SECTION_ORDER.indexOf(b.key as (typeof SECTION_ORDER)[number]);
  const leftRank = left === -1 ? SECTION_ORDER.length : left;
  const rightRank = right === -1 ? SECTION_ORDER.length : right;
  return leftRank - rightRank;
}

const DEFAULT_SEE_ALL_LABEL = "Voir tout →";

function compareByDueDate(a: HomeTodayItem, b: HomeTodayItem) {
  const left = a.dueDate ?? "";
  const right = b.dueDate ?? "";
  if (!left && right) return 1;
  if (left && !right) return -1;
  return left.localeCompare(right);
}

export function buildHomeTodayTabs(input: {
  sections: HomeTodaySectionInput[];
}): HomeTodayTabs {
  // Keep the declared order of sections; empty sections are dropped entirely.
  const sections: HomeTodaySection[] = [...input.sections]
    .sort(compareBySectionOrder)
    .filter((section) => section.items.length > 0)
    .map((section) => ({
      key: section.key,
      title: section.title,
      zoneLabel: section.zoneLabel,
      tab: section.tab,
      items: [...section.items]
        .sort(compareByDueDate)
        .slice(0, MAX_ITEMS_PER_SECTION),
      totalCount: section.items.length,
      hiddenCount: Math.max(0, section.items.length - MAX_ITEMS_PER_SECTION),
      seeAllHref: section.seeAllHref,
      seeAllLabel: section.seeAllLabel ?? DEFAULT_SEE_ALL_LABEL,
    }));

  return {
    sections,
    adopterCount: sections
      .filter((section) => section.tab === "adopter")
      .reduce((total, section) => total + section.totalCount, 0),
    breedingCount: sections
      .filter((section) => section.tab === "breeding")
      .reduce((total, section) => total + section.totalCount, 0),
    isEmpty: sections.length === 0,
  };
}

export function formatHomeTodayCivilDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Human label for a civil due date compared to today.
 * `dueDate` is a civil date (YYYY-MM-DD), `todayDate` likewise.
 */
export function homeTodayDueLabel(
  dueDate: string | null | undefined,
  todayDate: string,
) {
  if (!dueDate) return null;
  if (dueDate < todayDate) return "En retard";
  if (dueDate === todayDate) return "Aujourd’hui";
  return formatHomeTodayCivilDate(dueDate);
}

// Shape shared with PostAdoptionAutomationOverviewRow (kept structural so the
// model stays importable without server-only modules).
export type HomeTodayPostAdoptionRow = {
  instanceId: string;
  milestone: "t1" | "t2" | string;
  animalName: string;
  contactName: string;
  reservationId: string;
  automationState: string;
  reasonCode: string | null;
  scheduledAt: string | null;
  lastDispatchStatus: string | null;
};

export type HomeTodayPostAdoptionAlerts = {
  decisionRequired: HomeTodayPostAdoptionRow[];
  due: HomeTodayPostAdoptionRow[];
  ignored: HomeTodayPostAdoptionRow[];
};

function isPostAdoptionDecisionRequired(row: HomeTodayPostAdoptionRow) {
  // Same rule as the automation dashboard: a voluntary suspension or an
  // uncertain dispatch outcome requires an explicit human decision. A
  // suspension caused by the questionnaire incident itself is not one.
  return (
    (row.automationState === "suspended" && row.reasonCode !== "questionnaire_incident") ||
    row.lastDispatchStatus === "uncertain"
  );
}

export function selectPostAdoptionAlertRows(
  rows: readonly HomeTodayPostAdoptionRow[],
  nowIso: string,
): HomeTodayPostAdoptionAlerts {
  const nowMs = new Date(nowIso).getTime();
  const decisionRequired: HomeTodayPostAdoptionRow[] = [];
  const due: HomeTodayPostAdoptionRow[] = [];
  const ignored: HomeTodayPostAdoptionRow[] = [];

  for (const row of rows) {
    if (isPostAdoptionDecisionRequired(row)) {
      decisionRequired.push(row);
      continue;
    }
    if (
      row.scheduledAt !== null &&
      new Date(row.scheduledAt).getTime() <= nowMs
    ) {
      due.push(row);
      continue;
    }
    ignored.push(row);
  }

  // Most urgent first: overdue rows before those due right now.
  due.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  return { decisionRequired, due, ignored };
}
