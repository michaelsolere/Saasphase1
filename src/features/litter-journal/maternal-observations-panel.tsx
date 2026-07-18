"use client";

import { Plus } from "lucide-react";
import { useActionState, useCallback, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

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
  MaternalObservationSummary,
  MaternalObservationType,
} from "./maternal-observations";

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

function formatObservationDateTime(observation: MaternalObservationSummary) {
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
    <Dialog open={open} onOpenChange={setOpen}>
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
  observations: MaternalObservationSummary[];
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
        <li key={observation.id} className="min-w-0 p-4 sm:p-5">
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

export function MaternalObservationsPanel({
  observations,
  role,
  action,
  clientCommandId,
  loadError = false,
}: {
  observations: MaternalObservationSummary[];
  role: "owner" | "admin" | "member" | "viewer" | null;
  action: RecordAction | null;
  clientCommandId: string;
  loadError?: boolean;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const canWrite = role === "owner" || role === "admin" || role === "member";

  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-semibold">Suivi de la mère</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Observations horodatées liées à cette portée.
          </p>
        </div>
        {canWrite && action ? (
          <AddMaternalObservationDialog
            key={clientCommandId}
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
        <ObservationHistory observations={observations} />
      )}
    </section>
  );
}
