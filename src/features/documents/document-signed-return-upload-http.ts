import "server-only";

import { z } from "zod";

import type { DocumentSignedReturnErrorCode } from "@/features/documents/document-signed-return-storage";

const uploadIntentionSchema = z
  .object({
    documentId: z.string().uuid(),
    fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
    fileSizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  })
  .strict();

export async function parseSignedReturnUploadRequest(request: Request) {
  try {
    return uploadIntentionSchema.safeParse(await request.json());
  } catch {
    return uploadIntentionSchema.safeParse(null);
  }
}

export function signedReturnErrorStatus(code: DocumentSignedReturnErrorCode) {
  if (code === "unauthenticated") return 401;
  if (code === "forbidden") return 403;
  if (code === "not_found") return 404;
  if (code === "invalid_input" || code === "incoherent_metadata") return 400;
  if (code === "conflict") return 409;
  return 500;
}

export function getSupabaseTusEndpoint(supabaseUrl: string) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    const projectRef = url.hostname.slice(0, -".supabase.co".length);
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable/sign`;
  }
  return `${url.origin}/storage/v1/upload/resumable/sign`;
}
