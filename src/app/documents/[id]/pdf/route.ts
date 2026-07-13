import { NextResponse } from "next/server";

import { parseDocumentPdfPath } from "@/features/documents/document-pdf-storage-core";
import { readDocumentPdf } from "@/features/documents/document-pdf-storage";
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

  return `${safeType || "document"}-v${version}.pdf`;
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

  const documentResult = await supabase
    .from("documents")
    .select("organization_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (documentResult.error || !documentResult.data) return unavailable();

  const result = await readDocumentPdf(
    documentResult.data.organization_id,
    id,
    supabase,
  );
  if (result.outcome !== "success") return unavailable();

  const parsedPath = parseDocumentPdfPath(result.document.file_path!);
  if (!parsedPath) return unavailable();

  const disposition = new URL(request.url).searchParams.get("download") === "1"
    ? "attachment"
    : "inline";
  const fileName = safeFileName(
    result.document.document_type,
    parsedPath.version,
  );
  const bytes = Uint8Array.from(result.bytes);

  return new Response(bytes.buffer, {
    status: 200,
    headers: {
      ...neutralHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${fileName}"`,
      "Content-Length": String(bytes.byteLength),
    },
  });
}
