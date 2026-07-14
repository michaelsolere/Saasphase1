"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "tus-js-client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const MAX_BYTES = 10 * 1024 * 1024;
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

type UploadIntention = {
  signedReturnId: string;
  objectName: string;
  uploadToken: string;
  uploadEndpoint: string;
};

type UploadPayload = {
  documentId: string;
  fileSha256: string;
  fileSizeBytes: number;
};

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function validateAndHashFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Sélectionnez un fichier avec l’extension .pdf.");
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new Error("Le PDF doit peser au maximum 10 Mio.");
  }
  const bytes = await file.arrayBuffer();
  const signature = new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength));
  if (
    signature.length !== 5 ||
    signature[0] !== 0x25 ||
    signature[1] !== 0x50 ||
    signature[2] !== 0x44 ||
    signature[3] !== 0x46 ||
    signature[4] !== 0x2d
  ) {
    throw new Error("Le fichier sélectionné n’a pas une signature PDF valide.");
  }
  return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}

async function jsonRequest<T>(url: string, method: "POST" | "DELETE", body: UploadPayload) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Le retour signé n’a pas pu être archivé.");
  return (await response.json()) as T;
}

export function DocumentSignedReturnUploadDialog({
  documentId,
  version,
}: {
  documentId: string;
  version: number;
}) {
  const router = useRouter();
  const uploadRef = useRef<Upload | null>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function archive() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    let payload: UploadPayload | null = null;

    try {
      const fileSha256 = await validateAndHashFile(file);
      payload = { documentId, fileSha256, fileSizeBytes: file.size };
      const intention = await jsonRequest<UploadIntention>(
        "/api/document-signed-returns/upload-intention",
        "POST",
        payload,
      );

      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          endpoint: intention.uploadEndpoint,
          chunkSize: TUS_CHUNK_BYTES,
          retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          headers: { "x-signature": intention.uploadToken },
          metadata: {
            bucketName: "documents",
            objectName: intention.objectName,
            contentType: "application/pdf",
            cacheControl: "0",
          },
          fingerprint: async () =>
            `document-signed-return-${documentId}-${fileSha256}`,
          onProgress(bytesUploaded, bytesTotal) {
            setProgress(Math.round((bytesUploaded / bytesTotal) * 100));
          },
          onError(uploadError) {
            reject(uploadError);
          },
          onSuccess() {
            resolve();
          },
        });
        uploadRef.current = upload;
        void upload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads[0]) upload.resumeFromPreviousUpload(previousUploads[0]);
          upload.start();
        }, reject);
      });
      uploadRef.current = null;

      await jsonRequest<{ outcome: "created" | "existing" }>(
        "/api/document-signed-returns/finalize",
        "POST",
        payload,
      );
      setOpen(false);
      setFile(null);
      router.refresh();
    } catch (caught) {
      if (payload && uploadRef.current) {
        await jsonRequest(
          "/api/document-signed-returns/upload-intention",
          "DELETE",
          payload,
        ).catch(() => undefined);
      }
      setError(caught instanceof Error ? caught.message : "Archivage indisponible.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (uploadRef.current) await uploadRef.current.abort(true).catch(() => undefined);
    uploadRef.current = null;
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !busy && setOpen(nextOpen)}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Archiver le retour signé
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archiver le retour signé — version {version}</DialogTitle>
          <DialogDescription className="space-y-2 text-left leading-6">
            <span className="block">PDF uniquement, maximum 10 Mio.</span>
            <span className="block">
              Le fichier sera associé définitivement à cette version exacte. Le
              PDF original restera inchangé.
            </span>
            <span className="block font-medium text-foreground">
              Aucun remplacement ni aucune suppression ultérieurs ne seront proposés.
            </span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="text-sm font-medium" htmlFor={`signed-return-${documentId}`}>
            PDF retourné signé
          </label>
          <Input
            id={`signed-return-${documentId}`}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          {busy ? (
            <div aria-live="polite" className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-muted/20">
                <div
                  className="h-full bg-accent transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-muted">Téléversement : {progress} %</p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void cancel()}>
            Annuler
          </Button>
          <Button type="button" disabled={!file || busy} onClick={() => void archive()}>
            {busy ? "Archivage en cours…" : "Archiver définitivement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
