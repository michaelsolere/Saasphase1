"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
import {
  creatableStructuredDocumentTemplateTypes,
  documentTemplateTypePresentations,
} from "@/features/documents/document-template-editor-config";
import { createDocumentTemplateFamilyAction } from "@/features/documents/document-template-management-actions";

const fieldClassName = "mt-2 min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";

export function CreateDocumentTemplateFamilyDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createDocumentTemplateFamilyAction({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        documentType: String(formData.get("documentType") ?? ""),
        species: String(formData.get("species") ?? ""),
        breed: String(formData.get("breed") ?? ""),
      });
      if (result.outcome === "error") {
        setError(result.message);
        return;
      }
      setOpen(false);
      router.push(`/documents/modeles/${result.familyId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus aria-hidden="true" />Créer un modèle de référence</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Créer un modèle de référence</DialogTitle>
          <DialogDescription>Le premier brouillon sera à compléter avant validation et publication.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div>
            <label htmlFor="document-template-type" className="text-sm font-semibold">Type documentaire</label>
            <select id="document-template-type" name="documentType" defaultValue="commitment_certificate" disabled={pending} className={fieldClassName}>
              {creatableStructuredDocumentTemplateTypes.map((value) => (
                <option key={value} value={value}>
                  {documentTemplateTypePresentations[value].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="document-template-name" className="text-sm font-semibold">Nom</label>
            <input id="document-template-name" name="name" required maxLength={200} disabled={pending} className={fieldClassName} />
          </div>
          <div>
            <label htmlFor="document-template-description" className="text-sm font-semibold">Description <span className="font-normal text-muted">(facultative)</span></label>
            <textarea id="document-template-description" name="description" rows={3} disabled={pending} className={`${fieldClassName} min-h-0 resize-y`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="document-template-species" className="text-sm font-semibold">Espèce</label>
              <input id="document-template-species" name="species" required defaultValue="dog" disabled={pending} className={fieldClassName} />
            </div>
            <div>
              <label htmlFor="document-template-breed" className="text-sm font-semibold">Race</label>
              <input id="document-template-breed" name="breed" required defaultValue="Golden Retriever" disabled={pending} className={fieldClassName} />
            </div>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Annuler</Button>
            <Button type="submit" disabled={pending}>{pending ? "Création..." : "Créer le modèle"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
