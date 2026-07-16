"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createReservationDocumentVariantDraftAction } from "@/features/documents/reservation-document-variant-management-actions";

export function CreateReservationDocumentVariantButton({
  reservationId,
  templateFamilyId,
}: {
  reservationId: string;
  templateFamilyId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await createReservationDocumentVariantDraftAction({
              reservationId,
              templateFamilyId,
            });
            if (result.outcome === "success" && result.variantId) {
              router.push(`/reservations/${reservationId}/documents/variantes/${result.variantId}`);
              return;
            }
            setMessage(result.message);
          });
        }}
      >
        {isPending ? "Création…" : "Créer une variante personnalisée"}
      </Button>
      {message ? <p role="status" className="mt-2 text-sm text-amber-800">{message}</p> : null}
    </div>
  );
}
