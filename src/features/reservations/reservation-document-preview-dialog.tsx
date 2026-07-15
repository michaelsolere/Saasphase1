"use client";

import { useEffect, useRef, useState } from "react";

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

type PreviewStatus = "idle" | "loading" | "ready" | "error";

export function ReservationDocumentPreviewDialog({
  reservationId,
  documentType,
  documentLabel,
  templateId,
  disabled,
}: {
  reservationId: string;
  documentType: "commitment_certificate" | "reservation_contract";
  documentLabel: string;
  templateId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    if (!blobUrl) return;
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  useEffect(() => {
    if (!open || !templateId) return;

    const controller = new AbortController();
    const sequence = ++requestSequence.current;

    void (async () => {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setStatus("loading");
      setBlobUrl(null);

      try {
        const query = new URLSearchParams({ documentType, templateId });
        const response = await fetch(
          `/api/reservations/${reservationId}/document-preview?${query}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok || !contentType.toLowerCase().startsWith("application/pdf")) {
          throw new Error("preview_unavailable");
        }
        const blob = await response.blob();
        if (blob.type && !blob.type.toLowerCase().startsWith("application/pdf")) {
          throw new Error("preview_unavailable");
        }
        const nextUrl = URL.createObjectURL(blob);
        if (controller.signal.aborted || sequence !== requestSequence.current) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        setBlobUrl(nextUrl);
        setStatus("ready");
      } catch {
        if (controller.signal.aborted) return;
        setBlobUrl(null);
        setStatus("error");
      }
    })();

    return () => controller.abort();
  }, [documentType, open, reservationId, templateId]);

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setStatus("loading");
    setOpen(nextOpen);
    if (!nextOpen) {
      requestSequence.current += 1;
      setBlobUrl(null);
      setStatus("idle");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="w-full"
        >
          Prévisualiser avec les données du dossier
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[92dvh] max-w-5xl flex-col sm:h-[88vh]">
        <DialogHeader>
          <DialogTitle>Aperçu — {documentLabel}</DialogTitle>
          <DialogDescription>
            Aperçu temporaire avec les données actuelles du dossier — aucun
            document n’est créé ou modifié.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-muted-soft">
          {status === "loading" ? (
            <div
              role="status"
              className="flex h-full min-h-64 items-center justify-center p-6 text-sm text-muted"
            >
              Préparation de l’aperçu PDF…
            </div>
          ) : status === "error" ? (
            <div
              role="alert"
              className="flex h-full min-h-64 items-center justify-center p-6 text-center text-sm text-muted"
            >
              L’aperçu est indisponible pour le moment. Vérifiez les données du
              dossier et le modèle sélectionné.
            </div>
          ) : status === "ready" && blobUrl ? (
            <iframe
              title={`Aperçu PDF — ${documentLabel}`}
              src={blobUrl}
              className="h-full min-h-64 w-full bg-white"
            />
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Fermer
          </Button>
          <Button
            asChild={status === "ready" && Boolean(blobUrl)}
            disabled={status !== "ready" || !blobUrl}
          >
            {status === "ready" && blobUrl ? (
              <a href={blobUrl} target="_blank" rel="noopener noreferrer">
                Ouvrir l’aperçu en grand
              </a>
            ) : (
              <span>Ouvrir l’aperçu en grand</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
