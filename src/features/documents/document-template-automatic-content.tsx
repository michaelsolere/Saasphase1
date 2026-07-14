import { documentTemplateTypePresentations } from "./document-template-editor-config";
import type { DocumentTemplateType } from "./document-template-definitions";

export function DocumentTemplateAutomaticContent({
  documentType,
}: {
  documentType: DocumentTemplateType;
}) {
  const presentation = documentTemplateTypePresentations[documentType];

  return (
    <aside className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950">
      <h2 className="text-lg font-semibold">Contenu automatiquement ajouté au document</h2>
      <p className="mt-2 text-sm leading-6">
        Ces informations proviennent du dossier de réservation et sont ajoutées lors de la génération du PDF. Elles ne se saisissent pas dans le modèle.
      </p>
      <ul className="mt-4 grid list-disc gap-x-8 gap-y-2 pl-5 text-sm leading-6 sm:grid-cols-2">
        {presentation.automaticContent.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p className="mt-4 text-sm leading-6">
        Les blocs conditionnels ne sont affichés dans le PDF que lorsque leurs données existent.
      </p>
    </aside>
  );
}
