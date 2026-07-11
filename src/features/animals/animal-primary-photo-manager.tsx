"use client";

import { type FormEvent, useRef, useState, useTransition } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { Label } from "@/components/ui/label";

import {
  deleteAnimalPrimaryPhoto,
  type AnimalPhotoActionCode,
  uploadAnimalPrimaryPhoto,
} from "./photo-actions";

type AnimalPrimaryPhotoManagerProps = {
  animalId: string;
  animalName: string;
  hasStoredPhoto: boolean;
  photoUrl: string | null;
  photoUnavailable: boolean;
  photoActionsDisabled: boolean;
  photoWidth: number | null;
  photoHeight: number | null;
};

type LocalMessage = {
  type: "success" | "error";
  text: string;
};

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBrowserOutputBytes = 1.5 * 1024 * 1024;

const actionMessages: Record<AnimalPhotoActionCode, LocalMessage> = {
  added: { type: "success", text: "Photo ajoutée." },
  replaced: { type: "success", text: "Photo remplacée." },
  deleted: { type: "success", text: "Photo supprimée." },
  invalid_type: { type: "error", text: "Type de fichier non accepté." },
  unreadable: {
    type: "error",
    text: "Fichier illisible ou corrompu.",
  },
  too_large: {
    type: "error",
    text: "Fichier trop volumineux après compression.",
  },
  conflict: {
    type: "error",
    text: "La photo a changé entre-temps. Rechargez la page puis réessayez.",
  },
  temporary_error: {
    type: "error",
    text: "Erreur temporaire. Réessayez dans quelques instants.",
  },
};

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/webp", quality);
  });
}

async function compressPhoto(file: File) {
  if (!acceptedTypes.has(file.type)) {
    return { ok: false as const, code: "invalid_type" as const };
  }

  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    } as ImageBitmapOptions);
  } catch {
    return { ok: false as const, code: "unreadable" as const };
  }

  const attempts = [
    { maxSide: 2000, quality: 0.82 },
    { maxSide: 2000, quality: 0.78 },
    { maxSide: 2000, quality: 0.75 },
    { maxSide: 1600, quality: 0.82 },
    { maxSide: 1600, quality: 0.78 },
    { maxSide: 1600, quality: 0.75 },
  ];

  try {
    for (const attempt of attempts) {
      const scale = Math.min(
        1,
        attempt.maxSide / Math.max(bitmap.width, bitmap.height),
      );
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", { alpha: false });

      if (!context) {
        return { ok: false as const, code: "temporary_error" as const };
      }

      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await canvasToWebpBlob(canvas, attempt.quality);

      if (blob && blob.size <= maxBrowserOutputBytes) {
        return {
          ok: true as const,
          file: new File([blob], "primary-photo.webp", {
            type: "image/webp",
          }),
        };
      }
    }
  } finally {
    bitmap.close();
  }

  return { ok: false as const, code: "too_large" as const };
}

export function AnimalPrimaryPhotoManager({
  animalId,
  animalName,
  hasStoredPhoto,
  photoUrl,
  photoUnavailable,
  photoActionsDisabled,
  photoWidth,
  photoHeight,
}: AnimalPrimaryPhotoManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<LocalMessage | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isBusy = isProcessing || isPending;
  const disablePhotoActions = isBusy || photoActionsDisabled;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disablePhotoActions) {
      return;
    }

    const file = fileInputRef.current?.files?.[0] ?? null;

    if (!file) {
      setMessage(actionMessages.unreadable);
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    const compressed = await compressPhoto(file);

    if (!compressed.ok) {
      setMessage(actionMessages[compressed.code]);
      setIsProcessing(false);
      return;
    }

    const formData = new FormData();
    formData.set("animal_id", animalId);
    formData.set("photo", compressed.file);

    startTransition(async () => {
      const result = await uploadAnimalPrimaryPhoto(formData);

      setMessage(actionMessages[result.code]);
      setIsProcessing(false);

      if (result.ok) {
        setIsDialogOpen(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        router.refresh();
      }
    });
  }

  function handleDelete() {
    if (disablePhotoActions) {
      return;
    }

    const formData = new FormData();
    formData.set("animal_id", animalId);
    startTransition(async () => {
      const result = await deleteAnimalPrimaryPhoto(formData);

      setMessage(actionMessages[result.code]);

      if (result.ok) {
        setIsAlertOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:items-end">
      <div className="w-full sm:w-48">
        {photoUrl ? (
          <div className="overflow-hidden rounded-lg border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={`Photo principale de ${animalName}`}
              width={photoWidth ?? 360}
              height={photoHeight ?? 420}
              className="aspect-[4/5] w-full object-cover"
              data-testid="animal-primary-photo"
            />
          </div>
        ) : photoUnavailable && hasStoredPhoto ? (
          <div
            className="flex aspect-[4/5] w-full flex-col items-center justify-center rounded-lg border border-dashed bg-surface px-4 text-center text-muted"
            data-testid="animal-primary-photo-unavailable"
          >
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
            <span className="mt-3 text-sm font-medium">
              Photo temporairement indisponible
            </span>
          </div>
        ) : (
          <div
            className="flex aspect-[4/5] w-full flex-col items-center justify-center rounded-lg border border-dashed bg-surface text-muted"
            data-testid="animal-primary-photo-placeholder"
          >
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
            <span className="mt-3 text-sm font-medium">Aucune photo</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 sm:min-w-56">
        <div className="flex flex-wrap gap-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" disabled={disablePhotoActions}>
                <Upload aria-hidden="true" />
                {hasStoredPhoto ? "Remplacer la photo" : "Ajouter une photo"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {hasStoredPhoto ? "Remplacer la photo" : "Ajouter une photo"}
                </DialogTitle>
                <DialogDescription>
                  JPEG, PNG ou WebP. Le fichier est compressé avant envoi.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="animal-primary-photo-file">Photo</Label>
                  <Input
                    id="animal-primary-photo-file"
                    ref={fileInputRef}
                    name="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={disablePhotoActions}
                  />
                </div>

                {isBusy ? (
                  <p role="status" className="text-sm text-muted">
                    Traitement de la photo en cours…
                  </p>
                ) : null}

                {message && message.type === "error" ? (
                  <p
                    role="alert"
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
                  >
                    {message.text}
                  </p>
                ) : null}

                <DialogFooter>
                  <Button type="submit" disabled={disablePhotoActions}>
                    {isBusy ? "Traitement…" : "Enregistrer"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {hasStoredPhoto ? (
            <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disablePhotoActions}
                >
                  <Trash2 aria-hidden="true" />
                  Supprimer la photo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer la photo ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    La photo principale sera retirée de la fiche animal.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={disablePhotoActions}>
                    Annuler
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={disablePhotoActions}
                  >
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>

        {photoActionsDisabled ? (
          <p
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          >
            Gestion de la photo temporairement indisponible.
          </p>
        ) : null}

        {message ? (
          <p
            role={message.type === "success" ? "status" : "alert"}
            className={
              message.type === "success"
                ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
                : "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
