import { NextResponse } from "next/server";

import {
  abandonDocumentSignedReturnUpload,
  prepareDocumentSignedReturnUpload,
} from "@/features/documents/document-signed-return-storage";
import {
  getSupabaseTusEndpoint,
  parseSignedReturnUploadRequest,
  signedReturnErrorStatus,
} from "@/features/documents/document-signed-return-upload-http";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const parsed = await parseSignedReturnUploadRequest(request);
  if (!parsed.success) {
    return NextResponse.json({ error: "Intention invalide." }, { status: 400 });
  }

  const result = await prepareDocumentSignedReturnUpload(
    parsed.data,
    await createClient(),
  );
  if (result.outcome === "error") {
    return NextResponse.json(
      { error: "Archivage indisponible." },
      { status: signedReturnErrorStatus(result.error.code) },
    );
  }

  return NextResponse.json(
    {
      signedReturnId: result.signedReturnId,
      objectName: result.filePath,
      uploadToken: result.uploadToken,
      uploadEndpoint: getSupabaseTusEndpoint(getSupabaseConfig().url),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(request: Request) {
  const parsed = await parseSignedReturnUploadRequest(request);
  if (!parsed.success) {
    return NextResponse.json({ error: "Intention invalide." }, { status: 400 });
  }

  const result = await abandonDocumentSignedReturnUpload(
    parsed.data,
    await createClient(),
  );
  if (result.outcome === "error") {
    return NextResponse.json(
      { error: "Suppression de compensation indisponible." },
      { status: signedReturnErrorStatus(result.error.code) },
    );
  }
  return NextResponse.json(
    { removed: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
