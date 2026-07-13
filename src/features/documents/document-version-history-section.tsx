import { DocumentVersionHistoryList } from "@/features/documents/document-version-history-list";
import { readDocumentVersionHistory } from "@/features/documents/document-version-history";

export async function DocumentVersionHistorySection({
  documentId,
}: {
  documentId: string;
}) {
  const result = await readDocumentVersionHistory(documentId);

  if (result.outcome === "error") {
    return (
      <section className="rounded-2xl border bg-surface p-6 sm:p-8">
        <h2 className="text-xl font-semibold">Historique des versions</h2>
        <p className="mt-3 text-sm text-muted">
          L’historique de ce document n’est pas disponible.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-surface p-6 sm:p-8">
      <DocumentVersionHistoryList
        history={result.history}
        selectedDocumentId={documentId}
      />
    </section>
  );
}
