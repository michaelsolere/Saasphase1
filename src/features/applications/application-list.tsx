"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApplicationStatusActionDialog } from "@/features/applications/application-status-action-dialog";
import {
  buildCandidateWorkbenchPath,
  getCandidateNextAction,
  type CandidateWorkbenchSort,
} from "@/features/applications/candidate-workbench-model";
import {
  formatApplicationDate,
  getApplicationStatusLabel,
  getSexPreferenceLabel,
} from "@/features/applications/formatters";
import { isApplicationToValidateStatus } from "@/features/applications/statuses";
import type {
  ApplicationFilter,
  ApplicationOverview,
} from "@/features/applications/types";

function getEmptyMessage(filter: ApplicationFilter) {
  if (filter === "attention") return "Aucun candidat à suivre";
  if (filter === "to_validate") return "Aucune candidature à valider";
  if (filter === "validated") return "Aucune candidature validée";
  if (filter === "unsuccessful") return "Aucune candidature non aboutie";
  return "Aucune candidature reçue";
}

function nextActionClassName(tone: string) {
  if (tone === "attention") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "follow_up") return "border-accent/20 bg-accent-soft text-accent";
  return "border-border bg-background text-muted";
}

export function ApplicationList({
  applications,
  filter,
  initialSearch = "",
  initialSelectedId = null,
  initialSort = "newest",
}: {
  applications: ApplicationOverview[];
  filter: ApplicationFilter;
  initialSearch?: string;
  initialSelectedId?: string | null;
  initialSort?: CandidateWorkbenchSort;
}) {
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState<CandidateWorkbenchSort>(initialSort);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const visibleApplications = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    const filtered = needle
      ? applications.filter((application) =>
          [
            application.contact_display_name,
            application.contact_email,
            application.contact_phone,
            application.project_description,
          ]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase("fr").includes(needle)),
        )
      : applications;

    return [...filtered].sort((left, right) => {
      if (sort === "name") {
        return (left.contact_display_name ?? "").localeCompare(
          right.contact_display_name ?? "",
          "fr",
        );
      }
      return new Date(right.submitted_at ?? right.created_at ?? 0).getTime() -
        new Date(left.submitted_at ?? left.created_at ?? 0).getTime();
    });
  }, [applications, search, sort]);

  const effectiveSelectedId =
    selectedId && visibleApplications.some((item) => item.id === selectedId)
      ? selectedId
      : selectedId
        ? visibleApplications[0]?.id ?? null
        : null;

  useEffect(() => {
    const path = buildCandidateWorkbenchPath({
      filter,
      search,
      selectedId: effectiveSelectedId,
      sort,
    });
    window.history.replaceState(window.history.state, "", path);
  }, [effectiveSelectedId, filter, search, sort]);

  const selectedIndex = visibleApplications.findIndex(
    (application) => application.id === effectiveSelectedId,
  );
  const selectedApplication = selectedIndex >= 0 ? visibleApplications[selectedIndex] : null;
  const returnPath = buildCandidateWorkbenchPath({
    filter,
    search,
    selectedId: effectiveSelectedId,
    sort,
  });

  if (applications.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
        <p className="text-lg font-semibold">{getEmptyMessage(filter)}</p>
        <p className="mt-2 text-sm text-muted">Les nouvelles candidatures apparaîtront ici après leur envoi.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Rechercher
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom, email, téléphone ou projet"
            className="mt-2 w-full rounded-xl border bg-background px-4 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-accent"
          />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Trier
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value === "name" ? "name" : "newest")}
            className="mt-2 w-full rounded-xl border bg-background px-4 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-accent"
          >
            <option value="newest">Plus récentes</option>
            <option value="name">Nom</option>
          </select>
        </label>
        <p className="pb-2 text-sm font-medium text-muted">{visibleApplications.length} dossier{visibleApplications.length > 1 ? "s" : ""}</p>
      </div>

      <div className="grid min-h-[560px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-full border-collapse text-left text-sm text-foreground">
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="bg-background px-4 py-3">Candidat</th>
                  <th className="bg-background px-4 py-3">Statut</th>
                  <th className="hidden bg-background px-4 py-3 min-[1500px]:table-cell">Préférence</th>
                  <th className="hidden bg-background px-4 py-3 min-[1500px]:table-cell">Reçue le</th>
                  <th className="bg-background px-4 py-3">Prochaine action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleApplications.map((application) => {
                  const nextAction = getCandidateNextAction({
                    status: application.status,
                    preReservationProgressLabel: application.pre_reservation_progress_label,
                  });
                  const isSelected = application.id === effectiveSelectedId;
                  return (
                    <tr key={application.id} className={isSelected ? "bg-accent-soft" : "hover:bg-background"}>
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={(event) => {
                            mobileTriggerRef.current = event.currentTarget;
                            setSelectedId(application.id);
                          }}
                          aria-pressed={isSelected}
                          className="text-left font-semibold text-accent hover:underline"
                        >
                          {application.contact_display_name ?? "Nom non disponible"}
                        </button>
                        <p className="mt-1 text-xs text-muted">{application.contact_email ?? "Email non renseigné"}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="inline-flex rounded-full border bg-surface px-2.5 py-0.5 text-xs font-semibold text-muted">
                          {getApplicationStatusLabel(application.status)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 align-top min-[1500px]:table-cell">{getSexPreferenceLabel(application.desired_sex_preference)}</td>
                      <td className="hidden whitespace-nowrap px-4 py-3 align-top text-muted min-[1500px]:table-cell">{formatApplicationDate(application.submitted_at ?? application.created_at)}</td>
                      <td className="px-4 py-3 align-top font-medium">{nextAction.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleApplications.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-muted">Aucun candidat ne correspond à cette recherche.</p>
          ) : null}
        </div>

        <aside
          aria-label="Dossier candidat sélectionné"
          className="hidden h-fit rounded-2xl border bg-surface p-5 shadow-sm lg:sticky lg:top-6 lg:block"
        >
          {!selectedApplication ? (
            <div className="py-16 text-center">
              <p className="font-semibold">Sélectionnez un candidat</p>
              <p className="mt-2 text-sm text-muted">Son projet et les actions disponibles apparaîtront ici.</p>
            </div>
          ) : (
            <CandidatePanel
              application={selectedApplication}
              returnPath={returnPath}
              hasPrevious={selectedIndex > 0}
              hasNext={selectedIndex < visibleApplications.length - 1}
              onClose={() => setSelectedId(null)}
              onPrevious={() => setSelectedId(visibleApplications[selectedIndex - 1]?.id ?? null)}
              onNext={() => setSelectedId(visibleApplications[selectedIndex + 1]?.id ?? null)}
            />
          )}
        </aside>
      </div>

      <Dialog
        open={isMobileViewport && selectedApplication !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        {selectedApplication ? (
          <DialogContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              mobileTriggerRef.current?.focus();
            }}
            className="left-0 top-0 block h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none border-0 bg-surface p-5 [&>button:last-child]:hidden"
          >
            <DialogTitle className="sr-only">
              Dossier candidat {selectedApplication.contact_display_name ?? "sans nom"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Résumé du candidat et actions disponibles.
            </DialogDescription>
            <CandidatePanel
              application={selectedApplication}
              returnPath={returnPath}
              hasPrevious={selectedIndex > 0}
              hasNext={selectedIndex < visibleApplications.length - 1}
              onClose={() => setSelectedId(null)}
              onPrevious={() => setSelectedId(visibleApplications[selectedIndex - 1]?.id ?? null)}
              onNext={() => setSelectedId(visibleApplications[selectedIndex + 1]?.id ?? null)}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function CandidatePanel({
  application,
  returnPath,
  hasPrevious,
  hasNext,
  onClose,
  onPrevious,
  onNext,
}: {
  application: ApplicationOverview;
  returnPath: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const nextAction = getCandidateNextAction({
    status: application.status,
    preReservationProgressLabel: application.pre_reservation_progress_label,
  });
  const candidateName = application.contact_display_name ?? "Nom non disponible";

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">Dossier candidat</p>
          <h2 className="mt-1 truncate text-xl font-semibold">{candidateName}</h2>
          <p className="mt-1 text-sm text-muted">{getApplicationStatusLabel(application.status)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-background">Fermer</button>
      </div>

      <div className={`mt-4 rounded-xl border px-4 py-3 ${nextActionClassName(nextAction.tone)}`}>
        <p className="text-xs font-semibold uppercase tracking-wide">Prochaine action</p>
        <p className="mt-1 font-semibold">{nextAction.label}</p>
        <p className="mt-1 text-xs leading-5">{nextAction.detail}</p>
      </div>

      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div><dt className="text-xs font-semibold uppercase text-muted">Email</dt><dd className="mt-1 break-words">{application.contact_email ?? "Non renseigné"}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-muted">Téléphone</dt><dd className="mt-1">{application.contact_phone ?? "Non renseigné"}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-muted">Préférence</dt><dd className="mt-1">{getSexPreferenceLabel(application.desired_sex_preference)}</dd></div>
        <div><dt className="text-xs font-semibold uppercase text-muted">Source</dt><dd className="mt-1">{application.public_form_name ?? application.public_form_slug ?? "Non précisée"}</dd></div>
      </dl>

      <section className="mt-5 border-t pt-5">
        <h3 className="text-sm font-semibold">Projet d’adoption</h3>
        <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-muted">{application.project_description || "Aucune description renseignée."}</p>
      </section>

      {application.decision_note_preview ? (
        <section className="mt-5 border-t pt-5">
          <h3 className="text-sm font-semibold">Dernière décision</h3>
          <p className="mt-2 text-sm leading-6 text-muted">{application.decision_note_preview}</p>
        </section>
      ) : null}

      {application.id && isApplicationToValidateStatus(application.status) ? (
        <div className="mt-5 border-t pt-5">
          <ApplicationStatusActionDialog applicationId={application.id} returnPath={returnPath} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-2 border-t pt-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {application.contact_id ? (
          <Link href={`/contacts/${application.contact_id}`} className="rounded-xl border px-3 py-2 text-center text-sm font-semibold text-accent hover:bg-accent-soft">Voir le contact</Link>
        ) : <span />}
        {application.id ? (
          <Link
            href={`/candidatures/${application.id}?return_to=${encodeURIComponent(returnPath)}`}
            className="rounded-xl bg-accent px-3 py-2 text-center text-sm font-semibold !text-white hover:opacity-90"
          >
            Agrandir le dossier
          </Link>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" disabled={!hasPrevious} onClick={onPrevious} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40">← Précédent</button>
        <button type="button" disabled={!hasNext} onClick={onNext} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40">Suivant →</button>
      </div>
    </div>
  );
}
