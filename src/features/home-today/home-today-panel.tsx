import Link from "next/link";

import type {
  AdopterAppointmentBreedingCalendarEvent,
  ReproductiveCycleBreedingCalendarEvent,
} from "@/features/breeding-calendar/breeding-calendar-contract";
import {
  filterAdopterAppointmentsForToday,
  filterReproductiveCyclesForToday,
} from "@/features/breeding-calendar/breeding-calendar-projection";
import type { CalendarReminderSummary } from "@/features/breeding-calendar/calendar-reminders-core";
import {
  reproductiveCycleCalendarStatusLabels,
} from "@/features/breeding-calendar/reproductive-cycle-calendar";
import { getSexPreferenceLabel } from "@/features/applications/formatters";
import { formatLitterDate } from "@/features/litters/formatters";
import { getDocumentTypeLabel } from "@/features/documents/formatters";
import { formatPrice } from "@/features/reservations/formatters";
import { getPaymentTypeLabel } from "@/features/payments/formatters";
import { projectLitterCareToday } from "@/features/litter-journal/litter-care-today";
import type { LitterCareTaskSummary } from "@/features/litter-journal/litter-care-tasks-core";
import {
  LitterCareTodayQuickActions as LitterCareTodayQuickActionsComponent,
  type LitterCareTodayQuickActions,
} from "@/features/litter-journal/litter-care-today-quick-actions";
import type { LitterWeighingTodayProjection } from "@/features/litter-weights/litter-weighing-today";
import { LitterWeighingTodayCard } from "@/features/litter-weights/litter-weighing-today-card";
import {
  buildHomeTodayTabs,
  selectPostAdoptionAlertRows,
  type HomeTodayItem,
  type HomeTodaySectionInput,
} from "@/features/home-today/home-today-model";
import type { loadHomeTodaySections } from "@/features/home-today/home-today-data";
import {
  HomeTodaySectionCard,
  HomeTodayZoneLabel,
} from "@/features/home-today/home-today-section";

type Sections = Awaited<ReturnType<typeof loadHomeTodaySections>>;

function unavailableNote(subject: string) {
  return (
    <p className="mt-2 text-sm text-muted">
      {subject} momentanément indisponible — aucune donnée n’a été modifiée.
    </p>
  );
}

function buildAdopterItems(sections: Sections): HomeTodaySectionInput[] {
  const inputs: HomeTodaySectionInput[] = [];

  if (sections.adopter.failed) {
    // The whole adopter read failed: surface a single placeholder section so
    // the failure is visible without breaking the page.
    return [];
  }
  const data = sections.adopter.data;

  const applicationItems: HomeTodayItem[] = data.applications.map((application) => ({
    id: `application-${application.id}`,
    title: application.contact_display_name ?? "Candidat anonyme",
    href: `/candidatures/${application.id}`,
    meta: `${application.breed ?? "Race non spécifiée"} · ${getSexPreferenceLabel(application.desired_sex_preference)}${
      application.submitted_at || application.created_at
        ? ` · reçue le ${formatLitterDate(application.submitted_at || application.created_at)}`
        : ""
    }`,
    tagLabel: "À valider",
    tagTone: "amber",
  }));

  if (data.suspectFormSubmissionsCount > 0) {
    applicationItems.push({
      id: "suspect-submissions-banner",
      title: `${data.suspectFormSubmissionsCount} soumission${data.suspectFormSubmissionsCount === 1 ? "" : "s"} publique${data.suspectFormSubmissionsCount === 1 ? "" : "s"} suspecte${data.suspectFormSubmissionsCount === 1 ? "" : "s"} à examiner`,
      href: "/form-submissions",
      meta: "Doublon présumé — à examiner avant tout traitement.",
      tagLabel: "Suspect",
      tagTone: "amber",
    });
  }

  inputs.push({
    key: "applications",
    title: "Candidatures & soumissions à examiner",
    zoneLabel: "Entrée en relation",
    tab: "adopter",
    items: applicationItems,
    seeAllHref: "/candidatures",
  });

  inputs.push({
    key: "payments",
    title: "Paiements attendus & résolutions financières",
    zoneLabel: "Dossiers en cours",
    tab: "adopter",
    items: data.payments.map((payment) => ({
      id: `payment-${payment.id}`,
      title: `${formatPrice(payment.amount_cents, payment.currency)} — ${getPaymentTypeLabel(payment.payment_type)}`,
      href: `/payments/${payment.id}`,
      meta: payment.due_date
        ? `Échéance : ${formatLitterDate(payment.due_date)}`
        : "Sans échéance",
      tagLabel: "Attendu",
      tagTone: "amber",
      dueDate: payment.due_date,
    })),
    seeAllHref: "/payments?filter=expected",
  });

  inputs.push({
    key: "documents",
    title: "Documents à générer ou non signés",
    zoneLabel: "Dossiers en cours",
    tab: "adopter",
    items: data.documents.map((document) => ({
      id: `document-${document.id}`,
      title: document.title || getDocumentTypeLabel(document.document_type),
      href: `/documents/${document.id}`,
      meta: document.status === "sent" ? "Envoyé pour signature" : null,
      tagLabel: document.status === "to_generate" ? "À générer" : "Non signé",
      tagTone: "amber",
    })),
    seeAllHref: "/documents?filter=to_process",
  });

  inputs.push({
    key: "reservations",
    title: "Parcours adoptants à faire avancer",
    zoneLabel: "Dossiers en cours",
    tab: "adopter",
    items: data.reservationsAttention.map(({ reservation, detailLabel, tone }) => ({
      id: `reservation-${reservation.id}`,
      title: reservation.contact_display_name ?? "Contact anonyme",
      href: `/reservations/${reservation.id}${
        reservation.financial_resolution === "pending" ? "#financial-resolution" : ""
      }`,
      meta: [
        reservation.litter_name || reservation.litter_group_name || "Aucune portée liée",
        detailLabel,
      ].join(" · "),
      tagLabel: detailLabel,
      tagTone: tone,
    })),
    seeAllHref: "/reservations?action=due&view=current",
  });

  return inputs;
}

function postAdoptionItems(
  sections: Sections,
): HomeTodaySectionInput[] {
  if (sections.postAdoption.failed) return [];
  const alerts = selectPostAdoptionAlertRows(sections.postAdoption.data.rows, new Date().toISOString());
  const decisionItems: HomeTodayItem[] = alerts.decisionRequired.map((row) => ({
    id: `post-adoption-decision-${row.instanceId}`,
    title: `Suivi ${row.milestone.toUpperCase()} — ${row.animalName} (${row.contactName})`,
    href: `/post-adoption`,
    meta:
      row.lastDispatchStatus === "uncertain"
        ? "Résultat d’envoi incertain — nouvelle tentative à autoriser."
        : "Envoi suspendu — décision requise.",
    tagLabel: row.lastDispatchStatus === "uncertain" ? "À vérifier" : "Décision requise",
    tagTone: "amber",
  }));
  const dueItems: HomeTodayItem[] = alerts.due.map((row) => ({
    id: `post-adoption-due-${row.instanceId}`,
    title: `Suivi ${row.milestone.toUpperCase()} — ${row.animalName} (${row.contactName})`,
    href: `/post-adoption`,
    meta: "Questionnaire à envoyer — échéance arrivée.",
    tagLabel: "Échéance atteinte",
    tagTone: "rose",
    dueDate: row.scheduledAt ? row.scheduledAt.slice(0, 10) : null,
  }));
  return [
    {
      key: "post_adoption",
      title: "Suivi post-adoption T1/T2",
      zoneLabel: "Après le départ",
      tab: "adopter",
      items: [...decisionItems, ...dueItems],
      seeAllHref: "/post-adoption",
    },
  ];
}

function litterCareDueDate(task: LitterCareTaskSummary) {
  return task.itemKind === "window"
    ? task.retainedStartsOn ?? task.retainedEndsOn
    : task.plannedFor;
}

type BreedingQueue = {
  inputs: HomeTodaySectionInput[];
  activeTasks: LitterCareTaskSummary[];
  dueWeighings: LitterWeighingTodayProjection[];
  canWrite: boolean;
};

function buildBreedingQueue(
  sections: Sections,
  todayDate: string,
): BreedingQueue {
  if (sections.breeding.failed) {
    return { inputs: [], activeTasks: [], dueWeighings: [], canWrite: false };
  }
  const data = sections.breeding.data;

  const projection = projectLitterCareToday(data.tasks, {
    date: todayDate,
    localTime: "23:59",
  });
  const activeTasks = [
    ...projection.overdue,
    ...projection.dueToday,
    ...projection.openWindows,
  ];
  const dueWeighings = data.weighingProjections.filter(
    ({ state }) => state === "overdue" || state === "due_today",
  );

  const taskItems: HomeTodayItem[] = activeTasks.map((task) => ({
    id: `task-${task.id}`,
    title: task.title,
    href: `/litters/journal?litter=${encodeURIComponent(task.litterId)}`,
    meta: `Portée ${data.litterNames[task.litterId] ?? task.litterId}${projection.overdue.includes(task) ? " · en retard" : ""}`,
    tagLabel: projection.overdue.includes(task) ? "En retard" : "À faire",
    tagTone: projection.overdue.includes(task) ? "rose" : "amber",
    dueDate: litterCareDueDate(task),
  }));

  const weighingItems: HomeTodayItem[] = dueWeighings.map((projection_) => ({
    id: `weighing-${projection_.litterId}-${projection_.state}-${projection_.scheduledOn ?? "extra"}`,
    title: "Pesée de portée",
    href: `/litters/journal?litter=${encodeURIComponent(projection_.litterId)}#litter-weights`,
    meta:
      data.litterNames[projection_.litterId] ?? projection_.litterId,
    tagLabel: projection_.state === "overdue" ? "Pesée en retard" : "Pesée due aujourd’hui",
    tagTone: projection_.state === "overdue" ? "rose" : "amber",
  }));

  const inputs: HomeTodaySectionInput[] = [
    {
      key: "litter_today",
      title: "Portées — tâches & pesées",
      zoneLabel: "Tâches du jour",
      tab: "breeding",
      items: [...weighingItems, ...taskItems],
      seeAllHref: "/calendar/today",
      seeAllLabel: "Ouvrir Aujourd’hui →",
    },
    reproductionSection(data.reproductiveCycles, todayDate),
    appointmentsAndRemindersSection(data.appointments, data.reminders, todayDate),
  ].filter((section): section is HomeTodaySectionInput => section !== null);

  return { inputs, activeTasks, dueWeighings, canWrite: data.canWrite };
}

function reproductionSection(
  cycles: readonly ReproductiveCycleBreedingCalendarEvent[],
  todayDate: string,
): HomeTodaySectionInput | null {
  const { plannedToday, inProgress } = filterReproductiveCyclesForToday(cycles, todayDate);
  const items = [
    ...inProgress.map((cycle) => ({
      id: `cycle-${cycle.sourceRecordId}`,
      title: cycle.title,
      href: cycle.href,
      meta: `Chaleurs en cours — ${cycle.contextLabel}`,
      tagLabel: reproductiveCycleCalendarStatusLabels[cycle.cycleStatus],
      tagTone: "sky" as const,
    })),
    ...plannedToday.map((cycle) => ({
      id: `cycle-${cycle.sourceRecordId}`,
      title: cycle.title,
      href: cycle.href,
      meta: `Chaleurs prévues aujourd’hui — ${cycle.contextLabel}`,
      tagLabel: reproductiveCycleCalendarStatusLabels[cycle.cycleStatus],
      tagTone: "sky" as const,
    })),
  ];
  if (items.length === 0) return null;
  return {
    key: "reproduction",
    title: "Chaleurs & reproduction du cheptel",
    zoneLabel: "Reproduction",
    tab: "breeding",
    items,
    seeAllHref: "/calendar",
    seeAllLabel: "Ouvrir la reproduction →",
  };
}

function appointmentsAndRemindersSection(
  appointments: readonly AdopterAppointmentBreedingCalendarEvent[],
  reminders: readonly CalendarReminderSummary[],
  todayDate: string,
): HomeTodaySectionInput | null {
  const todayAppointments = filterAdopterAppointmentsForToday(appointments, todayDate);
  const items: HomeTodayItem[] = [
    ...todayAppointments.map((appointment) => ({
      id: `appointment-${appointment.sourceRecordId}`,
      title: appointment.title,
      href: appointment.href,
      meta: `${appointment.contextLabel}${appointment.startsLocalTime ? ` · ${appointment.startsLocalTime.slice(0, 5).replace(":", " h ")}` : ""}`,
      tagLabel: "Rendez-vous",
      tagTone: "sky" as const,
    })),
    ...reminders.map((reminder) => ({
      id: `reminder-${reminder.id}`,
      title:
        reminder.event?.title ??
        reminder.scheduleLabel ??
        "Rappel du calendrier",
      href: "/calendar",
      meta: reminder.scheduleLabel
        ? `Rappel · ${reminder.scheduleLabel}`
        : "Rappel du calendrier",
      tagLabel: null as string | null,
      tagTone: undefined as HomeTodayItem["tagTone"],
    })),
  ];
  if (items.length === 0) return null;
  return {
    key: "reminders",
    title: "Rendez-vous du jour & rappels",
    zoneLabel: "Aujourd’hui",
    tab: "breeding",
    items,
    seeAllHref: "/calendar",
    seeAllLabel: "Ouvrir le calendrier →",
  };
}

function TabPill({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap ${
        active ? "border-accent bg-accent text-white" : "bg-surface text-muted hover:border-accent"
      }`}
    >
      {label}
      {count > 0 ? <span className="font-normal opacity-75">{count}</span> : null}
    </Link>
  );
}

export function HomeTodayPanel({
  sections,
  quickActions = [],
  activeTab = "adopter",
}: {
  sections: Sections;
  quickActions?: LitterCareTodayQuickActions[];
  activeTab?: "adopter" | "breeding";
}) {
  const now = new Date();
  const todayDate =
    !sections.breeding.failed && sections.breeding.data.todayDate
      ? sections.breeding.data.todayDate
      : formatHomeTodayCivilFallback(now);
  const breedingQueue = buildBreedingQueue(sections, todayDate);
  const tabs = buildHomeTodayTabs({
    sections: [
      ...buildAdopterItems(sections),
      ...postAdoptionItems(sections),
      ...breedingQueue.inputs,
    ],
  });
  const quickActionsByTaskId = new Map(
    quickActions.map((actions) => [actions.taskId, actions]),
  );
  const activeTasksByItemId = new Map(
    breedingQueue.activeTasks.map((task) => [`task-${task.id}`, task]),
  );
  const weighingsByItemId = new Map(
    breedingQueue.dueWeighings.map(
      (projection_) => [
        `weighing-${projection_.litterId}-${projection_.state}-${projection_.scheduledOn ?? "extra"}`,
        projection_,
      ] as const,
    ),
  );

  const adopterSections = tabs.sections.filter((section) => section.tab === "adopter");
  const breedingSections = tabs.sections.filter((section) => section.tab === "breeding");

  return (
    <div className="space-y-4">
      <nav aria-label="Zones d’action" className="flex gap-2 overflow-x-auto py-2">
        <TabPill
          href="/?tab=adopter"
          label="Parcours adoptant"
          count={tabs.adopterCount}
          active={activeTab === "adopter"}
        />
        <TabPill
          href="/?tab=breeding"
          label="Élevage"
          count={tabs.breedingCount}
          active={activeTab === "breeding"}
        />
      </nav>

      {tabs.isEmpty && !sections.adopter.failed ? (
        // Empty state only when the (successful) reads genuinely found
        // nothing. A failed adopter read must never masquerade as "all
        // caught up" — its unavailable note renders instead below.
        <section className="rounded-2xl border bg-surface p-16 text-center">
          <p className="text-4xl">🎉</p>
          <h2 className="mt-2 text-xl font-semibold">Tout est à jour</h2>
          <p className="mt-1 text-sm text-muted">
            Aucune action ne demande votre attention aujourd’hui.
          </p>
        </section>
      ) : null}
      {(activeTab === "adopter" || !tabs.isEmpty) && sections.adopter.failed ? (
        unavailableNote("La file parcours adoptant")
      ) : null}
      {(activeTab === "breeding" || (!tabs.isEmpty && activeTab === "adopter")) &&
      sections.breeding.failed ? (
        unavailableNote("La file élevage")
      ) : null}
      {!tabs.isEmpty
        ? (activeTab === "adopter"
            ? renderGroupedSections(adopterSections, todayDate)
            : renderGroupedSections(breedingSections, todayDate, (section) =>
                section.key === "litter_today" && !sections.breeding.failed ? (
                  <ul className="mt-3">
                    {renderLitterTodayRows({
                      section,
                      activeTasksByItemId,
                      weighingsByItemId,
                      quickActionsByTaskId,
                      todayDate,
                      canWrite: breedingQueue.canWrite,
                    })}
                  </ul>
                ) : undefined,
              ))
        : null}
    </div>
  );
}

/**
 * Rows of the "Portées — tâches & pesées" section: weighing projections use
 * the shared one-click card, care tasks carry the same quick actions as
 * /calendar/today (done / not applicable via resolveLitterCareTaskAction).
 */
function renderLitterTodayRows({
  section,
  activeTasksByItemId,
  weighingsByItemId,
  quickActionsByTaskId,
  todayDate,
  canWrite,
}: {
  section: ReturnType<typeof buildHomeTodayTabs>["sections"][number];
  activeTasksByItemId: Map<string, LitterCareTaskSummary>;
  weighingsByItemId: Map<string, LitterWeighingTodayProjection>;
  quickActionsByTaskId: Map<string, LitterCareTodayQuickActions>;
  todayDate: string | null;
  canWrite: boolean;
}) {
  return section.items.map((item) => {
    const weighing = weighingsByItemId.get(item.id);
    if (weighing) {
      return (
        <LitterWeighingTodayCard
          key={item.id}
          projection={weighing}
          context="organization"
          canWrite={canWrite}
        />
      );
    }
    const task = activeTasksByItemId.get(item.id);
    const actions = task ? quickActionsByTaskId.get(task.id) ?? null : null;
    return (
      <HomeTodayRowWithActions
        key={item.id}
        item={item}
        todayDate={todayDate}
        actions={
          task && actions ? (
            <LitterCareTodayQuickActionsComponent
              task={task}
              actions={actions}
              scheduleActions={null}
            />
          ) : null
        }
      />
    );
  });
}

function HomeTodayRowWithActions({
  item,
  todayDate,
  actions,
}: {
  item: HomeTodayItem;
  todayDate: string | null;
  actions: React.ReactNode;
}) {
  const dueLabel =
    todayDate && item.dueDate
      ? item.dueDate < todayDate
        ? "En retard"
        : item.dueDate === todayDate
          ? "Aujourd’hui"
          : null
      : null;
  return (
    <li className="min-w-0 rounded-xl border bg-background px-4 py-3">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href={item.href} className="break-words font-semibold text-accent hover:underline">
            {item.title}
          </Link>
          {item.meta ? (
            <p className="mt-0.5 break-words text-sm text-muted">{item.meta}</p>
          ) : null}
          {dueLabel ? (
            <p className={`mt-1 text-xs font-semibold ${dueLabel === "En retard" ? "text-rose-700" : "text-muted"}`}>
              {dueLabel}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </li>
  );
}

function renderGroupedSections(
  sections: ReturnType<typeof buildHomeTodayTabs>["sections"],
  todayDate: string | null,
  renderRows?: (section: ReturnType<typeof buildHomeTodayTabs>["sections"][number]) => React.ReactNode,
) {
  let lastZone: string | null = null;
  return sections.map((section) => {
    const showZone = section.zoneLabel !== lastZone;
    lastZone = section.zoneLabel;
    const rows = renderRows?.(section);
    return (
      <div key={section.key}>
        {showZone ? <HomeTodayZoneLabel label={section.zoneLabel} /> : null}
        {rows !== undefined ? (
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
            {rows}
          </section>
        ) : (
          <HomeTodaySectionCard section={section} todayDate={todayDate} />
        )}
      </div>
    );
  });
}

function formatHomeTodayCivilFallback(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
