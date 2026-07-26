"use client";

import { useState } from "react";

import { setDefaultGestationPlanningModelAction } from "@/features/settings/actions";
import {
  GESTATION_LIBRARY_VARIANTS,
  type GestationDefaultChoice,
} from "@/features/settings/gestation-default-planning";

export type GestationDefaultPlanningVariantSummary = {
  choice: Exclude<GestationDefaultChoice, "none">;
  description: string | null;
  itemCount: number;
};

type Props = {
  organizationId: string;
  canEdit: boolean;
  currentChoice: GestationDefaultChoice;
  isCurrentChoiceUnavailable: boolean;
  variantSummaries: GestationDefaultPlanningVariantSummary[];
};

const CHOICES: readonly GestationDefaultChoice[] = [
  "none",
  "standard",
  "herpesvirose",
];

function choiceTitle(choice: GestationDefaultChoice) {
  return choice === "none"
    ? "Aucun modèle automatique"
    : GESTATION_LIBRARY_VARIANTS[choice].title;
}

function choiceSummary(choice: GestationDefaultChoice) {
  if (choice === "none") {
    return "Aucun jalon n’est créé automatiquement à la première saillie.";
  }
  if (choice === "standard") {
    return "14 éléments : suivi vétérinaire, alimentation, vermifuge, préparation, températures et fenêtre de mise-bas.";
  }
  return "Mêmes 14 éléments, plus injection 1 à J+7–J+10 après la première saillie et injection 2 à D−14–D−7 avant la mise-bas estimée.";
}

export function GestationDefaultPlanningSettings({
  organizationId,
  canEdit,
  currentChoice,
  isCurrentChoiceUnavailable,
  variantSummaries,
}: Props) {
  const [selectedChoice, setSelectedChoice] =
    useState<GestationDefaultChoice>(currentChoice);
  const summaryByChoice = new Map(
    variantSummaries.map((summary) => [summary.choice, summary]),
  );

  return (
    <section
      id="gestation-default-planning"
      className="mt-8 min-w-0 scroll-mt-6 rounded-2xl border bg-surface p-4 sm:p-8"
    >
      <h2 className="text-xl font-semibold">Planning de gestation automatique</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Le modèle choisi sera appliqué automatiquement lors de la première
        saillie. Les dates créées restent modifiables pour chaque portée.
      </p>
      {isCurrentChoiceUnavailable ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
        >
          Le planning configuré n’est plus disponible. Tant qu’un nouveau
          choix n’est pas enregistré, aucune première saillie n’appliquera de
          planning automatiquement.
        </p>
      ) : null}

      {canEdit ? (
        <form
          action={setDefaultGestationPlanningModelAction}
          className="mt-6"
        >
          <input type="hidden" name="organization_id" value={organizationId} />
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">
              Planning appliqué automatiquement
            </legend>
            {CHOICES.map((choice) => {
              const summary =
                choice === "none" ? null : summaryByChoice.get(choice) ?? null;
              return (
                <label
                  key={choice}
                  className="block rounded-xl border bg-background p-4 text-sm"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name="choice"
                      value={choice}
                      checked={selectedChoice === choice}
                      onChange={() => setSelectedChoice(choice)}
                    />
                    {choiceTitle(choice)}
                  </span>
                  <span className="mt-2 block leading-6 text-muted">
                    {choice === "none"
                      ? choiceSummary(choice)
                      : summary
                        ? choiceSummary(choice)
                        : "Ce planning n’est plus disponible."}
                  </span>
                  {choice !== "none" && summary ? (
                    <span className="mt-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                      {summary.itemCount} élément(s)
                    </span>
                  ) : null}
                </label>
              );
            })}
          </fieldset>
          <div className="mt-6 flex justify-end border-t pt-6">
            <button
              type="submit"
              disabled={selectedChoice === currentChoice}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Enregistrer ce choix
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6 space-y-3">
          {CHOICES.map((choice) => {
            const summary =
              choice === "none" ? null : summaryByChoice.get(choice) ?? null;
            return (
              <div
                key={choice}
                className="rounded-xl border bg-background p-4 text-sm"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <input
                    type="radio"
                    checked={currentChoice === choice}
                    disabled
                    readOnly
                  />
                  {choiceTitle(choice)}
                </span>
                <span className="mt-2 block leading-6 text-muted">
                  {choice === "none"
                    ? choiceSummary(choice)
                    : summary
                      ? choiceSummary(choice)
                      : "Ce planning n’est plus disponible."}
                </span>
                {choice !== "none" && summary ? (
                  <span className="mt-2 block text-xs font-semibold uppercase tracking-wide text-muted">
                    {summary.itemCount} élément(s)
                  </span>
                ) : null}
              </div>
            );
          })}
          <p className="text-sm text-muted">
            Votre rôle permet de consulter ce choix en lecture seule.
          </p>
        </div>
      )}
    </section>
  );
}
