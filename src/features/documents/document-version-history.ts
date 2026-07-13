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
  "id, organization_id, title, document_type, status, replaces_document_id, superseded_at, generated_at, source_template_version, file_path, file_sha256, file_size_bytes, mime_type";

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

  return reconstructDocumentVersionChainFromCurrent(
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
}
