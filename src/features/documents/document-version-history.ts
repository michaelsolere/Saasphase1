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
  "id, organization_id, title, document_type, status, sent_at, replaces_document_id, superseded_at, generated_at, source_template_version, file_path, file_sha256, file_size_bytes, mime_type";

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
    candidate = successor.data[0] as DocumentVersionSource;
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
  const currentDocument = await findCurrentDocument(
    selected.data as DocumentVersionSource,
    supabase,
  );
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

      return previous.error || !previous.data
        ? null
        : (previous.data as DocumentVersionSource);
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
