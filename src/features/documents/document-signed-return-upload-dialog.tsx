"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultOptions, Upload } from "tus-js-client";

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

type UploadPhase =
  | "idle"
  | "validation"
  | "uploading"
  | "finalizing"
  | "abandoning";

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

async function removeTusResumeEntries(upload: Upload) {
  const previousUploads = await upload.findPreviousUploads();
  await Promise.all(
    previousUploads.map(({ urlStorageKey }) =>
      defaultOptions.urlStorage.removeUpload(urlStorageKey),
    ),
  );
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
  const uploadRejectRef = useRef<((reason: Error) => void) | null>(null);
  const payloadRef = useRef<UploadPayload | null>(null);
  const intentionRef = useRef<UploadIntention | null>(null);
  const phaseRef = useRef<UploadPhase>("idle");
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [hasPendingUpload, setHasPendingUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updatePhase(nextPhase: UploadPhase) {
    phaseRef.current = nextPhase;
    setPhase(nextPhase);
  }

  function currentPhase(): UploadPhase {
    return phaseRef.current;
  }

  async function archive() {
    if (!file || phaseRef.current !== "idle") return;
    setError(null);
    setProgress(0);
    updatePhase("validation");
    let finalizationStarted = false;

    try {
      const fileSha256 = await validateAndHashFile(file);
      const payload = { documentId, fileSha256, fileSizeBytes: file.size };
      const pendingPayload = payloadRef.current;
      if (
        pendingPayload &&
        (pendingPayload.documentId !== payload.documentId ||
          pendingPayload.fileSha256 !== payload.fileSha256 ||
          pendingPayload.fileSizeBytes !== payload.fileSizeBytes)
      ) {
        throw new Error("Abandonnez d’abord le téléversement précédent.");
      }
      payloadRef.current = payload;
      setHasPendingUpload(true);
      const intention =
        intentionRef.current ??
        (await jsonRequest<UploadIntention>(
          "/api/document-signed-returns/upload-intention",
          "POST",
          payload,
        ));
      intentionRef.current = intention;

      updatePhase("uploading");
      await new Promise<void>((resolve, reject) => {
        uploadRejectRef.current = reject;
        const upload = new Upload(file, {
          endpoint: intention.uploadEndpoint,
          chunkSize: TUS_CHUNK_BYTES,
          retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: false,
          urlStorage: defaultOptions.urlStorage,
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
            uploadRejectRef.current = null;
            reject(uploadError);
          },
          onSuccess() {
            uploadRejectRef.current = null;
            resolve();
          },
        });
        uploadRef.current = upload;
        void upload.findPreviousUploads().then((previousUploads) => {
          if (previousUploads[0]) upload.resumeFromPreviousUpload(previousUploads[0]);
          upload.start();
        }, reject);
      });

      finalizationStarted = true;
      updatePhase("finalizing");
      const result = await jsonRequest<{ outcome: "created" | "existing" }>(
        "/api/document-signed-returns/finalize",
        "POST",
        payload,
      );
      if (result.outcome !== "created" && result.outcome !== "existing") {
        throw new Error("La finalisation du retour signé est indéterminée.");
      }
      const completedUpload = uploadRef.current;
      if (completedUpload) await removeTusResumeEntries(completedUpload);
      uploadRef.current = null;
      payloadRef.current = null;
      intentionRef.current = null;
      setHasPendingUpload(false);
      setOpen(false);
      setFile(null);
      router.refresh();
    } catch (caught) {
      setError(
        finalizationStarted
          ? "La finalisation n’a pas pu être confirmée. Vous pouvez réessayer avec ce même fichier."
          : caught instanceof Error
            ? caught.message
            : "Archivage indisponible.",
      );
    } finally {
      if (currentPhase() !== "abandoning") updatePhase("idle");
    }
  }

  async function cancel() {
    if (phaseRef.current === "finalizing" || phaseRef.current === "abandoning") return;
    const upload = uploadRef.current;
    const payload = payloadRef.current;
    updatePhase("abandoning");
    uploadRejectRef.current?.(new Error("Téléversement abandonné."));
    uploadRejectRef.current = null;

    const resumeEntries = upload ? await upload.findPreviousUploads().catch(() => []) : [];
    await Promise.allSettled([
      upload?.abort(true),
      payload
        ? jsonRequest(
            "/api/document-signed-returns/upload-intention",
            "DELETE",
            payload,
          )
        : Promise.resolve(),
    ]);
    await Promise.allSettled(
      resumeEntries.map(({ urlStorageKey }) =>
        defaultOptions.urlStorage.removeUpload(urlStorageKey),
      ),
    );
    uploadRef.current = null;
    payloadRef.current = null;
    intentionRef.current = null;
    setHasPendingUpload(false);
    setFile(null);
    setError(null);
    setProgress(0);
    updatePhase("idle");
    setOpen(false);
  }

  const busy = phase !== "idle";

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
            disabled={busy || hasPendingUpload}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
          {phase === "uploading" ? (
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
          {phase === "validation" ? (
            <p className="text-xs text-muted" aria-live="polite">Validation du PDF…</p>
          ) : null}
          {phase === "finalizing" ? (
            <p className="text-sm font-medium" aria-live="polite">
              Finalisation en cours…
            </p>
          ) : null}
          {phase === "abandoning" ? (
            <p className="text-sm font-medium" aria-live="polite">
              Abandon du téléversement en cours…
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={
              phase === "validation" ||
              phase === "finalizing" ||
              phase === "abandoning"
            }
            onClick={() => void cancel()}
          >
            {phase === "finalizing" ? "Finalisation en cours…" : "Annuler"}
          </Button>
          <Button type="button" disabled={!file || busy} onClick={() => void archive()}>
            {phase === "validation"
              ? "Validation…"
              : phase === "uploading"
                ? "Téléversement…"
                : phase === "finalizing"
                  ? "Finalisation…"
                  : phase === "abandoning"
                    ? "Abandon…"
                    : "Archiver définitivement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
