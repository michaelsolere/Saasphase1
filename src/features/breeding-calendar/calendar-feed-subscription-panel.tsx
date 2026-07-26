"use client";

import { useState, useTransition } from "react";

import {
  createOrRotateCalendarFeedAction,
  revokeCalendarFeedAction,
  updateCalendarFeedSourcesAction,
} from "@/features/breeding-calendar/calendar-feed-actions";
import {
  DEFAULT_CALENDAR_FEED_SOURCES,
  type CalendarFeedSources,
} from "@/features/breeding-calendar/calendar-feed-token";
import type { OrganizationCalendarFeedMetadata } from "@/features/breeding-calendar/calendar-feed-types";

type Props = {
  initialFeed: OrganizationCalendarFeedMetadata | null;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function sourcesFromFeed(feed: OrganizationCalendarFeedMetadata): CalendarFeedSources {
  return {
    includeLitterCare: feed.includeLitterCare,
    includeReproductiveCycle: feed.includeReproductiveCycle,
    includeAdopterAppointment: feed.includeAdopterAppointment,
  };
}

function SourceCheckboxes({
  sources,
  onChange,
  disabled,
}: {
  sources: CalendarFeedSources;
  onChange: (next: CalendarFeedSources) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">Sources du calendrier</legend>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={sources.includeLitterCare}
          aria-label="Portées"
          onChange={(event) =>
            onChange({ ...sources, includeLitterCare: event.target.checked })
          }
        />
        <span>Portées</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={sources.includeReproductiveCycle}
          aria-label="Cheptel — reproduction"
          onChange={(event) =>
            onChange({
              ...sources,
              includeReproductiveCycle: event.target.checked,
            })
          }
        />
        <span>Cheptel — reproduction</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={sources.includeAdopterAppointment}
          aria-label="Rendez-vous adoptants"
          onChange={(event) =>
            onChange({
              ...sources,
              includeAdopterAppointment: event.target.checked,
            })
          }
        />
        <span>
          Rendez-vous adoptants
          <span className="mt-1 block text-xs text-muted">
            Le résumé de l’événement inclut le nom du contact.
          </span>
        </span>
      </label>
    </fieldset>
  );
}

export function CalendarFeedSubscriptionPanel({ initialFeed }: Props) {
  const [feed, setFeed] = useState(initialFeed);
  const [sources, setSources] = useState<CalendarFeedSources>(
    initialFeed ? sourcesFromFeed(initialFeed) : DEFAULT_CALENDAR_FEED_SOURCES,
  );
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [editingSources, setEditingSources] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    setError(null);
    setCopyStatus(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError("La gestion de l’abonnement est momentanément indisponible.");
      }
    });
  }

  async function handleCreateOrRotate(confirmRotate: boolean) {
    if (feed && confirmRotate) {
      const confirmed = window.confirm(
        "L’ancien lien cessera immédiatement de fonctionner.",
      );
      if (!confirmed) return;
    }

    run(async () => {
      const result = await createOrRotateCalendarFeedAction({ sources });
      if (result.outcome !== "success") {
        setError(result.error.message);
        return;
      }
      setFeed(result.feed);
      setSources(sourcesFromFeed(result.feed));
      setRevealedUrl(result.feedUrl);
      setEditingSources(false);
    });
  }

  async function handleSaveSources() {
    if (!feed) return;
    run(async () => {
      const result = await updateCalendarFeedSourcesAction({
        feedId: feed.id,
        expectedRevisionNo: feed.revisionNo,
        sources,
      });
      if (result.outcome !== "success") {
        setError(result.error.message);
        return;
      }
      setFeed(result.feed);
      setSources(sourcesFromFeed(result.feed));
      setEditingSources(false);
    });
  }

  async function handleRevoke() {
    if (!feed) return;
    const confirmed = window.confirm(
      "Révoquer ce lien ? Les agendas externes ne pourront plus le lire. Aucune donnée métier ne sera modifiée.",
    );
    if (!confirmed) return;

    run(async () => {
      const result = await revokeCalendarFeedAction({
        feedId: feed.id,
        expectedRevisionNo: feed.revisionNo,
      });
      if (result.outcome !== "success") {
        setError(result.error.message);
        return;
      }
      setFeed(null);
      setRevealedUrl(null);
      setSources(DEFAULT_CALENDAR_FEED_SOURCES);
      setEditingSources(false);
    });
  }

  async function handleCopy() {
    if (!revealedUrl) return;
    try {
      await navigator.clipboard.writeText(revealedUrl);
      setCopyStatus("Lien copié.");
    } catch {
      setCopyStatus("Impossible de copier automatiquement. Sélectionnez le lien manuellement.");
    }
  }

  return (
    <section
      aria-labelledby="calendar-feed-heading"
      className="rounded-2xl border bg-surface p-5 sm:p-6"
      data-calendar-feed-panel
    >
      <h2 id="calendar-feed-heading" className="text-base font-semibold">
        Abonnement calendrier externe
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Abonnez un agenda externe (Apple, Google, Proton, Outlook…) à ce
        calendrier via une URL privée en lecture seule. Le SaaS reste la source
        de vérité : aucun événement externe n’est importé.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {error}
        </p>
      ) : null}

      {!feed ? (
        <div className="mt-5 space-y-4">
          <SourceCheckboxes sources={sources} onChange={setSources} disabled={pending} />
          <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted">
            Traitez l’URL comme un mot de passe : toute personne qui la possède
            peut consulter les sources sélectionnées.
          </p>
          <button
            type="button"
            disabled={pending}
            className="rounded-lg border bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
            onClick={() => void handleCreateOrRotate(false)}
          >
            Créer un lien d’abonnement
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">État</dt>
              <dd className="font-medium">Actif</dd>
            </div>
            <div>
              <dt className="text-muted">Créé / dernière rotation</dt>
              <dd className="font-medium">{formatDateTime(feed.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">Indice du jeton</dt>
              <dd className="font-mono font-medium">…{feed.tokenHint}</dd>
            </div>
            <div>
              <dt className="text-muted">Sources activées</dt>
              <dd className="font-medium">
                {[
                  feed.includeLitterCare ? "Portées" : null,
                  feed.includeReproductiveCycle ? "Cheptel — reproduction" : null,
                  feed.includeAdopterAppointment ? "Rendez-vous adoptants" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
          </dl>

          {revealedUrl ? (
            <div className="space-y-3 rounded-lg border border-dashed px-3 py-3">
              <p className="text-sm font-medium">
                Ajoutez cette URL comme abonnement par URL dans votre agenda
                externe.
              </p>
              <label className="block text-sm">
                <span className="text-muted">URL d’abonnement</span>
                <input
                  readOnly
                  value={revealedUrl}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
                  data-calendar-feed-url
                />
              </label>
              <p className="text-xs text-muted">
                Ce lien ne sera pas réaffiché après rechargement de la page.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                  onClick={() => void handleCopy()}
                >
                  Copier le lien
                </button>
                {copyStatus ? (
                  <p role="status" className="self-center text-sm text-muted">
                    {copyStatus}
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Le secret du lien n’est plus affiché. Générez un nouveau lien si
              vous l’avez perdu.
            </p>
          )}

          {editingSources ? (
            <div className="space-y-3">
              <SourceCheckboxes sources={sources} onChange={setSources} disabled={pending} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-lg border bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-60"
                  onClick={() => void handleSaveSources()}
                >
                  Enregistrer les sources
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                  onClick={() => {
                    setSources(sourcesFromFeed(feed));
                    setEditingSources(false);
                    setError(null);
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                onClick={() => setEditingSources(true)}
              >
                Modifier les sources
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"
                onClick={() => void handleCreateOrRotate(true)}
              >
                Générer un nouveau lien
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-medium text-amber-950 hover:bg-amber-50"
                onClick={() => void handleRevoke()}
              >
                Révoquer le lien
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
