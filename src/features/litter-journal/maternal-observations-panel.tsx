"use client";

import { Plus } from "lucide-react";
import { useActionState, useCallback, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { MaternalObservationActionState } from "./maternal-observations-actions";
import type {
  MaternalObservationSeverity,
  MaternalObservationType,
} from "./maternal-observations";
import { MaternalTemperatureChart } from "./maternal-temperature-chart";
import {
  buildMaternalTemperatureChartModel,
  type MaternalObservationPanelItem,
  type MaternalTemperatureChartModel,
} from "./maternal-temperature-chart-model";
import type { MaternalTemperatureDropPolicyV1 } from "./maternal-temperature-drop-policy";

const observationTypeLabels: Record<MaternalObservationType, string> = {
  temperature: "Température",
  appetite: "Appétit",
  behavior: "Comportement",
  discharge: "Pertes",
  contractions: "Contractions",
  lactation: "Lactation",
  health: "État de santé",
  other: "Autre observation",
};

const severityLabels: Record<MaternalObservationSeverity, string> = {
  routine: "Suivi courant",
  watch: "À surveiller",
  concern: "Préoccupation",
  urgent: "Urgent",
};

const unitLabels = {
  celsius: "°C",
  fahrenheit: "°F",
} as const;

const inputClass =
  "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-semibold";

type RecordAction = (
  previousState: MaternalObservationActionState,
  formData: FormData,
) => Promise<MaternalObservationActionState>;

const initialMaternalObservationActionState: MaternalObservationActionState = {
  status: "idle",
};

function formatObservationDateTime(observation: MaternalObservationPanelItem) {
  const date = new Date(observation.observedAt);
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: observation.timezoneName,
  };

  try {
    return new Intl.DateTimeFormat("fr-FR", options).format(date);
  } catch {
    return new Intl.DateTimeFormat("fr-FR", {
      ...options,
      timeZone: "UTC",
    }).format(date);
  }
}

function formatTemperature(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedTemperature(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatTemperature(Math.abs(value))} °C`;
}

function formatObservedInterval(intervalMilliseconds: number) {
  const minuteMilliseconds = 60 * 1_000;
  const hourMilliseconds = 60 * minuteMilliseconds;
  const dayMilliseconds = 24 * hourMilliseconds;
  if (intervalMilliseconds === 0) return "0 min";
  if (intervalMilliseconds < minuteMilliseconds) return "Moins d’une minute";

  let remaining = intervalMilliseconds;
  const days = Math.floor(remaining / dayMilliseconds);
  remaining -= days * dayMilliseconds;
  const hours = Math.floor(remaining / hourMilliseconds);
  remaining -= hours * hourMilliseconds;
  const minutes = Math.floor(remaining / minuteMilliseconds);
  return [
    days > 0 ? `${days} j` : null,
    hours > 0 ? `${hours} h` : null,
    minutes > 0 ? `${minutes} min` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" ");
}

function emptyTemperatureModel(): MaternalTemperatureChartModel {
  return {
    status: "empty",
    points: [],
    measurementCount: 0,
    latest: null,
    previous: null,
    differenceCelsius: null,
    intervalMilliseconds: null,
    minimumCelsius: null,
    maximumCelsius: null,
    domain: null,
    dropMarker: {
      status: "disabled",
      referenceCelsius: null,
      latestCelsius: null,
      differenceFromReferenceCelsius: null,
      observedDropCelsius: null,
      thresholdCelsius: null,
      requiredReferenceMeasurementCount: null,
      usedReferenceMeasurementCount: 0,
      referencePointPublicIndexes: [],
    },
  };
}

function temperatureModel(
  observations: MaternalObservationPanelItem[],
  dropPolicy: MaternalTemperatureDropPolicyV1 | null,
  dropPolicyUnavailable: boolean,
) {
  try {
    return buildMaternalTemperatureChartModel(
      observations,
      dropPolicy,
      dropPolicyUnavailable,
    );
  } catch {
    return emptyTemperatureModel();
  }
}

function TemperatureDropMarkerSection({
  model,
}: {
  model: MaternalTemperatureChartModel;
}) {
  const marker = model.dropMarker;
  return (
    <section
      className="mt-5 rounded-xl border bg-background p-4"
      aria-labelledby="maternal-temperature-drop-marker-title"
      data-testid="maternal-temperature-drop-marker"
      data-temperature-drop-status={marker.status}
    >
      <h4 id="maternal-temperature-drop-marker-title" className="font-semibold">
        Repère personnel de baisse
      </h4>
      {marker.status === "disabled" ? (
        <>
          <p className="mt-2 text-sm leading-6 text-muted">
            Le repère personnel de baisse n’est pas activé dans les paramètres
            de l’organisation.
          </p>
          <Link
            href="/settings/organization#maternal-temperature-drop-policy"
            className="mt-2 inline-block text-sm font-semibold text-accent hover:underline"
          >
            Consulter les paramètres de l’organisation
          </Link>
        </>
      ) : marker.status === "policy_unavailable" ? (
        <p className="mt-2 text-sm leading-6 text-muted">
          Le paramètre du repère n’est momentanément pas disponible. Les
          températures et la courbe restent consultables.
        </p>
      ) : marker.status === "insufficient_history" ? (
        <p className="mt-2 text-sm leading-6 text-muted">
          Repère en attente : {marker.usedReferenceMeasurementCount} mesure
          {marker.usedReferenceMeasurementCount > 1 ? "s" : ""} de référence
          disponible{marker.usedReferenceMeasurementCount > 1 ? "s" : ""} sur
          les {marker.requiredReferenceMeasurementCount} nécessaires.
        </p>
      ) : (
        <>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted">
                Température de référence récente
              </dt>
              <dd data-testid="maternal-temperature-drop-reference">
                {formatTemperature(marker.referenceCelsius!)} °C
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted">Dernière température</dt>
              <dd data-testid="maternal-temperature-drop-latest">
                {formatTemperature(marker.latestCelsius!)} °C
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted">
                {marker.status === "reached"
                  ? "Baisse observée"
                  : "Variation par rapport à la référence"}
              </dt>
              <dd data-testid="maternal-temperature-drop-observed">
                {marker.status === "reached"
                  ? `${formatTemperature(marker.observedDropCelsius!)} °C`
                  : formatSignedTemperature(
                      marker.differenceFromReferenceCelsius!,
                    )}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted">Repère personnel</dt>
              <dd data-testid="maternal-temperature-drop-threshold">
                baisse d’au moins {formatTemperature(marker.thresholdCelsius!)} °C
              </dd>
            </div>
          </dl>
          <p
            className="mt-3 font-semibold"
            data-testid="maternal-temperature-drop-result"
          >
            {marker.status === "reached"
              ? "Repère personnel de baisse atteint"
              : "Repère non atteint"}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            Cette indication matérialise une variation selon le repère défini
            par l’éleveur. Elle ne prédit pas automatiquement le moment de la
            mise-bas.
          </p>
        </>
      )}
    </section>
  );
}

function localDateTimeToIso(value: string) {
  if (!value) return "";

  const localDate = new Date(value);
  return Number.isNaN(localDate.getTime()) ? "" : localDate.toISOString();
}

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function currentLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Enregistrement..." : "Enregistrer l’observation"}
    </Button>
  );
}

function ActionMessage({ state }: { state: MaternalObservationActionState }) {
  if (state.status === "idle" || !state.message) return null;

  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={
        state.status === "error"
          ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
      }
    >
      {state.message}
    </p>
  );
}

function AddMaternalObservationDialog({
  action,
  onSuccess,
}: {
  action: RecordAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<MaternalObservationType>("temperature");
  const [observedAt, setObservedAt] = useState(currentLocalDateTime);
  const observedAtIsoRef = useRef<HTMLInputElement>(null);
  const timezoneNameRef = useRef<HTMLInputElement>(null);

  const submitAction = useCallback(
    async (
      previousState: MaternalObservationActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.message) {
        setOpen(false);
        onSuccess(nextState.message);
        router.refresh();
      }
      return nextState;
    },
    [action, onSuccess, router],
  );
  const [state, formAction] = useActionState(
    submitAction,
    initialMaternalObservationActionState,
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setType("temperature");
      setObservedAt(currentLocalDateTime());
    }
  }

  function prepareSubmission() {
    if (observedAtIsoRef.current) {
      observedAtIsoRef.current.value = localDateTimeToIso(observedAt);
    }
    if (timezoneNameRef.current) {
      timezoneNameRef.current.value = browserTimezone();
    }
  }

  const temperature = type === "temperature";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus aria-hidden="true" />
          Ajouter une observation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une observation maternelle</DialogTitle>
          <DialogDescription>
            La gravité est une appréciation saisie par l’éleveur, sans interprétation automatique.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareSubmission} className="space-y-4">
          <input ref={observedAtIsoRef} type="hidden" name="observed_at" />
          <input ref={timezoneNameRef} type="hidden" name="timezone_name" />
          <div>
            <label className={labelClass} htmlFor="maternal-observation-type">
              Type d’observation
            </label>
            <select
              id="maternal-observation-type"
              className={inputClass}
              name="observation_type"
              value={type}
              onChange={(event) => setType(event.target.value as MaternalObservationType)}
              required
            >
              {Object.entries(observationTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="maternal-observation-observed-at">
              Date et heure
            </label>
            <input
              id="maternal-observation-observed-at"
              className={inputClass}
              type="datetime-local"
              value={observedAt}
              onChange={(event) => setObservedAt(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="maternal-observation-severity">
              Gravité
            </label>
            <select
              id="maternal-observation-severity"
              className={inputClass}
              name="severity"
              defaultValue="routine"
              required
            >
              {Object.entries(severityLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          {temperature ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="maternal-observation-value">
                  Température
                </label>
                <input
                  id="maternal-observation-value"
                  className={inputClass}
                  name="numeric_value"
                  type="number"
                  min="0.001"
                  step="0.001"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="maternal-observation-unit">
                  Unité
                </label>
                <select
                  id="maternal-observation-unit"
                  className={inputClass}
                  name="unit"
                  defaultValue="celsius"
                  required
                >
                  <option value="celsius">°C</option>
                  <option value="fahrenheit">°F</option>
                </select>
              </div>
            </div>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="maternal-observation-note">
              Note{temperature ? " (facultative)" : ""}
            </label>
            <textarea
              id="maternal-observation-note"
              className={inputClass}
              name="note"
              rows={4}
              maxLength={5000}
              required={!temperature}
            />
          </div>
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Annuler</Button>
            </DialogClose>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ObservationHistory({
  observations,
}: {
  observations: MaternalObservationPanelItem[];
}) {
  if (observations.length === 0) {
    return (
      <p className="mt-5 text-sm text-muted">
        Aucune observation maternelle enregistrée pour cette portée.
      </p>
    );
  }

  return (
    <ul className="mt-5 divide-y divide-border rounded-xl border">
      {observations.map((observation) => (
        <li key={observation.publicSourceIndex} className="min-w-0 p-4 sm:p-5">
          <div className="flex min-w-0 flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <p className="break-words font-semibold">
                {observationTypeLabels[observation.observationType]}
              </p>
              <p className="mt-1 text-sm text-muted">
                {formatObservationDateTime(observation)}
                <span className="ml-1 text-xs">· {observation.timezoneName}</span>
              </p>
            </div>
            <span className="w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold text-foreground">
              {severityLabels[observation.severity]}
            </span>
          </div>
          {observation.observationType === "temperature" && observation.numericValue !== null && observation.unit ? (
            <p className="mt-3 text-sm font-medium">
              {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(observation.numericValue)} {unitLabels[observation.unit]}
            </p>
          ) : null}
          {observation.note ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">{observation.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function TemperatureChartSection({
  observations,
  dropPolicy,
  dropPolicyUnavailable,
}: {
  observations: MaternalObservationPanelItem[];
  dropPolicy: MaternalTemperatureDropPolicyV1 | null;
  dropPolicyUnavailable: boolean;
}) {
  const model = temperatureModel(
    observations,
    dropPolicy,
    dropPolicyUnavailable,
  );
  const latest = model.latest;

  return (
    <section
      className="mt-6 min-w-0 border-t pt-5"
      aria-labelledby="maternal-temperature-chart-title"
      data-testid="maternal-temperature-chart-section"
    >
      <h3
        id="maternal-temperature-chart-title"
        className="text-base font-semibold"
      >
        Courbe de température
      </h3>
      {!latest ? (
        <>
          <p className="mt-3 text-sm text-muted">
            Aucune température enregistrée pour cette portée.
          </p>
          <TemperatureDropMarkerSection model={model} />
        </>
      ) : (
        <>
          <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div
              className="rounded-xl border bg-background p-3"
              data-testid="maternal-temperature-latest"
            >
              <dt className="text-xs font-medium text-muted">
                Dernière température
              </dt>
              <dd className="mt-1 font-semibold">
                {formatTemperature(latest.celsius)} °C
              </dd>
            </div>
            <div
              className="rounded-xl border bg-background p-3"
              data-testid="maternal-temperature-latest-date"
            >
              <dt className="text-xs font-medium text-muted">
                Date de la dernière mesure
              </dt>
              <dd className="mt-1 text-sm">
                {formatObservationDateTime({
                  publicSourceIndex: latest.publicIndex,
                  observationType: "temperature",
                  observedAt: latest.observedAt,
                  timezoneName: latest.timezoneName,
                  numericValue: latest.originalValue,
                  unit: latest.originalUnit,
                  severity: latest.severity,
                  note: latest.note,
                })}
              </dd>
            </div>
            <div
              className="rounded-xl border bg-background p-3"
              data-testid="maternal-temperature-previous"
            >
              <dt className="text-xs font-medium text-muted">
                Mesure précédente
              </dt>
              <dd className="mt-1 text-sm">
                {model.previous
                  ? `${formatTemperature(model.previous.celsius)} °C`
                  : "Non disponible"}
              </dd>
            </div>
            <div
              className="rounded-xl border bg-background p-3"
              data-testid="maternal-temperature-count"
            >
              <dt className="text-xs font-medium text-muted">Nombre de mesures</dt>
              <dd className="mt-1 font-semibold">{model.measurementCount}</dd>
            </div>
            <div
              className="rounded-xl border bg-background p-3"
              data-testid="maternal-temperature-difference"
            >
              <dt className="text-xs font-medium text-muted">
                Écart avec la mesure précédente
              </dt>
              <dd className="mt-1 text-sm">
                {model.differenceCelsius === null
                  ? "Non disponible"
                  : formatSignedTemperature(model.differenceCelsius)}
              </dd>
            </div>
            <div
              className="rounded-xl border bg-background p-3"
              data-testid="maternal-temperature-interval"
            >
              <dt className="text-xs font-medium text-muted">Intervalle observé</dt>
              <dd className="mt-1 text-sm">
                {model.intervalMilliseconds === null
                  ? "Non disponible"
                  : formatObservedInterval(model.intervalMilliseconds)}
              </dd>
            </div>
            <div
              className="rounded-xl border bg-background p-3"
              data-testid="maternal-temperature-minimum"
            >
              <dt className="text-xs font-medium text-muted">Minimum mesuré</dt>
              <dd className="mt-1 text-sm">
                {formatTemperature(model.minimumCelsius!)} °C
              </dd>
            </div>
            <div
              className="rounded-xl border bg-background p-3"
              data-testid="maternal-temperature-maximum"
            >
              <dt className="text-xs font-medium text-muted">Maximum mesuré</dt>
              <dd className="mt-1 text-sm">
                {formatTemperature(model.maximumCelsius!)} °C
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm" data-testid="maternal-temperature-severity">
            <span className="font-medium">Appréciation saisie :</span>{" "}
            {severityLabels[latest.severity]}
          </p>
          <TemperatureDropMarkerSection model={model} />
          <div className="mt-5 min-w-0 overflow-hidden">
            <MaternalTemperatureChart model={model} />
          </div>
        </>
      )}
    </section>
  );
}

export function MaternalObservationsPanel({
  observations,
  role,
  action,
  formInstanceKey,
  loadError = false,
  temperatureDropPolicy = null,
  temperatureDropPolicyUnavailable = false,
}: {
  observations: MaternalObservationPanelItem[];
  role: "owner" | "admin" | "member" | "viewer" | null;
  action: RecordAction | null;
  formInstanceKey: string;
  loadError?: boolean;
  temperatureDropPolicy?: MaternalTemperatureDropPolicyV1 | null;
  temperatureDropPolicyUnavailable?: boolean;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const canWrite = role === "owner" || role === "admin" || role === "member";

  return (
    <section
      className="rounded-2xl border bg-surface p-5 sm:p-6"
      data-testid="maternal-observations-panel"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-semibold">Suivi de la mère</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Observations horodatées liées à cette portée.
          </p>
        </div>
        {canWrite && action ? (
          <AddMaternalObservationDialog
            key={formInstanceKey}
            action={action}
            onSuccess={setConfirmation}
          />
        ) : null}
      </div>
      {confirmation ? (
        <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {confirmation}
        </p>
      ) : null}
      {loadError ? (
        <p className="mt-5 text-sm text-muted">
          Les observations maternelles ne sont pas disponibles pour le moment.
        </p>
      ) : (
        <>
          <TemperatureChartSection
            observations={observations}
            dropPolicy={temperatureDropPolicy}
            dropPolicyUnavailable={temperatureDropPolicyUnavailable}
          />
          <ObservationHistory observations={observations} />
        </>
      )}
    </section>
  );
}
