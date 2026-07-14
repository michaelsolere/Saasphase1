import { NextResponse } from "next/server";

import { parseDocumentPdfPath } from "@/features/documents/document-pdf-storage-core";
import { readDocumentSignedReturn } from "@/features/documents/document-signed-return-storage";
import { createClient } from "@/lib/supabase/server";

const neutralHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function unavailable() {
  return new Response("Document indisponible.", {
    status: 404,
    headers: {
      ...neutralHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function safeFileName(documentType: string, version: number) {
  const safeType = documentType
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${safeType || "document"}-v${version}-retour-signe.pdf`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const metadata = await supabase
    .from("document_signed_returns")
    .select("organization_id, document_id")
    .eq("id", id)
    .maybeSingle();
  if (metadata.error || !metadata.data) return unavailable();

  const result = await readDocumentSignedReturn(
    metadata.data.organization_id,
    id,
    supabase,
  );
  if (result.outcome !== "success") return unavailable();

  const original = await supabase
    .from("documents")
    .select("document_type, file_path")
    .eq("organization_id", metadata.data.organization_id)
    .eq("id", result.signedReturn.document_id)
    .is("deleted_at", null)
    .maybeSingle();
  const parsedOriginal = original.data?.file_path
    ? parseDocumentPdfPath(original.data.file_path)
    : null;
  if (original.error || !original.data || !parsedOriginal) return unavailable();

  const disposition = new URL(request.url).searchParams.get("download") === "1"
    ? "attachment"
    : "inline";
  const bytes = Uint8Array.from(result.bytes);

  return new Response(bytes.buffer, {
    headers: {
      ...neutralHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${safeFileName(
        original.data.document_type,
        parsedOriginal.version,
      )}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
