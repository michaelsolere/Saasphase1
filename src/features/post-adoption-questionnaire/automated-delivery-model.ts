const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string) {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new Error("Invalid date-only value.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Invalid date-only value.");
  }
  return { year, month, day, date };
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addExactDays(value: string, days: number) {
  if (!Number.isInteger(days)) throw new Error("Days must be an integer.");
  const { date } = parseDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

export function addCalendarMonths(value: string, months: number) {
  if (!Number.isInteger(months)) throw new Error("Months must be an integer.");
  const { year, month, day } = parseDateOnly(value);
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDay));
  return formatDateOnly(firstOfTarget);
}

type EligibilityInput = {
  milestone: "t1" | "t2";
  adoptionDate: string | null;
  birthDate: string | null;
  today: string;
};

type EligibilityResult =
  | { outcome: "eligible"; dueDate: string }
  | {
      outcome: "suspended";
      dueDate: string | null;
      reason:
        | "adoption_date_missing"
        | "birth_date_missing"
        | "t1_age_limit_exceeded"
        | "t2_due_before_adoption"
        | "t2_automatic_catchup_expired";
    };

export function evaluateAutomaticQuestionnaireEligibility(
  input: EligibilityInput,
): EligibilityResult {
  parseDateOnly(input.today);
  if (!input.adoptionDate) {
    return { outcome: "suspended", dueDate: null, reason: "adoption_date_missing" };
  }
  parseDateOnly(input.adoptionDate);
  if (!input.birthDate) {
    return { outcome: "suspended", dueDate: null, reason: "birth_date_missing" };
  }
  parseDateOnly(input.birthDate);

  if (input.milestone === "t1") {
    const dueDate = addExactDays(input.adoptionDate, 60);
    const ageLimit = addCalendarMonths(input.birthDate, 5);
    return dueDate <= ageLimit
      ? { outcome: "eligible", dueDate }
      : { outcome: "suspended", dueDate, reason: "t1_age_limit_exceeded" };
  }

  const dueDate = addCalendarMonths(input.birthDate, 15);
  if (dueDate < input.adoptionDate) {
    return { outcome: "suspended", dueDate, reason: "t2_due_before_adoption" };
  }
  if (input.today > addExactDays(dueDate, 30)) {
    return {
      outcome: "suspended",
      dueDate,
      reason: "t2_automatic_catchup_expired",
    };
  }
  return { outcome: "eligible", dueDate };
}
