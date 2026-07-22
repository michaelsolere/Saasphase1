"use client";

import { useMemo, useState } from "react";

import {
  parseMaternalTemperatureDropPolicy,
  type MaternalTemperatureDropPolicyV1,
} from "@/features/litter-journal/maternal-temperature-drop-policy";
import { updateMaternalTemperatureDropPolicy } from "@/features/settings/actions";

type Props = {
  canEdit: boolean;
  policy: MaternalTemperatureDropPolicyV1 | null;
  hasInvalidPersistedPolicy: boolean;
};

const INITIAL_EXAMPLE = {
  referenceMeasurementCount: "3",
  dropThresholdCelsius: "0.7",
} as const;

export function MaternalTemperatureDropPolicySettings({
  canEdit,
  policy,
  hasInvalidPersistedPolicy,
}: Props) {
  const [enabled, setEnabled] = useState(policy !== null);
  const [referenceMeasurementCount, setReferenceMeasurementCount] = useState(
    policy
      ? String(policy.referenceMeasurementCount)
      : INITIAL_EXAMPLE.referenceMeasurementCount,
  );
  const [dropThresholdCelsius, setDropThresholdCelsius] = useState(
    policy
      ? String(policy.dropThresholdCelsius)
      : INITIAL_EXAMPLE.dropThresholdCelsius,
  );
  const candidate = useMemo(
    () => ({
      version: 1,
      referenceMeasurementCount: Number(referenceMeasurementCount),
      dropThresholdCelsius: Number(dropThresholdCelsius),
    }),
    [dropThresholdCelsius, referenceMeasurementCount],
  );
  const parsed = useMemo(
    () => parseMaternalTemperatureDropPolicy(candidate),
    [candidate],
  );
  const fieldDisabled = !canEdit || !enabled;

  return (
    <section
      id="maternal-temperature-drop-policy"
      className="mt-8 min-w-0 scroll-mt-6 rounded-2xl border bg-surface p-4 sm:p-8"
    >
      <h2 className="text-xl font-semibold">
        Repère de baisse de température maternelle
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Ce repère compare la dernière température à une référence calculée
        depuis les mesures précédentes. Il matérialise une variation selon vos
        propres paramètres et ne prédit pas automatiquement la mise-bas.
      </p>
      {hasInvalidPersistedPolicy ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
        >
          Le paramètre enregistré n’est momentanément pas disponible. Le repère
          reste désactivé jusqu’à l’enregistrement de nouveaux paramètres.
        </p>
      ) : null}

      <form action={updateMaternalTemperatureDropPolicy} className="mt-6">
        <input type="hidden" name="intent" value={enabled ? "enable" : "disable"} />
        <input
          type="hidden"
          name="policy_json"
          value={JSON.stringify(candidate)}
        />

        <label className="flex items-start gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border"
          />
          <span>Activer le repère</span>
        </label>

        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label
              htmlFor="maternal-temperature-reference-count"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Nombre de mesures précédentes utilisées
            </label>
            <input
              id="maternal-temperature-reference-count"
              type="number"
              inputMode="numeric"
              min="2"
              max="10"
              step="1"
              value={referenceMeasurementCount}
              disabled={fieldDisabled}
              onChange={(event) => setReferenceMeasurementCount(event.target.value)}
              className="mt-2 w-full min-w-0 rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <div className="min-w-0">
            <label
              htmlFor="maternal-temperature-drop-threshold"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Baisse minimale à matérialiser en °C
            </label>
            <input
              id="maternal-temperature-drop-threshold"
              type="number"
              inputMode="decimal"
              min="0.1"
              max="3"
              step="0.01"
              value={dropThresholdCelsius}
              disabled={fieldDisabled}
              onChange={(event) => setDropThresholdCelsius(event.target.value)}
              className="mt-2 w-full min-w-0 rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>

        {!policy && !hasInvalidPersistedPolicy ? (
          <p className="mt-3 text-xs leading-5 text-muted">
            Les valeurs affichées lors de cette première activation — 3 mesures
            et 0,7 °C — sont un exemple modifiable, pas un seuil vétérinaire.
          </p>
        ) : null}

        {enabled && !parsed.ok ? (
          <p role="alert" className="mt-4 text-sm text-amber-900">
            Saisissez un nombre entier de 2 à 10 mesures et une baisse de 0,1 à
            3,0 °C avec au maximum deux décimales.
          </p>
        ) : null}

        {!canEdit ? (
          <p className="mt-5 text-sm text-muted">
            Votre rôle permet de consulter ce repère en lecture seule.
          </p>
        ) : (
          <div className="mt-6 flex justify-end border-t pt-6">
            <button
              type="submit"
              disabled={enabled && !parsed.ok}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Enregistrer le repère
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
