import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  reconstructDocumentVersionChainFromCurrent,
  type DocumentVersionHistory,
  type DocumentVersionSource,
} from "@/features/documents/document-version-history-core";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;

const versionFields =
  "id, organization_id, title, document_type, status, sent_at, replaces_document_id, superseded_at, generated_at, generation_data, template_id, reservation_document_variant_version_id, source_template_version, file_path, file_sha256, file_size_bytes, mime_type";

type DocumentVersionRow = Omit<
  DocumentVersionSource,
  "reservation_document_variant_version" | "template_label"
>;

async function hydrateDocumentVersionSource(
  row: DocumentVersionRow,
  supabase: Supabase,
): Promise<DocumentVersionSource | null> {
  const [template, variantVersion] = await Promise.all([
    row.template_id && row.source_template_version
      ? supabase
          .from("document_templates")
          .select("name")
          .eq("organization_id", row.organization_id)
          .eq("id", row.template_id)
          .eq("version", row.source_template_version)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.reservation_document_variant_version_id
      ? supabase
          .from("reservation_document_variant_versions")
          .select("version")
          .eq("organization_id", row.organization_id)
          .eq("id", row.reservation_document_variant_version_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (template.error || variantVersion.error) return null;

  return {
    ...row,
    template_label: template.data?.name ?? null,
    reservation_document_variant_version: variantVersion.data?.version ?? null,
  };
}

export type ReadDocumentVersionHistoryResult =
  | { outcome: "success"; history: DocumentVersionHistory }
  | { outcome: "error" };

async function findCurrentDocument(
  selectedDocument: DocumentVersionSource,
  supabase: Supabase,
) {
  let candidate = selectedDocument;
  const visited = new Set<string>();

  while (candidate.superseded_at !== null) {
    if (visited.has(candidate.id) || visited.size >= 100) return null;
    visited.add(candidate.id);

    const successor = await supabase
      .from("documents")
      .select(versionFields)
      .eq("organization_id", selectedDocument.organization_id)
      .eq("replaces_document_id", candidate.id)
      .is("deleted_at", null)
      .limit(2);

    if (successor.error || successor.data.length !== 1) return null;
    const hydrated = await hydrateDocumentVersionSource(
      successor.data[0] as DocumentVersionRow,
      supabase,
    );
    if (!hydrated) return null;
    candidate = hydrated;
  }

  return candidate;
}

export async function readDocumentVersionHistory(
  documentId: string,
  providedSupabase?: Supabase,
): Promise<ReadDocumentVersionHistoryResult> {
  const supabase = providedSupabase ?? (await createClient());
  const selected = await supabase
    .from("documents")
    .select(versionFields)
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (selected.error || !selected.data) return { outcome: "error" };
  const hydratedSelected = await hydrateDocumentVersionSource(
    selected.data as DocumentVersionRow,
    supabase,
  );
  if (!hydratedSelected) return { outcome: "error" };
  const currentDocument = await findCurrentDocument(hydratedSelected, supabase);
  if (!currentDocument) return { outcome: "error" };

  const reconstructed = await reconstructDocumentVersionChainFromCurrent(
    currentDocument,
    async (previousId, organizationId) => {
      const previous = await supabase
        .from("documents")
        .select(versionFields)
        .eq("organization_id", organizationId)
        .eq("id", previousId)
        .is("deleted_at", null)
        .maybeSingle();

      if (previous.error || !previous.data) return null;
      return hydrateDocumentVersionSource(
        previous.data as DocumentVersionRow,
        supabase,
      );
    },
  );
  if (reconstructed.outcome !== "success") return reconstructed;

  const documentIds = reconstructed.history.entries.map((entry) => entry.documentId);
  const [returns, auth] = await Promise.all([
    supabase
      .from("document_signed_returns")
      .select("id, document_id, received_at, file_size_bytes")
      .in("document_id", documentIds),
    supabase.auth.getUser(),
  ]);
  if (returns.error) return { outcome: "error" };

  let canArchiveSignedReturns = false;
  if (auth.data.user) {
    const membership = await supabase
      .from("memberships")
      .select("role")
      .eq("organization_id", currentDocument.organization_id)
      .eq("profile_id", auth.data.user.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();
    canArchiveSignedReturns = Boolean(
      membership.data && ["owner", "admin", "member"].includes(membership.data.role),
    );
  }

  const signedReturnByDocumentId = new Map(
    returns.data.map((signedReturn) => [signedReturn.document_id, signedReturn]),
  );
  return {
    outcome: "success",
    history: {
      ...reconstructed.history,
      canArchiveSignedReturns,
      entries: reconstructed.history.entries.map((entry) => {
        const signedReturn = signedReturnByDocumentId.get(entry.documentId);
        return signedReturn
          ? {
              ...entry,
              artifacts: [
                ...entry.artifacts,
                {
                  kind: "signed_return_pdf" as const,
                  signedReturnId: signedReturn.id,
                  receivedAt: signedReturn.received_at,
                  fileSizeBytes: signedReturn.file_size_bytes,
                },
              ],
            }
          : entry;
      }),
    },
  };
}
