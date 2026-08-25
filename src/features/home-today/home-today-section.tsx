import Link from "next/link";

import {
  homeTodayDueLabel,
  type HomeTodayItem,
  type HomeTodaySection,
} from "@/features/home-today/home-today-model";

const tagToneClasses: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700 border-amber-200/60",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
  sky: "bg-sky-50 text-sky-700 border-sky-200/60",
  rose: "bg-rose-50 text-rose-700 border-rose-200/60",
};

function HomeTodayRow({
  item,
  todayDate,
}: {
  item: HomeTodayItem;
  todayDate: string | null;
}) {
  const dueLabel = todayDate ? homeTodayDueLabel(item.dueDate, todayDate) : null;
  const isOverdue = dueLabel === "En retard";
  return (
    <li className="flex min-w-0 items-center justify-between gap-4 border-b border-dashed py-2.5 last:border-none">
      <div className="min-w-0">
        <Link href={item.href} className="font-semibold text-accent hover:underline">
          {item.title}
        </Link>
        {item.meta ? (
          <p className="mt-0.5 break-words text-sm text-muted">{item.meta}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {item.tagLabel ? (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
              tagToneClasses[item.tagTone ?? "amber"]
            }`}
          >
            {item.tagLabel}
          </span>
        ) : null}
        {dueLabel ? (
          <span
            className={`text-xs whitespace-nowrap ${
              isOverdue ? "font-bold text-rose-700" : "text-muted"
            }`}
          >
            {dueLabel}
          </span>
        ) : null}
      </div>
    </li>
  );
}

export function HomeTodaySectionCard({
  section,
  todayDate,
  children,
}: {
  section: HomeTodaySection;
  todayDate?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6" aria-label={section.title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-base font-semibold">
          {section.title}
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
            {section.totalCount}
          </span>
        </h2>
        <Link
          href={section.seeAllHref}
          className="text-sm font-bold text-accent hover:underline"
        >
          {section.seeAllLabel}
        </Link>
      </div>
      <ul className="mt-3">
        {section.items.map((item) => (
          <HomeTodayRow key={item.id} item={item} todayDate={todayDate ?? null} />
        ))}
      </ul>
      {children}
    </section>
  );
}

export function HomeTodayZoneLabel({ label }: { label: string }) {
  return (
    <p className="mt-6 mb-1 text-xs font-bold uppercase tracking-wide text-muted first:mt-0">
      {label}
    </p>
  );
}
