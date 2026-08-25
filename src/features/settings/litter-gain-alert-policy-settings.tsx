"use client";

import { useMemo, useState } from "react";

import {
  DEFAULT_LITTER_GAIN_ALERT_POLICY,
  parseLitterGainAlertPolicy,
  type LitterGainAlertPolicyV1,
} from "@/features/litter-weights/litter-gain-alert-policy";
import { updateLitterGainAlertPolicy } from "@/features/settings/actions";

type Props = {
  organizationId: string;
  canEdit: boolean;
  policy: LitterGainAlertPolicyV1 | null;
  hasInvalidPersistedPolicy: boolean;
};

const LOWEST_GAIN_OPTIONS = [0, 1, 2, 3] as const;
const TREND_DEVIATION_OPTIONS = [0, 20, 30, 50] as const;

export function LitterGainAlertPolicySettings({
  organizationId,
  canEdit,
  policy,
  hasInvalidPersistedPolicy,
}: Props) {
  const [enabled, setEnabled] = useState(policy !== null);
  const [lowestGainCount, setLowestGainCount] = useState(
    String(policy?.lowestGainCount ?? DEFAULT_LITTER_GAIN_ALERT_POLICY.lowestGainCount),
  );
  const [belowTrendDeviationPercent, setBelowTrendDeviationPercent] = useState(
    String(
      policy?.belowTrendDeviationPercent ??
        DEFAULT_LITTER_GAIN_ALERT_POLICY.belowTrendDeviationPercent,
    ),
  );
  const candidate = useMemo(
    () => ({
      version: 1 as const,
      lowestGainCount: Number(lowestGainCount),
      belowTrendDeviationPercent: Number(belowTrendDeviationPercent),
    }),
    [belowTrendDeviationPercent, lowestGainCount],
  );
  const parsed = useMemo(
    () => parseLitterGainAlertPolicy(candidate),
    [candidate],
  );
  const fieldDisabled = !canEdit || !enabled;

  return (
    <section
      id="litter-gain-alert-policy"
      className="mt-8 min-w-0 scroll-mt-6 rounded-2xl border bg-surface p-4 sm:p-8"
    >
      <h2 className="text-xl font-semibold">Repères de prise de poids</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Choisissez combien de chiots apparaissent dans le repère des prises les
        plus faibles et à partir de quel écart une progression est signalée dans
        les graphiques. Ces repères sont descriptifs et ne constituent pas des
        seuils vétérinaires.
      </p>
      {hasInvalidPersistedPolicy ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
        >
          Le paramètre enregistré n’est momentanément pas disponible. Les valeurs
          recommandées sont utilisées jusqu’à l’enregistrement d’une configuration valide.
        </p>
      ) : null}

      <form action={updateLitterGainAlertPolicy} className="mt-6">
        <input type="hidden" name="organization_id" value={organizationId} />
        <input type="hidden" name="intent" value={enabled ? "enable" : "disable"} />
        <input type="hidden" name="policy_json" value={JSON.stringify(candidate)} />

        <label className="flex items-start gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canEdit}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border"
          />
          <span>Utiliser ces repères personnalisés</span>
        </label>

        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label
              htmlFor="litter-gain-alert-lowest-count"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Chiots signalés comme prises les plus faibles
            </label>
            <select
              id="litter-gain-alert-lowest-count"
              value={lowestGainCount}
              disabled={fieldDisabled}
              onChange={(event) => setLowestGainCount(event.target.value)}
              className="mt-2 w-full min-w-0 rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {LOWEST_GAIN_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === 0 ? "Aucun" : value}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-muted">
              Les ex æquo au niveau de la limite restent signalés.
            </p>
          </div>
          <div className="min-w-0">
            <label
              htmlFor="litter-gain-alert-trend-deviation"
              className="text-xs font-semibold uppercase tracking-wide text-muted"
            >
              Écart minimal pour « progression en retrait »
            </label>
            <select
              id="litter-gain-alert-trend-deviation"
              value={belowTrendDeviationPercent}
              disabled={fieldDisabled}
              onChange={(event) => setBelowTrendDeviationPercent(event.target.value)}
              className="mt-2 w-full min-w-0 rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {TREND_DEVIATION_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === 0
                    ? "Toute progression sous la moyenne (0 %)"
                    : `${value} % sous la moyenne des trois prises précédentes`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!policy && !hasInvalidPersistedPolicy ? (
          <p className="mt-3 text-xs leading-5 text-muted">
            Les valeurs recommandées sont {DEFAULT_LITTER_GAIN_ALERT_POLICY.lowestGainCount} chiot
            et {DEFAULT_LITTER_GAIN_ALERT_POLICY.belowTrendDeviationPercent} %. Elles restent
            actives même si aucune personnalisation n’est enregistrée.
          </p>
        ) : null}

        {enabled && !parsed.ok ? (
          <p role="alert" className="mt-4 text-sm text-amber-900">
            Sélectionnez un nombre de 0 à 3 chiots et un écart de 0 %, 20 %, 30 % ou 50 %.
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
              Enregistrer les repères
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
