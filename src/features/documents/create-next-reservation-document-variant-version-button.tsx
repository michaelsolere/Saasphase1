"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createNextReservationDocumentVariantVersionAction } from "@/features/documents/reservation-document-variant-management-actions";

export function CreateNextReservationDocumentVariantVersionButton({
  reservationId,
  variantId,
}: {
  reservationId: string;
  variantId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div>
      <Button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(async () => {
          setMessage(null);
          const result = await createNextReservationDocumentVariantVersionAction({
            reservationId,
            variantId,
          });
          setMessage(result.message);
          if (result.outcome === "success") router.refresh();
        })}
      >
        {isPending ? "Création…" : "Créer la version suivante"}
      </Button>
      {message ? <p role="status" className="mt-2 text-sm text-muted">{message}</p> : null}
    </div>
  );
}
