import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { finalizeDocumentSignedReturnUpload } from "@/features/documents/document-signed-return-storage";
import {
  parseSignedReturnUploadRequest,
  signedReturnErrorStatus,
} from "@/features/documents/document-signed-return-upload-http";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const parsed = await parseSignedReturnUploadRequest(request);
  if (!parsed.success) {
    return NextResponse.json({ error: "Finalisation invalide." }, { status: 400 });
  }

  const supabase = await createClient();
  const result = await finalizeDocumentSignedReturnUpload(parsed.data, supabase);
  if (result.outcome === "error") {
    return NextResponse.json(
      { error: "Le retour signé n’a pas pu être archivé." },
      { status: signedReturnErrorStatus(result.error.code) },
    );
  }

  const document = await supabase
    .from("documents")
    .select("reservation_id")
    .eq("id", parsed.data.documentId)
    .maybeSingle();
  revalidatePath(`/documents/${parsed.data.documentId}`);
  revalidatePath("/documents");
  if (document.data?.reservation_id) {
    revalidatePath(`/reservations/${document.data.reservation_id}`);
  }

  return NextResponse.json(
    { outcome: result.outcome, signedReturnId: result.signedReturnId },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
