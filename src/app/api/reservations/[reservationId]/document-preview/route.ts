import { NextResponse } from "next/server";

import { renderDocumentPdfCore } from "@/features/documents/document-pdf-renderer";
import { prepareDocumentGenerationSnapshotForReservation } from "@/features/documents/prepare-document-generation-snapshot";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

const supportedDocumentTypes = new Set([
  "commitment_certificate",
  "reservation_contract",
]);

function errorResponse(status: number) {
  return NextResponse.json(
    { error: "Aperçu indisponible." },
    { status, headers: privateHeaders },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const { reservationId } = await params;
  const url = new URL(request.url);
  const keys = [...url.searchParams.keys()];
  const documentType = url.searchParams.get("documentType");
  const templateId = url.searchParams.get("templateId");

  if (
    keys.length !== 2 ||
    new Set(keys).size !== 2 ||
    !keys.includes("documentType") ||
    !keys.includes("templateId") ||
    !documentType ||
    !supportedDocumentTypes.has(documentType) ||
    !templateId
  ) {
    return errorResponse(400);
  }

  const supabase = await createClient();
  const prepared = await prepareDocumentGenerationSnapshotForReservation(
    {
      reservationId,
      documentType: documentType as
        | "commitment_certificate"
        | "reservation_contract",
      templateId,
    },
    supabase,
  );

  if (prepared.outcome === "error") {
    if (prepared.error.code === "unauthenticated") return errorResponse(401);
    if (prepared.error.code === "forbidden") return errorResponse(404);
    if (prepared.error.code === "invalid_input") return errorResponse(400);
    if (prepared.error.code === "database_error") return errorResponse(503);
    return errorResponse(404);
  }

  const rendered = await renderDocumentPdfCore({
    documentType,
    snapshot: prepared.snapshot,
    templateContent: prepared.templateContent,
    logoBytes: prepared.logoBytes,
    allowMissingTemplateVariables: true,
  });
  if (rendered.outcome === "error") return errorResponse(503);

  return new NextResponse(new Uint8Array(rendered.bytes), {
    status: 200,
    headers: {
      ...privateHeaders,
      "Content-Type": rendered.mimeType,
      "Content-Disposition": `inline; filename="${rendered.fileName}"`,
      "Content-Length": String(rendered.bytes.byteLength),
    },
  });
}
