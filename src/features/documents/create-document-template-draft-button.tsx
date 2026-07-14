"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  createNextDocumentTemplateDraftAction,
  type DocumentTemplateActionResult,
} from "@/features/documents/document-template-management-actions";

export function CreateDocumentTemplateDraftButton({ familyId }: { familyId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DocumentTemplateActionResult | null>(null);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const nextResult = await createNextDocumentTemplateDraftAction({ familyId });
            setResult(nextResult);
            if (nextResult.outcome === "success") router.refresh();
          });
        }}
      >
        {isPending ? "Création…" : "Créer le prochain brouillon"}
      </Button>
      {result ? (
        <p
          role="status"
          className={result.outcome === "success" ? "text-sm text-emerald-700" : "text-sm text-amber-800"}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
