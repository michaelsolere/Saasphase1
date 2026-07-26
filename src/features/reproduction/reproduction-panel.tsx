"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

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
import {
  addProgesteroneMeasurementAction,
  createReproductiveCycleAction,
} from "@/features/reproduction/actions";
import {
  initialReproductionActionState,
  type ReproductionActionState,
} from "@/features/reproduction/action-state";
import { allowedManualStatusesFor } from "@/features/reproduction/reproductive-cycle-transitions";
import type {
  ProgesteroneMeasurementSummary,
  ReproductiveCycleMatingMethod,
  ReproductiveCycleMatingSummary,
  ReproductiveCycleStatus,
  ReproductiveCycleSummary,
} from "@/features/reproduction/reproductive-cycles";

type CycleWithMeasurements = ReproductiveCycleSummary & {
  measurements: ProgesteroneMeasurementSummary[];
  matings: ReproductiveCycleMatingSummary[];
  litterName: string | null;
  matingAction: (
    previousState: ReproductionActionState,
    formData: FormData,
  ) => Promise<ReproductionActionState>;
  updateAction: (
    previousState: ReproductionActionState,
    formData: FormData,
  ) => Promise<ReproductionActionState>;
};

type FatherOption = { id: string; name: string };

const statusLabels: Record<ReproductiveCycleSummary["status"], string> = {
  planned: "Prévu",
  in_progress: "En cours",
  mated: "Saillie enregistrée",
  closed: "Terminé",
  cancelled: "Annulé",
};

const unitLabels = {
  ng_ml: "ng/mL",
  nmol_l: "nmol/L",
} as const;

const matingMethodLabels: Record<ReproductiveCycleMatingMethod, string> = {
  natural: "Saillie naturelle",
  ai_fresh: "Insémination — semence fraîche",
  ai_chilled: "Insémination — semence réfrigérée",
  ai_frozen: "Insémination — semence congelée",
  other: "Autre",
};

const inputClass =
  "mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-semibold";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function localDateTimeToIso(value: string) {
  if (!value) return "";

  const localDate = new Date(value);
  return Number.isNaN(localDate.getTime()) ? "" : localDate.toISOString();
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function ActionMessage({
  status,
  message,
}: {
  status: "idle" | "success" | "error";
  message?: string;
}) {
  if (status === "idle" || !message) return null;

  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={
        status === "error"
          ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
      }
    >
      {message}
    </p>
  );
}

function CreateCycleDialog({ motherId }: { motherId: string }) {
  const [state, formAction] = useActionState(
    createReproductiveCycleAction,
    initialReproductionActionState,
  );
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          Ajouter un cycle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un cycle reproductif</DialogTitle>
          <DialogDescription>
            Créez un cycle sans créer de saillie, de portée ni de tâche.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="mother_id" value={motherId} />
          <div>
            <label className={labelClass} htmlFor="cycle-started-on">
              Date de début
            </label>
            <input id="cycle-started-on" className={inputClass} name="started_on" type="date" required />
          </div>
          <div>
            <label className={labelClass} htmlFor="cycle-status">
              Statut
            </label>
            <select id="cycle-status" className={inputClass} name="status" defaultValue="in_progress" required>
              <option value="planned">Prévu</option>
              <option value="in_progress">En cours</option>
              <option value="closed">Terminé</option>
              <option value="cancelled">Annulé</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="cycle-ended-on">
              Date de fin
            </label>
            <input id="cycle-ended-on" className={inputClass} name="ended_on" type="date" />
          </div>
          <div>
            <label className={labelClass} htmlFor="cycle-notes">
              Notes
            </label>
            <textarea id="cycle-notes" className={inputClass} name="notes" rows={4} maxLength={5000} />
          </div>
          <ActionMessage status={state.status} message={state.message} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Annuler</Button>
            </DialogClose>
            <SubmitButton label="Créer le cycle" pendingLabel="Création..." />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditCycleDialog({ cycle }: { cycle: CycleWithMeasurements }) {
  const actionRef = useRef(cycle.updateAction);
  const stableAction = useCallback(
    (previousState: ReproductionActionState, formData: FormData) =>
      actionRef.current(previousState, formData),
    [],
  );
  const [state, formAction] = useActionState(stableAction, initialReproductionActionState);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ReproductiveCycleStatus>(cycle.status);
  const [confirming, setConfirming] = useState<"closed" | "cancelled" | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const allowedStatuses = allowedManualStatusesFor(cycle.status);
  const hasMatingOrLitter = cycle.matings.length > 0 || cycle.litterId !== null;
  const isEditable = allowedStatuses.length > 0;

  useEffect(() => {
    actionRef.current = cycle.updateAction;
  }, [cycle.updateAction]);

  useEffect(() => {
    if (state.status !== "success") return;
    window.sessionStorage.setItem(
      `reproduction-cycle-update-success:${cycle.id}`,
      state.message ?? "Le cycle reproductif a été mis à jour.",
    );
    window.location.reload();
  }, [cycle.id, state.message, state.status]);

  if (!isEditable) return null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setStatus(cycle.status);
      setConfirming(null);
    }
  }

  function requestSubmit() {
    if ((status === "closed" || status === "cancelled") && status !== cycle.status) {
      setConfirming(status);
      return;
    }
    formRef.current?.requestSubmit();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Modifier le cycle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le cycle</DialogTitle>
          <DialogDescription>
            Corrigez les dates, les notes ou le statut sans recréer le cycle.
          </DialogDescription>
        </DialogHeader>
        {confirming ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              {confirming === "cancelled"
                ? "L’annulation rend ce cycle terminal. Aucune saillie, portée ou mesure de progestérone n’est supprimée."
                : "La clôture termine ce cycle. Aucune saillie, portée ou mesure de progestérone n’est supprimée."}
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirming(null)}>
                Revenir
              </Button>
              <Button type="button" onClick={() => formRef.current?.requestSubmit()}>
                Confirmer
              </Button>
            </DialogFooter>
          </div>
        ) : null}
        <form
          ref={formRef}
          action={formAction}
          className={confirming ? "hidden" : "space-y-4"}
        >
          <div className="rounded-xl border bg-muted/30 px-3 py-3 text-sm">
            <p className="font-semibold">État courant</p>
            <p className="mt-1 text-muted">{statusLabels[cycle.status]}</p>
            {cycle.litterId ? (
              <p className="mt-2 text-muted">
                Portée liée :{" "}
                <Link href={`/litters/${cycle.litterId}`} className="font-semibold text-accent hover:underline">
                  {cycle.litterName ?? "Ouvrir la portée"}
                </Link>
              </p>
            ) : null}
            {hasMatingOrLitter ? (
              <p className="mt-2 text-amber-900">
                Une saillie ou une portée est liée : l’annulation est impossible.
              </p>
            ) : null}
          </div>
          <div>
            <label className={labelClass} htmlFor={`edit-cycle-started-on-${cycle.id}`}>
              Date de début
            </label>
            <input
              id={`edit-cycle-started-on-${cycle.id}`}
              className={inputClass}
              name="started_on"
              type="date"
              required
              defaultValue={cycle.startedOn}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`edit-cycle-ended-on-${cycle.id}`}>
              Date de fin
            </label>
            <input
              id={`edit-cycle-ended-on-${cycle.id}`}
              className={inputClass}
              name="ended_on"
              type="date"
              defaultValue={cycle.endedOn ?? ""}
              required={status === "closed"}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`edit-cycle-status-${cycle.id}`}>
              Statut
            </label>
            <select
              id={`edit-cycle-status-${cycle.id}`}
              className={inputClass}
              name="status"
              required
              value={status}
              onChange={(event) => setStatus(event.target.value as ReproductiveCycleStatus)}
            >
              {allowedStatuses.map((value) => (
                <option key={value} value={value} disabled={value === "cancelled" && hasMatingOrLitter}>
                  {statusLabels[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor={`edit-cycle-notes-${cycle.id}`}>
              Notes
            </label>
            <textarea
              id={`edit-cycle-notes-${cycle.id}`}
              className={inputClass}
              name="notes"
              rows={4}
              maxLength={5000}
              defaultValue={cycle.notes ?? ""}
            />
          </div>
          <ActionMessage status={state.status} message={state.message} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Annuler</Button>
            </DialogClose>
            <Button type="button" onClick={requestSubmit}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CycleUpdateSuccessNotice({ cycleId }: { cycleId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const key = `reproduction-cycle-update-success:${cycleId}`;
    const saved = window.sessionStorage.getItem(key);
    if (!saved) return;
    window.sessionStorage.removeItem(key);
    const frame = window.requestAnimationFrame(() => setMessage(saved));
    return () => window.cancelAnimationFrame(frame);
  }, [cycleId]);

  return message ? <ActionMessage status="success" message={message} /> : null;
}

function AddMeasurementDialog({
  cycleId,
  motherId,
}: {
  cycleId: string;
  motherId: string;
}) {
  const [state, formAction] = useActionState(
    addProgesteroneMeasurementAction,
    initialReproductionActionState,
  );
  const [open, setOpen] = useState(false);
  const measuredAtRef = useRef<HTMLInputElement>(null);
  const resultedAtRef = useRef<HTMLInputElement>(null);
  const measuredAtIsoRef = useRef<HTMLInputElement>(null);
  const resultedAtIsoRef = useRef<HTMLInputElement>(null);

  function prepareTimestamps() {
    if (measuredAtIsoRef.current) {
      measuredAtIsoRef.current.value = localDateTimeToIso(measuredAtRef.current?.value ?? "");
    }
    if (resultedAtIsoRef.current) {
      resultedAtIsoRef.current.value = localDateTimeToIso(resultedAtRef.current?.value ?? "");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">Ajouter un dosage</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un dosage de progestérone</DialogTitle>
          <DialogDescription>
            L’unité est enregistrée telle que saisie, sans conversion automatique.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareTimestamps} className="space-y-4">
          <input type="hidden" name="cycle_id" value={cycleId} />
          <input type="hidden" name="mother_id" value={motherId} />
          <input ref={measuredAtIsoRef} type="hidden" name="measured_at" />
          <input ref={resultedAtIsoRef} type="hidden" name="resulted_at" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor={`measurement-measured-at-${cycleId}`}>
                Prélèvement
              </label>
              <input ref={measuredAtRef} id={`measurement-measured-at-${cycleId}`} className={inputClass} name="measured_at_local" type="datetime-local" required />
            </div>
            <div>
              <label className={labelClass} htmlFor={`measurement-value-${cycleId}`}>
                Valeur
              </label>
              <input id={`measurement-value-${cycleId}`} className={inputClass} name="value" type="number" min="0.001" step="0.001" required />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor={`measurement-unit-${cycleId}`}>
              Unité
            </label>
            <select id={`measurement-unit-${cycleId}`} className={inputClass} name="unit" required defaultValue="ng_ml">
              <option value="ng_ml">ng/mL</option>
              <option value="nmol_l">nmol/L</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor={`measurement-resulted-at-${cycleId}`}>
              Résultat disponible le
            </label>
            <input ref={resultedAtRef} id={`measurement-resulted-at-${cycleId}`} className={inputClass} name="resulted_at_local" type="datetime-local" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor={`measurement-laboratory-${cycleId}`}>Laboratoire</label>
              <input id={`measurement-laboratory-${cycleId}`} className={inputClass} name="laboratory_name" type="text" maxLength={255} />
            </div>
            <div>
              <label className={labelClass} htmlFor={`measurement-reference-${cycleId}`}>Référence d’échantillon</label>
              <input id={`measurement-reference-${cycleId}`} className={inputClass} name="sample_reference" type="text" maxLength={255} />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor={`measurement-method-${cycleId}`}>Méthode</label>
            <input id={`measurement-method-${cycleId}`} className={inputClass} name="method" type="text" maxLength={255} />
          </div>
          <div>
            <label className={labelClass} htmlFor={`measurement-note-${cycleId}`}>Observation</label>
            <textarea id={`measurement-note-${cycleId}`} className={inputClass} name="note" rows={3} maxLength={5000} />
          </div>
          <ActionMessage status={state.status} message={state.message} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Annuler</Button>
            </DialogClose>
            <SubmitButton label="Ajouter le dosage" pendingLabel="Ajout..." />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Measurements({
  cycle,
  motherId,
  canWrite,
}: {
  cycle: CycleWithMeasurements;
  motherId: string;
  canWrite: boolean;
}) {
  return (
    <section className="mt-6 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Dosages de progestérone</h3>
          <p className="mt-1 text-sm text-muted">Les résultats restent dans leur unité d’origine.</p>
        </div>
        {canWrite ? <AddMeasurementDialog cycleId={cycle.id} motherId={motherId} /> : null}
      </div>
      {cycle.measurements.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Aucun dosage enregistré pour ce cycle.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {cycle.measurements.map((measurement) => (
            <li key={measurement.id} className="min-w-0 rounded-xl border bg-background p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(measurement.value)} {unitLabels[measurement.unit]}
                  </p>
                  <p className="mt-1 text-sm text-muted">Prélèvement : {formatDateTime(measurement.measuredAt)}</p>
                </div>
                {measurement.resultedAt ? <p className="text-sm text-muted">Résultat : {formatDateTime(measurement.resultedAt)}</p> : null}
              </div>
              {(measurement.laboratoryName || measurement.sampleReference || measurement.method || measurement.note) ? (
                <dl className="mt-3 grid gap-2 break-words text-sm text-muted sm:grid-cols-2">
                  {measurement.laboratoryName ? <div><dt className="font-medium text-foreground">Laboratoire</dt><dd>{measurement.laboratoryName}</dd></div> : null}
                  {measurement.sampleReference ? <div><dt className="font-medium text-foreground">Référence</dt><dd>{measurement.sampleReference}</dd></div> : null}
                  {measurement.method ? <div><dt className="font-medium text-foreground">Méthode</dt><dd>{measurement.method}</dd></div> : null}
                  {measurement.note ? <div className="sm:col-span-2"><dt className="font-medium text-foreground">Observation</dt><dd className="whitespace-pre-wrap">{measurement.note}</dd></div> : null}
                </dl>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RecordMatingDialog({
  cycle,
  eligibleFathers,
  lockedFatherName,
}: {
  cycle: CycleWithMeasurements;
  eligibleFathers: FatherOption[];
  lockedFatherName: string | null;
}) {
  // Garde la commande idempotente liée au rendu initial, y compris après une revalidation.
  const actionRef = useRef(cycle.matingAction);
  const stableAction = useCallback(
    (previousState: ReproductionActionState, formData: FormData) =>
      actionRef.current(previousState, formData),
    [],
  );
  const [state, formAction] = useActionState(stableAction, initialReproductionActionState);
  const [open, setOpen] = useState(false);
  const occurredAtRef = useRef<HTMLInputElement>(null);
  const occurredAtIsoRef = useRef<HTMLInputElement>(null);
  const timezoneNameRef = useRef<HTMLInputElement>(null);
  const isFirstMating = cycle.matings.length === 0;

  useEffect(() => {
    if (state.status !== "success") return;

    window.sessionStorage.setItem(
      `reproduction-mating-success:${cycle.id}`,
      JSON.stringify({
        message: state.message ?? "La saillie a été enregistrée.",
        settingsHref: state.settingsHref,
      }),
    );
    window.location.reload();
  }, [cycle.id, state.message, state.settingsHref, state.status]);

  function prepareTimestamp() {
    if (occurredAtIsoRef.current) {
      occurredAtIsoRef.current.value = localDateTimeToIso(occurredAtRef.current?.value ?? "");
    }
    if (timezoneNameRef.current) {
      timezoneNameRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">Enregistrer une saillie</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enregistrer une saillie</DialogTitle>
          <DialogDescription>
            {isFirstMating
              ? "La première saillie crée la portée liée à ce cycle."
              : "L’étalon et la portée sont déjà fixés pour ce cycle."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareTimestamp} className="space-y-4">
          <input ref={occurredAtIsoRef} type="hidden" name="occurred_at" />
          <input ref={timezoneNameRef} type="hidden" name="timezone_name" />
          {isFirstMating ? (
            <div>
              <label className={labelClass} htmlFor={`mating-father-${cycle.id}`}>Étalon</label>
              <select id={`mating-father-${cycle.id}`} className={inputClass} name="father_id" required defaultValue="">
                <option value="" disabled>Sélectionnez un étalon</option>
                {eligibleFathers.map((father) => <option key={father.id} value={father.id}>{father.name}</option>)}
              </select>
              {eligibleFathers.length === 0 ? <p className="mt-2 text-sm text-muted">Aucun étalon éligible n’est disponible.</p> : null}
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/30 px-3 py-3 text-sm">
              <p className="font-semibold">Étalon déjà fixé</p>
              <p className="mt-1 text-muted">{lockedFatherName ?? "Étalon non disponible"}</p>
            </div>
          )}
          <div>
            <label className={labelClass} htmlFor={`mating-occurred-at-${cycle.id}`}>Date et heure</label>
            <input ref={occurredAtRef} id={`mating-occurred-at-${cycle.id}`} className={inputClass} type="datetime-local" required />
          </div>
          <div>
            <label className={labelClass} htmlFor={`mating-method-${cycle.id}`}>Méthode</label>
            <select id={`mating-method-${cycle.id}`} className={inputClass} name="method" required defaultValue="">
              <option value="" disabled>Sélectionnez une méthode</option>
              {Object.entries(matingMethodLabels).map(([method, label]) => <option key={method} value={method}>{label}</option>)}
            </select>
          </div>
          {isFirstMating ? (
            <div>
              <label className={labelClass} htmlFor={`mating-litter-name-${cycle.id}`}>Nom de la portée</label>
              <input id={`mating-litter-name-${cycle.id}`} className={inputClass} name="litter_name" type="text" maxLength={255} required />
            </div>
          ) : null}
          {isFirstMating ? (
            <div>
              <label className={labelClass} htmlFor={`mating-estimated-ovulation-${cycle.id}`}>Ovulation estimée</label>
              <input id={`mating-estimated-ovulation-${cycle.id}`} className={inputClass} name="estimated_ovulation_date" type="date" />
              <p className="mt-2 text-xs text-muted">Facultatif. Utilisée en priorité pour dériver la date prévue de mise-bas.</p>
            </div>
          ) : null}
          <div>
            <label className={labelClass} htmlFor={`mating-location-${cycle.id}`}>Lieu</label>
            <input id={`mating-location-${cycle.id}`} className={inputClass} name="location" type="text" maxLength={500} />
          </div>
          <div>
            <label className={labelClass} htmlFor={`mating-note-${cycle.id}`}>Note</label>
            <textarea id={`mating-note-${cycle.id}`} className={inputClass} name="note" rows={3} maxLength={5000} />
          </div>
          <ActionMessage status={state.status} message={state.message} />
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>
            <SubmitButton label="Enregistrer la saillie" pendingLabel="Enregistrement..." />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MatingSuccessNotice({ cycleId }: { cycleId: string }) {
  const [success, setSuccess] = useState<{
    message: string;
    settingsHref?: string;
  } | null>(null);

  useEffect(() => {
    const key = `reproduction-mating-success:${cycleId}`;
    const saved = window.sessionStorage.getItem(key);
    if (!saved) return;
    window.sessionStorage.removeItem(key);

    let parsed: { message: string; settingsHref?: string } | null = null;
    try {
      const value: unknown = JSON.parse(saved);
      if (value && typeof value === "object" && "message" in value) {
        const record = value as { message: unknown; settingsHref?: unknown };
        parsed = {
          message: typeof record.message === "string" ? record.message : saved,
          settingsHref:
            typeof record.settingsHref === "string" ? record.settingsHref : undefined,
        };
      }
    } catch {
      parsed = { message: saved };
    }

    const frame = window.requestAnimationFrame(() => setSuccess(parsed));
    return () => window.cancelAnimationFrame(frame);
  }, [cycleId]);

  if (!success) return null;

  return (
    <div className="space-y-2">
      <ActionMessage status="success" message={success.message} />
      {success.settingsHref ? (
        <p className="text-sm">
          <Link href={success.settingsHref} className="font-semibold text-accent hover:underline">
            Ouvrir les paramètres de l’organisation
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Matings({
  cycle,
  canWrite,
  eligibleFathers,
  fatherNames,
}: {
  cycle: CycleWithMeasurements;
  canWrite: boolean;
  eligibleFathers: FatherOption[];
  fatherNames: Record<string, string>;
}) {
  const canRecord = canWrite && cycle.status !== "closed" && cycle.status !== "cancelled";
  const lockedFatherName = cycle.matings[0] ? fatherNames[cycle.matings[0].fatherId] ?? null : null;

  return (
    <section className="mt-6 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Saillies</h3>
          <p className="mt-1 text-sm text-muted">Les saillies sont affichées dans leur ordre d’enregistrement.</p>
        </div>
        {canRecord ? <RecordMatingDialog cycle={cycle} eligibleFathers={eligibleFathers} lockedFatherName={lockedFatherName} /> : null}
      </div>
      <div className="mt-4"><MatingSuccessNotice cycleId={cycle.id} /></div>
      {cycle.litterId ? (
        <p className="mt-4 text-sm">
          <Link href={`/litters/${cycle.litterId}`} className="font-semibold text-accent hover:underline">Ouvrir la portée</Link>
          {cycle.litterName ? <span className="text-muted"> · {cycle.litterName}</span> : null}
        </p>
      ) : null}
      {cycle.matings.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Aucune saillie enregistrée pour ce cycle.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {cycle.matings.map((mating) => (
            <li key={mating.id} className="min-w-0 rounded-xl border bg-background p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">Saillie n° {mating.sequenceNo}</p>
                  <p className="mt-1 text-sm text-muted">{formatDateTime(mating.occurredAt)}</p>
                </div>
                <p className="text-sm font-medium text-foreground">{matingMethodLabels[mating.method]}</p>
              </div>
              <dl className="mt-3 grid gap-2 break-words text-sm text-muted sm:grid-cols-2">
                <div><dt className="font-medium text-foreground">Étalon</dt><dd>{fatherNames[mating.fatherId] ?? "Étalon non disponible"}</dd></div>
                {mating.location ? <div><dt className="font-medium text-foreground">Lieu</dt><dd>{mating.location}</dd></div> : null}
                {mating.note ? <div className="sm:col-span-2"><dt className="font-medium text-foreground">Note</dt><dd className="whitespace-pre-wrap">{mating.note}</dd></div> : null}
              </dl>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ReproductionPanel({
  motherId,
  cycles,
  canWrite,
  eligibleFathers,
  fatherNames,
}: {
  motherId: string;
  cycles: CycleWithMeasurements[];
  canWrite: boolean;
  eligibleFathers: FatherOption[];
  fatherNames: Record<string, string>;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-5 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-semibold">Cycles reproductifs</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Historique des cycles et dosages de progestérone.</p>
        </div>
        {canWrite ? <CreateCycleDialog motherId={motherId} /> : <span className="w-fit rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-muted">Lecture seule</span>}
      </div>
      {cycles.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed px-4 py-5 text-sm text-muted">Aucun cycle reproductif enregistré pour cette femelle.</p>
      ) : (
        <ol className="mt-6 space-y-5">
          {cycles.map((cycle) => (
            <li key={cycle.id} id={`cycle-${cycle.id}`} className="min-w-0 scroll-mt-24 rounded-2xl border bg-background p-4 sm:p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">Cycle débuté le {formatDate(cycle.startedOn)}</p>
                  <p className="mt-1 text-sm text-muted">{cycle.endedOn ? `Terminé le ${formatDate(cycle.endedOn)}` : "Date de fin non renseignée"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-fit rounded-full border px-3 py-1 text-xs font-semibold text-muted">{statusLabels[cycle.status]}</span>
                  {canWrite ? <EditCycleDialog cycle={cycle} /> : null}
                </div>
              </div>
              <div className="mt-4"><CycleUpdateSuccessNotice cycleId={cycle.id} /></div>
              <div className="mt-4 text-sm leading-6 text-muted">
                <p className="font-medium text-foreground">Notes</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{cycle.notes || "Aucune note renseignée."}</p>
              </div>
              <Measurements cycle={cycle} motherId={motherId} canWrite={canWrite} />
              <Matings cycle={cycle} canWrite={canWrite} eligibleFathers={eligibleFathers} fatherNames={fatherNames} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
