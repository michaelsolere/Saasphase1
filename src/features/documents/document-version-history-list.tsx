import { getDocumentStatusLabel } from "@/features/documents/formatters";
import type {
  DocumentVersionHistory,
  DocumentVersionHistoryEntry,
} from "@/features/documents/document-version-history-core";

function formatGeneratedAt(value: string | null) {
  if (!value) return "Date de génération non renseignée";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function VersionActions({ entry }: { entry: DocumentVersionHistoryEntry }) {
  const originalPdf = entry.artifacts.find(
    (artifact) => artifact.kind === "original_pdf",
  );
  if (!originalPdf) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`/documents/${entry.documentId}/pdf`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
      >
        Ouvrir
      </a>
      <a
        href={`/documents/${entry.documentId}/pdf?download=1`}
        className="inline-flex rounded-lg border px-3 py-1.5 text-xs font-semibold text-accent transition hover:border-accent/40 hover:bg-accent-soft"
      >
        Télécharger
      </a>
    </div>
  );
}

function VersionRow({
  entry,
  selectedDocumentId,
}: {
  entry: DocumentVersionHistoryEntry;
  selectedDocumentId?: string;
}) {
  const isSelected = entry.documentId === selectedDocumentId;

  return (
    <li
      className={`rounded-xl border p-3 ${
        isSelected ? "border-accent/40 bg-accent-soft/40" : "bg-background"
      }`}
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {entry.version ? `Version ${entry.version}` : "Version non disponible"}
            </span>
            <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted">
              {entry.position === "current"
                ? "Version courante"
                : "Version historique remplacée"}
            </span>
            {isSelected ? (
              <span className="text-[11px] font-semibold text-accent">
                Fiche consultée
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted">
            Statut métier :{" "}
            {getDocumentStatusLabel(entry.businessStatus, entry.documentType)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatGeneratedAt(entry.generatedAt)}
          </p>
        </div>
        <VersionActions entry={entry} />
      </div>
      {entry.artifacts.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          Aucun PDF cohérent n’est disponible pour cette version.
        </p>
      ) : null}
    </li>
  );
}

export function DocumentVersionHistoryList({
  history,
  selectedDocumentId,
  compact = false,
}: {
  history: DocumentVersionHistory;
  selectedDocumentId?: string;
  compact?: boolean;
}) {
  const current = history.entries.find((entry) => entry.position === "current");
  const historical = history.entries.filter(
    (entry) => entry.position === "historical",
  );

  return (
    <div className={compact ? "mt-4 border-t pt-4" : "space-y-4"}>
      {!compact ? (
        <div>
          <h2 className="text-xl font-semibold">Historique des versions</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Le statut métier et la position dans la chaîne sont présentés
            séparément. Le PDF original de chaque version reste conservé.
          </p>
        </div>
      ) : null}

      {selectedDocumentId && selectedDocumentId !== history.currentDocumentId ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          Le PDF proposé ici est la version exacte archivée. Les autres données
          métier affichées sur la fiche peuvent refléter l’état actuel du
          dossier.
        </p>
      ) : null}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Version courante
        </p>
        <ul className="mt-2 space-y-2">
          {current ? (
            <VersionRow
              entry={current}
              selectedDocumentId={selectedDocumentId}
            />
          ) : null}
        </ul>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Versions historiques
        </p>
        {historical.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {historical.map((entry) => (
              <VersionRow
                key={entry.documentId}
                entry={entry}
                selectedDocumentId={selectedDocumentId}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">
            Aucune version historique dans cette chaîne.
          </p>
        )}
      </div>
    </div>
  );
}
