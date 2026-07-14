"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  validateDocumentTemplateDraftAction,
  type DocumentTemplateActionResult,
} from "@/features/documents/document-template-management-actions";

export function ValidateDocumentTemplateDraftButton({
  templateId,
}: {
  templateId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DocumentTemplateActionResult | null>(null);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            setResult(await validateDocumentTemplateDraftAction({ templateId }));
          });
        }}
      >
        {isPending ? "Validation…" : "Valider le brouillon"}
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
