"use client";

import { Baby, Clock3, Pencil, Plus, Trash2 } from "lucide-react";
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

import {
  initialWhelpingActionState,
  initialWhelpingBirthActionState,
  initialWhelpingBirthAdjustmentActionState,
  type WhelpingActionState,
  type WhelpingBirthActionState,
  type WhelpingBirthAdjustmentActionState,
} from "./whelping-actions-core";
import {
  isRoutineQuickCompletionEvent,
  QUICK_WHELPING_COMPLETION_REASON,
  type GenericWhelpingEventType,
  type WhelpingBirthSex,
  type WhelpingBirthAdjustmentHistoryEntry,
  type WhelpingBirthSummary,
  type WhelpingBirthViability,
  type WhelpingEventSummary,
  type WhelpingSessionSummary,
} from "./whelping-core";
import {
  WhelpingQuickCompletion,
  type WhelpingQuickCompletionItem,
} from "./whelping-quick-completion";

type SimpleAction = (
  previousState: WhelpingActionState,
  formData: FormData,
) => Promise<WhelpingActionState>;

type BirthAction = (
  previousState: WhelpingBirthActionState,
  formData: FormData,
) => Promise<WhelpingBirthActionState>;

type BirthAdjustmentAction = (
  previousState: WhelpingBirthAdjustmentActionState,
  formData: FormData,
) => Promise<WhelpingBirthAdjustmentActionState>;

export type WhelpingBirthWeightAction = {
  birthId: string;
  action: SimpleAction;
};

export type WhelpingBirthAdjustmentAction = {
  birthId: string;
  correctAction: BirthAdjustmentAction;
  cancelAction: BirthAdjustmentAction | null;
};

export type WhelpingQuickCompletionAction = {
  birthId: string;
  action: BirthAdjustmentAction;
};

type WhelpingRole = "owner" | "admin" | "member" | "viewer" | null;

const inputClass =
  "mt-2 min-h-11 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-1 focus:ring-accent";
const labelClass = "text-sm font-semibold";

const eventLabels: Record<GenericWhelpingEventType, string> = {
  labor_started: "Début du travail",
  contractions: "Contractions",
  water_broke: "Rupture de la poche des eaux",
  placenta: "Placenta",
  nursing: "Allaitement",
  vet_called: "Appel vétérinaire",
  intervention: "Intervention",
  observation: "Observation",
};

const sexLabels: Record<WhelpingBirthSex, string> = {
  female: "Femelle",
  male: "Mâle",
  unknown: "Inconnu",
};

const viabilityLabels: Record<WhelpingBirthViability, string> = {
  alive: "Vivant",
  stillborn: "Mort-né",
  unknown: "État à confirmer",
};

function currentLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function localDateTimeToIso(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function isoToLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function formatDateTime(value: string, timezoneName: string) {
  const date = new Date(value);
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezoneName,
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

function formatTime(value: string, timezoneName: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: timezoneName,
    }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  }
}

function ActionMessage({ state }: { state: WhelpingActionState }) {
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

function AdjustmentMessage({ state }: { state: WhelpingBirthAdjustmentActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error"
        ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        : "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"}
    >
      {state.message}
      {state.stale ? (
        <> <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Recharger les données</button></>
      ) : null}
    </p>
  );
}

function SubmitButton({
  idleLabel,
  pendingLabel,
  variant,
}: {
  idleLabel: string;
  pendingLabel: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} disabled={pending} className="min-h-11">
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

function OpenSessionDialog({
  action,
  onSuccess,
}: {
  action: SimpleAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startedAt, setStartedAt] = useState(currentLocalDateTime);
  const startedAtIsoRef = useRef<HTMLInputElement>(null);
  const timezoneNameRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(
    async (previousState: WhelpingActionState, formData: FormData) => {
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
    initialWhelpingActionState,
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setStartedAt(currentLocalDateTime());
    setOpen(nextOpen);
  }

  function prepareSubmission() {
    if (startedAtIsoRef.current) {
      startedAtIsoRef.current.value = localDateTimeToIso(startedAt);
    }
    if (timezoneNameRef.current) {
      timezoneNameRef.current.value = browserTimezone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className="min-h-11">
          <Clock3 aria-hidden="true" />
          Démarrer la mise-bas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Démarrer la mise-bas</DialogTitle>
          <DialogDescription>
            L’heure locale sera enregistrée avec le fuseau de cet appareil.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareSubmission} className="space-y-4">
          <input ref={startedAtIsoRef} type="hidden" name="started_at" />
          <input ref={timezoneNameRef} type="hidden" name="timezone_name" />
          <div>
            <label className={labelClass} htmlFor="whelping-started-at">
              Date et heure de début
            </label>
            <input
              id="whelping-started-at"
              className={inputClass}
              type="datetime-local"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="whelping-open-note">
              Note (facultative)
            </label>
            <textarea
              id="whelping-open-note"
              className={inputClass}
              name="note"
              rows={3}
              maxLength={5000}
            />
          </div>
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton
              idleLabel="Démarrer la mise-bas"
              pendingLabel="Démarrage..."
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpressBirthActions({
  maleAction,
  femaleAction,
  timezoneName,
  onSuccess,
}: {
  maleAction: BirthAction;
  femaleAction: BirthAction;
  timezoneName: string;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [submittingSex, setSubmittingSex] = useState<"male" | "female" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submitExpressBirth(
    sex: "male" | "female",
    action: BirthAction,
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (submittingRef.current) return;

    submittingRef.current = true;
    const occurredAt = new Date().toISOString();
    setSubmittingSex(sex);
    setErrorMessage(null);

    const formData = new FormData();
    formData.set("occurred_at", occurredAt);
    formData.set("sex", sex);
    formData.set("viability", "unknown");

    let succeeded = false;
    try {
      const nextState = await action(initialWhelpingBirthActionState, formData);
      if (nextState.status === "success" && nextState.birthOrder) {
        succeeded = true;
        onSuccess(
          `Naissance n° ${nextState.birthOrder} — ${sex === "male" ? "mâle" : "femelle"} — enregistrée à ${formatTime(occurredAt, timezoneName)}`,
        );
        router.refresh();
      } else {
        setErrorMessage(
          nextState.message ??
            "La naissance n’a pas pu être enregistrée. Rechargez la page avant de réessayer.",
        );
      }
    } catch {
      setErrorMessage(
        "La naissance n’a pas pu être enregistrée. Rechargez la page avant de réessayer.",
      );
    } finally {
      if (!succeeded) {
        submittingRef.current = false;
        setSubmittingSex(null);
      }
    }
  }

  const submitting = submittingSex !== null;

  return (
    <div className="w-full space-y-3" data-testid="express-birth-actions">
      <form onSubmit={(event) => void submitExpressBirth("male", maleAction, event)}>
        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="min-h-14 w-full text-sm font-bold tracking-wide sm:text-base"
        >
          <Baby aria-hidden="true" />
          {submittingSex === "male" ? "ENREGISTREMENT…" : "+ NAISSANCE MÂLE"}
        </Button>
      </form>
      <form onSubmit={(event) => void submitExpressBirth("female", femaleAction, event)}>
        <Button
          type="submit"
          size="lg"
          disabled={submitting}
          className="min-h-14 w-full text-sm font-bold tracking-wide sm:text-base"
        >
          <Baby aria-hidden="true" />
          {submittingSex === "female" ? "ENREGISTREMENT…" : "+ NAISSANCE FEMELLE"}
        </Button>
      </form>
      {errorMessage ? (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function BirthDialog({
  action,
  onSuccess,
  triggerLabel = "+ ENREGISTRER UNE NAISSANCE",
  secondary = false,
}: {
  action: BirthAction;
  onSuccess: (message: string) => void;
  triggerLabel?: string;
  secondary?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [occurredAt, setOccurredAt] = useState(currentLocalDateTime);
  const [weight, setWeight] = useState("");
  const [measuredAt, setMeasuredAt] = useState(currentLocalDateTime);
  const occurredAtIsoRef = useRef<HTMLInputElement>(null);
  const measuredAtIsoRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(
    async (previousState: WhelpingBirthActionState, formData: FormData) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") {
        setOpen(false);
        onSuccess(
          nextState.birthOrder
            ? `Naissance n° ${nextState.birthOrder} enregistrée`
            : "La naissance a été enregistrée.",
        );
        router.refresh();
      }
      return nextState;
    },
    [action, onSuccess, router],
  );
  const [state, formAction] = useActionState(
    submitAction,
    initialWhelpingBirthActionState,
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const now = currentLocalDateTime();
      setOccurredAt(now);
      setMeasuredAt(now);
      setWeight("");
    }
    setOpen(nextOpen);
  }

  function prepareSubmission() {
    if (occurredAtIsoRef.current) {
      occurredAtIsoRef.current.value = localDateTimeToIso(occurredAt);
    }
    if (measuredAtIsoRef.current) {
      measuredAtIsoRef.current.value = weight
        ? localDateTimeToIso(measuredAt)
        : "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="lg"
          variant={secondary ? "outline" : "default"}
          className={secondary
            ? "min-h-11 w-full text-sm font-semibold sm:w-auto"
            : "min-h-14 w-full text-sm font-bold tracking-wide sm:w-auto sm:text-base"}
        >
          <Baby aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-1.5rem)] overflow-y-auto rounded-xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enregistrer une naissance</DialogTitle>
          <DialogDescription>
            Saisissez les informations disponibles. La validation serveur reste définitive.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareSubmission} className="space-y-4">
          <input ref={occurredAtIsoRef} type="hidden" name="occurred_at" />
          <input ref={measuredAtIsoRef} type="hidden" name="measured_at" />
          <div>
            <label className={labelClass} htmlFor="whelping-birth-occurred-at">
              Date et heure de naissance
            </label>
            <input
              id="whelping-birth-occurred-at"
              className={inputClass}
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="whelping-birth-sex">
                Sexe
              </label>
              <select id="whelping-birth-sex" className={inputClass} name="sex" defaultValue="unknown" required>
                <option value="female">Femelle</option>
                <option value="male">Mâle</option>
                <option value="unknown">Inconnu</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="whelping-birth-viability">
                Viabilité
              </label>
              <select id="whelping-birth-viability" className={inputClass} name="viability" defaultValue="alive" required>
                <option value="alive">Vivant</option>
                <option value="stillborn">Mort-né</option>
                <option value="unknown">À confirmer</option>
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="whelping-birth-color">
                Couleur ou collier initial (facultatif)
              </label>
              <input
                id="whelping-birth-color"
                className={inputClass}
                name="initial_collar_color"
                maxLength={255}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="whelping-birth-weight">
                Poids en grammes (facultatif)
              </label>
              <input
                id="whelping-birth-weight"
                className={inputClass}
                name="birth_weight_grams"
                type="number"
                min="1"
                max="100000"
                step="1"
                inputMode="numeric"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
              <p className="mt-2 text-xs leading-5 text-muted">
                Vous pouvez utiliser la dictée du clavier de votre téléphone si elle est disponible.
              </p>
            </div>
          </div>
          {weight ? (
            <div>
              <label className={labelClass} htmlFor="whelping-birth-measured-at">
                Heure de pesée
              </label>
              <input
                id="whelping-birth-measured-at"
                className={inputClass}
                type="datetime-local"
                value={measuredAt}
                onChange={(event) => setMeasuredAt(event.target.value)}
                required
              />
            </div>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="whelping-birth-note">
              Note (facultative)
            </label>
            <textarea id="whelping-birth-note" className={inputClass} name="note" rows={3} maxLength={5000} />
          </div>
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton
              idleLabel="Enregistrer la naissance"
              pendingLabel="Enregistrement..."
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EventDialog({
  action,
  onSuccess,
}: {
  action: SimpleAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [occurredAt, setOccurredAt] = useState(currentLocalDateTime);
  const occurredAtIsoRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(
    async (previousState: WhelpingActionState, formData: FormData) => {
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
    initialWhelpingActionState,
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setOccurredAt(currentLocalDateTime());
    setOpen(nextOpen);
  }

  function prepareSubmission() {
    if (occurredAtIsoRef.current) {
      occurredAtIsoRef.current.value = localDateTimeToIso(occurredAt);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11">
          <Plus aria-hidden="true" />
          Ajouter un événement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un événement</DialogTitle>
          <DialogDescription>
            Ajoutez un repère à la chronologie de la mise-bas.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareSubmission} className="space-y-4">
          <input ref={occurredAtIsoRef} type="hidden" name="occurred_at" />
          <div>
            <label className={labelClass} htmlFor="whelping-event-type">
              Type
            </label>
            <select id="whelping-event-type" className={inputClass} name="event_type" defaultValue="labor_started" required>
              {Object.entries(eventLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="whelping-event-occurred-at">
              Date et heure
            </label>
            <input
              id="whelping-event-occurred-at"
              className={inputClass}
              type="datetime-local"
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="whelping-event-note">
              Note (facultative)
            </label>
            <textarea id="whelping-event-note" className={inputClass} name="note" rows={3} maxLength={5000} />
          </div>
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton idleLabel="Ajouter l’événement" pendingLabel="Ajout..." />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BirthWeightDialog({
  action,
  birthOrder,
  onSuccess,
}: {
  action: SimpleAction;
  birthOrder: number;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [measuredAt, setMeasuredAt] = useState(currentLocalDateTime);
  const measuredAtIsoRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(
    async (previousState: WhelpingActionState, formData: FormData) => {
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
    initialWhelpingActionState,
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setMeasuredAt(currentLocalDateTime());
    setOpen(nextOpen);
  }

  function prepareSubmission() {
    if (measuredAtIsoRef.current) {
      measuredAtIsoRef.current.value = localDateTimeToIso(measuredAt);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="mt-3 min-h-10">
          Renseigner le poids
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Renseigner le poids de naissance</DialogTitle>
          <DialogDescription>
            Complétez la pesée de la naissance n° {birthOrder}. Cette mesure ne pourra pas être remplacée ici.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareSubmission} className="space-y-4">
          <input ref={measuredAtIsoRef} type="hidden" name="measured_at" />
          <div>
            <label className={labelClass} htmlFor={`whelping-birth-weight-${birthOrder}`}>
              Poids en grammes
            </label>
            <input
              id={`whelping-birth-weight-${birthOrder}`}
              className={inputClass}
              name="birth_weight_grams"
              type="number"
              min={1}
              max={100000}
              step={1}
              inputMode="numeric"
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`whelping-birth-measured-at-${birthOrder}`}>
              Date et heure de pesée
            </label>
            <input
              id={`whelping-birth-measured-at-${birthOrder}`}
              className={inputClass}
              type="datetime-local"
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor={`whelping-birth-weight-note-${birthOrder}`}>
              Note (facultative)
            </label>
            <textarea
              id={`whelping-birth-weight-note-${birthOrder}`}
              className={inputClass}
              name="note"
              rows={3}
              maxLength={5000}
            />
          </div>
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton
              idleLabel="Enregistrer le poids"
              pendingLabel="Enregistrement..."
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseSessionDialog({
  action,
  onSuccess,
}: {
  action: SimpleAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [endedAt, setEndedAt] = useState(currentLocalDateTime);
  const endedAtIsoRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(
    async (previousState: WhelpingActionState, formData: FormData) => {
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
    initialWhelpingActionState,
  );

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setEndedAt(currentLocalDateTime());
    setOpen(nextOpen);
  }

  function prepareSubmission() {
    if (endedAtIsoRef.current) {
      endedAtIsoRef.current.value = localDateTimeToIso(endedAt);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11 border-amber-300 text-amber-950">
          Clôturer la mise-bas
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Clôturer la mise-bas</DialogTitle>
          <DialogDescription>
            La clôture sera ajoutée à la chronologie et restera visible en cas de réouverture ultérieure.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareSubmission} className="space-y-4">
          <input ref={endedAtIsoRef} type="hidden" name="ended_at" />
          <div>
            <label className={labelClass} htmlFor="whelping-ended-at">
              Date et heure de fin
            </label>
            <input
              id="whelping-ended-at"
              className={inputClass}
              type="datetime-local"
              value={endedAt}
              onChange={(event) => setEndedAt(event.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="whelping-close-note">
              Note (facultative)
            </label>
            <textarea id="whelping-close-note" className={inputClass} name="note" rows={3} maxLength={5000} />
          </div>
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton
              idleLabel="Clôturer la mise-bas"
              pendingLabel="Clôture..."
              variant="destructive"
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReopenSessionDialog({
  action,
  onSuccess,
}: {
  action: SimpleAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const reopenedAtIsoRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(
    async (previousState: WhelpingActionState, formData: FormData) => {
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
    initialWhelpingActionState,
  );

  function prepareSubmission() {
    if (reopenedAtIsoRef.current) {
      reopenedAtIsoRef.current.value = new Date().toISOString();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="min-h-11">
          Rouvrir la session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rouvrir la session</DialogTitle>
          <DialogDescription>
            Confirmez la réouverture. L’ancienne clôture restera visible dans la chronologie.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareSubmission} className="space-y-4">
          <input ref={reopenedAtIsoRef} type="hidden" name="reopened_at" />
          <div>
            <label className={labelClass} htmlFor="whelping-reopen-reason">
              Motif de la réouverture
            </label>
            <textarea
              id="whelping-reopen-reason"
              className={inputClass}
              name="reason"
              rows={3}
              maxLength={500}
              required
            />
          </div>
          <ActionMessage state={state} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="min-h-11">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton
              idleLabel="Confirmer la réouverture"
              pendingLabel="Réouverture..."
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BirthCorrectionDialog({
  birth,
  action,
  onSuccess,
}: {
  birth: WhelpingBirthSummary;
  action: BirthAdjustmentAction;
  onSuccess: (message: string) => void;
}) {
  const needsCompletion =
    birth.viability === "unknown" ||
    birth.initialCollarColor === null ||
    birth.birthWeightMeasurement === null;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [occurredAt, setOccurredAt] = useState(() => isoToLocalDateTime(birth.occurredAt));
  const [weight, setWeight] = useState(() => birth.birthWeightMeasurement?.grams.toString() ?? "");
  const [weightMeasuredAt, setWeightMeasuredAt] = useState(() =>
    birth.birthWeightMeasurement ? isoToLocalDateTime(birth.birthWeightMeasurement.measuredAt) : "",
  );
  const occurredAtIsoRef = useRef<HTMLInputElement>(null);
  const weightMeasuredAtIsoRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(async (
    previousState: WhelpingBirthAdjustmentActionState,
    formData: FormData,
  ) => {
    const nextState = await action(previousState, formData);
    if (nextState.status === "success") {
      setOpen(false);
      onSuccess(nextState.message ?? "La naissance a été corrigée.");
      router.refresh();
    }
    return nextState;
  }, [action, onSuccess, router]);
  const [state, formAction] = useActionState(
    submitAction,
    initialWhelpingBirthAdjustmentActionState,
  );
  const hasWeight = weight.trim().length > 0;

  function prepareSubmission() {
    if (occurredAtIsoRef.current) occurredAtIsoRef.current.value = localDateTimeToIso(occurredAt);
    if (weightMeasuredAtIsoRef.current) {
      weightMeasuredAtIsoRef.current.value = hasWeight ? localDateTimeToIso(weightMeasuredAt) : "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Pencil className="size-4" aria-hidden="true" />
          {needsCompletion ? "Compléter la naissance" : "Corriger"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {needsCompletion ? "Compléter" : "Corriger"} la naissance n° {birth.birthOrder}
          </DialogTitle>
          <DialogDescription>
            Le numéro d’ordre ne changera pas. L’événement initial restera conservé et une entrée d’historique sera ajoutée. La nouvelle heure doit respecter l’ordre des naissances.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={prepareSubmission} className="space-y-4">
          <input ref={occurredAtIsoRef} type="hidden" name="occurred_at" />
          <input ref={weightMeasuredAtIsoRef} type="hidden" name="weight_measured_at" />
          <label className={labelClass}>Date et heure de naissance
            <input className={inputClass} type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Sexe
              <select className={inputClass} name="sex" defaultValue={birth.sex} required>
                <option value="female">Femelle</option><option value="male">Mâle</option><option value="unknown">Inconnu</option>
              </select>
            </label>
            <label className={labelClass}>Viabilité
              <select className={inputClass} name="viability" defaultValue={birth.viability} required>
                <option value="alive">Vivant</option><option value="stillborn">Mort-né</option><option value="unknown">À confirmer</option>
              </select>
            </label>
          </div>
          <label className={labelClass}>Couleur ou collier initial
            <input className={inputClass} name="initial_collar_color" maxLength={255} defaultValue={birth.initialCollarColor ?? ""} />
          </label>
          <label className={labelClass}>Note de naissance
            <textarea className={inputClass} name="birth_note" rows={3} maxLength={5000} defaultValue={birth.note ?? ""} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Poids de naissance (g)
              <input className={inputClass} name="birth_weight_grams" type="number" min={1} max={100000} step={1} inputMode="numeric" value={weight} onChange={(event) => {
                setWeight(event.target.value);
                if (event.target.value && !weightMeasuredAt) setWeightMeasuredAt(occurredAt);
              }} />
              <span className="mt-2 block text-xs font-normal leading-5 text-muted">
                Vous pouvez utiliser la dictée du clavier de votre téléphone si elle est disponible.
              </span>
            </label>
            <label className={labelClass}>Date et heure de pesée
              <input className={inputClass} type="datetime-local" value={weightMeasuredAt} onChange={(event) => setWeightMeasuredAt(event.target.value)} disabled={!hasWeight} required={hasWeight} />
            </label>
          </div>
          <label className={labelClass}>Note du poids
            <textarea className={inputClass} name="weight_note" rows={3} maxLength={5000} defaultValue={birth.birthWeightMeasurement?.note ?? ""} disabled={!hasWeight} />
          </label>
          <label className={labelClass}>Motif de la correction
            <textarea
              className={inputClass}
              name="reason"
              rows={3}
              maxLength={500}
              defaultValue={needsCompletion ? "Complément après naissance express" : ""}
              required
            />
          </label>
          <AdjustmentMessage state={state} />
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>
            <SubmitButton idleLabel="Enregistrer la correction" pendingLabel="Correction..." />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BirthCancellationDialog({
  birth,
  action,
  onSuccess,
}: {
  birth: WhelpingBirthSummary;
  action: BirthAdjustmentAction;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const cancelledAtRef = useRef<HTMLInputElement>(null);
  const submitAction = useCallback(async (
    previousState: WhelpingBirthAdjustmentActionState,
    formData: FormData,
  ) => {
    const nextState = await action(previousState, formData);
    if (nextState.status === "success") {
      setOpen(false);
      onSuccess(nextState.message ?? "La naissance a été annulée.");
      router.refresh();
    }
    return nextState;
  }, [action, onSuccess, router]);
  const [state, formAction] = useActionState(submitAction, initialWhelpingBirthAdjustmentActionState);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="text-destructive">
          <Trash2 className="size-4" aria-hidden="true" />Annuler la naissance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Annuler la naissance n° {birth.birthOrder}</DialogTitle>
          <DialogDescription>Aucune ligne ne sera physiquement supprimée.</DialogDescription>
        </DialogHeader>
        <form action={formAction} onSubmit={() => { if (cancelledAtRef.current) cancelledAtRef.current.value = new Date().toISOString(); }} className="space-y-4">
          <input ref={cancelledAtRef} type="hidden" name="cancelled_at" />
          <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-950">
            <p>L’Animal sera retiré des données actives et son poids éventuel sera neutralisé.</p>
            <p>Les compteurs de portée seront recalculés et l’ordre libéré pourra être repris par la prochaine naissance.</p>
            <p>L’opération sera refusée si des données ultérieures existent.</p>
          </div>
          <label className={labelClass}>Motif de l’annulation
            <textarea className={inputClass} name="reason" rows={3} maxLength={500} required />
          </label>
          <AdjustmentMessage state={state} />
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Conserver</Button></DialogClose>
            <SubmitButton idleLabel="Confirmer l’annulation" pendingLabel="Annulation..." variant="destructive" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Timeline({
  session,
  events,
  births,
  birthWeightActions,
  birthAdjustmentActions,
  onWeightSuccess,
}: {
  session: WhelpingSessionSummary;
  events: WhelpingEventSummary[];
  births: WhelpingBirthSummary[];
  birthWeightActions: WhelpingBirthWeightAction[];
  birthAdjustmentActions: WhelpingBirthAdjustmentAction[];
  onWeightSuccess: (message: string) => void;
}) {
  const birthsByEventId = new Map(
    births.map((birth) => [birth.event.id, birth]),
  );
  const weightActionsByBirthId = new Map(
    birthWeightActions.map((entry) => [entry.birthId, entry.action]),
  );
  const adjustmentActionsByBirthId = new Map(
    birthAdjustmentActions.map((entry) => [entry.birthId, entry]),
  );
  const visibleEvents = events.filter((event) =>
    !isRoutineQuickCompletionEvent(event)
  );

  if (visibleEvents.length === 0) {
    return (
      <p className="mt-5 text-sm text-muted">
        Aucun événement enregistré dans cette chronologie.
      </p>
    );
  }

  return (
    <ol className="mt-5 space-y-3">
      {visibleEvents.map((event, visibleIndex) => {
        const birth = event.eventType === "birth"
          ? birthsByEventId.get(event.id)
          : undefined;
        const birthWeightAction = birth
          ? birth.cancelledAt === null
            ? weightActionsByBirthId.get(birth.id)
            : undefined
          : undefined;
        const birthAdjustmentAction = birth && birth.cancelledAt === null
          ? adjustmentActionsByBirthId.get(birth.id)
          : undefined;
        const title = event.eventType === "birth"
          ? birth
            ? birth.cancelledAt
              ? `Naissance n° ${birth.birthOrder} annulée`
              : `Naissance n° ${birth.birthOrder}`
            : "Naissance"
          : event.eventType === "session_closed"
            ? "Session clôturée"
            : event.eventType === "session_reopened"
              ? "Session rouverte"
              : event.eventType === "birth_corrected"
                ? "Naissance corrigée"
                : event.eventType === "birth_cancelled"
                  ? "Naissance annulée"
                  : eventLabels[event.eventType];

        return (
          <li key={event.id} className="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
            <div className="flex min-w-0 flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <p className="break-words font-semibold">
                  <span className="mr-2 text-sm text-muted">#{visibleIndex + 1}</span>
                  {title}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(
                    birth ? birth.occurredAt : event.occurredAt,
                    session.timezoneName,
                  )}
                </p>
              </div>
              {birth ? (
                <span className="w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold">
                  {birth.cancelledAt ? "Annulée" : viabilityLabels[birth.viability]}
                </span>
              ) : null}
            </div>
            {event.eventType === "birth" && !birth ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Détails de naissance indisponibles
              </p>
            ) : null}
            {birth ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Sexe</dt>
                  <dd className="font-medium">{sexLabels[birth.sex]}</dd>
                </div>
                <div>
                  <dt className="text-muted">Viabilité</dt>
                  <dd className="font-medium">{viabilityLabels[birth.viability]}</dd>
                </div>
                {birth.initialCollarColor ? (
                  <div>
                    <dt className="text-muted">Couleur ou collier initial</dt>
                    <dd className="break-words font-medium">{birth.initialCollarColor}</dd>
                  </div>
                ) : null}
                {birth.birthWeightMeasurement ? (
                  <div>
                    <dt className="text-muted">Poids de naissance</dt>
                    <dd className="font-medium">
                      {new Intl.NumberFormat("fr-FR").format(birth.birthWeightMeasurement.grams)} g
                      <span className="block text-xs font-normal text-muted">
                        Pesé le {formatDateTime(
                          birth.birthWeightMeasurement.measuredAt,
                          session.timezoneName,
                        )}
                      </span>
                    </dd>
                  </div>
                ) : birth.cancelledAt ? (
                  <div>
                    <dt className="text-muted">Poids de naissance</dt>
                    <dd className="text-muted">Naissance annulée</dd>
                  </div>
                ) : (
                  <div>
                    <dt className="text-muted">Poids de naissance</dt>
                    <dd>
                      <span className="text-muted">Poids de naissance non renseigné</span>
                      {birthWeightAction ? (
                        <span className="block">
                          <BirthWeightDialog
                            action={birthWeightAction}
                            birthOrder={birth.birthOrder}
                            onSuccess={onWeightSuccess}
                          />
                        </span>
                      ) : null}
                    </dd>
                  </div>
                )}
              </dl>
            ) : null}
            {(birth ? birth.note : event.note) ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
                {birth ? birth.note : event.note}
              </p>
            ) : null}
            {birth && birthAdjustmentAction ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                <BirthCorrectionDialog birth={birth} action={birthAdjustmentAction.correctAction} onSuccess={onWeightSuccess} />
                {birthAdjustmentAction.cancelAction ? (
                  <BirthCancellationDialog birth={birth} action={birthAdjustmentAction.cancelAction} onSuccess={onWeightSuccess} />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function historyText(value: string | null) {
  return value || "Non renseigné";
}

function birthAdjustmentHistoryTitle(
  entry: WhelpingBirthAdjustmentHistoryEntry,
) {
  if (entry.adjustmentType === "cancellation") return "Naissance annulée";
  if (entry.reason !== QUICK_WHELPING_COMPLETION_REASON) return "Naissance corrigée";

  const weightAdded = entry.weightChangeType === "added";
  const collarAdded = entry.beforeInitialCollarColor === null &&
    entry.afterInitialCollarColor !== null;
  if (weightAdded && collarAdded) return "Poids et collier ajoutés";
  if (weightAdded) return "Poids de naissance ajouté";
  if (collarAdded) return "Couleur du collier ajoutée";
  return "Informations de naissance complétées";
}

function BirthAdjustmentHistory({
  entries,
  loadError,
}: {
  entries: WhelpingBirthAdjustmentHistoryEntry[];
  loadError: boolean;
}) {
  return (
    <details className="mt-6 rounded-xl border px-4 py-3">
      <summary className="cursor-pointer font-semibold">Historique des compléments et rectifications</summary>
      {loadError ? (
        <p className="mt-3 text-sm text-muted">L’historique des compléments et rectifications n’est pas disponible pour le moment.</p>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Aucun complément ou rectification enregistré.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {entries.map((entry, index) => {
            const changes = [
              entry.beforeOccurredAt !== entry.afterOccurredAt ? ["Date et heure", formatDateTime(entry.beforeOccurredAt, entry.sessionTimezoneName), formatDateTime(entry.afterOccurredAt, entry.sessionTimezoneName)] : null,
              entry.beforeSex !== entry.afterSex ? ["Sexe", sexLabels[entry.beforeSex], sexLabels[entry.afterSex]] : null,
              entry.beforeViability !== entry.afterViability ? ["Viabilité", viabilityLabels[entry.beforeViability], viabilityLabels[entry.afterViability]] : null,
              entry.beforeInitialCollarColor !== entry.afterInitialCollarColor ? ["Couleur ou collier initial", historyText(entry.beforeInitialCollarColor), historyText(entry.afterInitialCollarColor)] : null,
              entry.beforeBirthNote !== entry.afterBirthNote ? ["Note de naissance", historyText(entry.beforeBirthNote), historyText(entry.afterBirthNote)] : null,
            ].filter((change): change is string[] => change !== null);
            const weightLabel = entry.weightChangeType === "added"
              ? "Poids ajouté"
              : entry.weightChangeType === "corrected"
                ? "Poids corrigé"
                : entry.weightChangeType === "removed"
                  ? "Poids retiré"
                  : entry.weightChangeType === "neutralized_on_cancellation"
                    ? "Poids neutralisé lors de l’annulation"
                    : null;
            return (
              <li key={`${entry.actionAt}-${index}`} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">{birthAdjustmentHistoryTitle(entry)}</p>
                  <time className="text-muted">{formatDateTime(entry.actionAt, entry.sessionTimezoneName)}</time>
                </div>
                <p className="mt-1 text-muted">Naissance n° {entry.birthOrder}</p>
                <p className="mt-2 whitespace-pre-wrap">Motif : {entry.reason}</p>
                {changes.length > 0 ? (
                  <dl className="mt-3 space-y-2">
                    {changes.map(([label, before, after]) => (
                      <div key={label}><dt className="font-medium">{label}</dt><dd className="text-muted">{before} → {after}</dd></div>
                    ))}
                  </dl>
                ) : null}
                {weightLabel ? (
                  <div className="mt-3">
                    <p className="font-medium">{weightLabel}</p>
                    {entry.weightChangeType === "added" ? (
                      <p className="text-muted">{entry.afterWeightGrams} g · {entry.afterWeightMeasuredAt ? formatDateTime(entry.afterWeightMeasuredAt, entry.sessionTimezoneName) : "Heure non renseignée"}{entry.afterWeightNote ? ` · ${entry.afterWeightNote}` : ""}</p>
                    ) : entry.weightChangeType === "corrected" ? (
                      <div className="space-y-1 text-muted">
                        {entry.beforeWeightGrams !== entry.afterWeightGrams ? <p>{entry.beforeWeightGrams} g → {entry.afterWeightGrams} g</p> : null}
                        {entry.beforeWeightMeasuredAt !== entry.afterWeightMeasuredAt ? <p>Heure : {entry.beforeWeightMeasuredAt ? formatDateTime(entry.beforeWeightMeasuredAt, entry.sessionTimezoneName) : "Non renseignée"} → {entry.afterWeightMeasuredAt ? formatDateTime(entry.afterWeightMeasuredAt, entry.sessionTimezoneName) : "Non renseignée"}</p> : null}
                        {entry.beforeWeightNote !== entry.afterWeightNote ? <p>Note : {historyText(entry.beforeWeightNote)} → {historyText(entry.afterWeightNote)}</p> : null}
                      </div>
                    ) : (
                      <p className="text-muted">Ancien poids actif : {entry.beforeWeightGrams} g</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}

export function WhelpingPanel({
  displayMode,
  session,
  events,
  births,
  role,
  loadError = false,
  openAction,
  eventAction,
  expressMaleBirthAction,
  expressFemaleBirthAction,
  birthAction,
  birthWeightActions,
  quickCompletionActions = [],
  birthAdjustmentActions,
  adjustmentHistory,
  adjustmentHistoryLoadError,
  closeAction,
  reopenAction,
}: {
  displayMode: "mobile" | "journal";
  session: WhelpingSessionSummary | null;
  events: WhelpingEventSummary[];
  births: WhelpingBirthSummary[];
  role: WhelpingRole;
  loadError?: boolean;
  openAction: SimpleAction | null;
  eventAction: SimpleAction | null;
  expressMaleBirthAction: BirthAction | null;
  expressFemaleBirthAction: BirthAction | null;
  birthAction: BirthAction | null;
  birthWeightActions: WhelpingBirthWeightAction[];
  quickCompletionActions?: WhelpingQuickCompletionAction[];
  birthAdjustmentActions: WhelpingBirthAdjustmentAction[];
  adjustmentHistory: WhelpingBirthAdjustmentHistoryEntry[];
  adjustmentHistoryLoadError: boolean;
  closeAction: SimpleAction | null;
  reopenAction: SimpleAction | null;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const canWrite = role === "owner" || role === "admin" || role === "member";
  const sessionIsOpen = session?.status === "open";
  const canRectifyClosedSession =
    session?.status === "closed" &&
    canWrite &&
    (birthAdjustmentActions.length > 0 || birthWeightActions.length > 0);
  const quickActionsByBirthId = new Map(
    quickCompletionActions.map((entry) => [entry.birthId, entry.action]),
  );
  const activeBirths = births.filter((birth) => birth.cancelledAt === null);
  const quickCompletionItems: WhelpingQuickCompletionItem[] = activeBirths
    .filter(
      (birth) =>
        (birth.initialCollarColor === null || birth.birthWeightMeasurement === null) &&
        quickActionsByBirthId.has(birth.id),
    )
    .map((birth) => ({
      birthOrder: birth.birthOrder,
      sex: birth.sex,
      occurredAt: birth.occurredAt,
      initialCollarColor: birth.initialCollarColor,
      birthWeightMeasurement: birth.birthWeightMeasurement
        ? {
            grams: birth.birthWeightMeasurement.grams,
            measuredAt: birth.birthWeightMeasurement.measuredAt,
          }
        : null,
      assignedColors: activeBirths
        .filter((candidate) => candidate.id !== birth.id && candidate.initialCollarColor !== null)
        .map((candidate) => ({
          birthOrder: candidate.birthOrder,
          color: candidate.initialCollarColor!,
        })),
      action: quickActionsByBirthId.get(birth.id)!,
    }));

  return (
    <section className="min-w-0 rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Mise-bas</h2>
          {loadError ? (
            <p className="mt-1 text-sm leading-6 text-muted">
              Les informations de mise-bas ne sont pas disponibles pour le moment.
            </p>
          ) : session ? (
            <div className="mt-2 space-y-1 text-sm text-muted">
              <p>
                Début : {formatDateTime(session.startedAt, session.timezoneName)}
              </p>
              {session.endedAt ? (
                <p>Fin : {formatDateTime(session.endedAt, session.timezoneName)}</p>
              ) : null}
              <p>Fuseau : {session.timezoneName}</p>
              {session.note ? (
                <p className="whitespace-pre-wrap break-words">
                  Note d’ouverture : {session.note}
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <p className="mt-1 font-medium">Aucune session démarrée</p>
              <p className="mt-1 text-sm leading-6 text-muted">
                Démarrez la session lorsque le travail commence afin de constituer une chronologie unique.
              </p>
            </>
          )}
        </div>
        {!loadError && session ? (
          <span className="w-fit shrink-0 rounded-full border px-3 py-1 text-sm font-semibold">
            {sessionIsOpen ? "En cours" : "Clôturée"}
          </span>
        ) : null}
      </div>

      {confirmation ? (
        <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {confirmation}
        </p>
      ) : null}

      {!loadError && !session && canWrite && openAction ? (
        <div className="mt-5">
          <OpenSessionDialog action={openAction} onSuccess={setConfirmation} />
        </div>
      ) : null}

      {!loadError && session ? (
        <>
          {sessionIsOpen ? (
            <div className="mt-5 rounded-xl border bg-background p-4 sm:p-5">
              <p className="text-sm text-muted">
                Naissances enregistrées
                <span className="ml-2 text-lg font-semibold text-foreground">
                  {births.filter((birth) => birth.cancelledAt === null).length}
                </span>
              </p>
              {canWrite && birthAction && eventAction ? (
                displayMode === "mobile" && expressMaleBirthAction && expressFemaleBirthAction ? (
                  <div className="mt-4 flex flex-col items-stretch gap-3">
                    <ExpressBirthActions
                      key={`express-birth-actions:${activeBirths.length}`}
                      maleAction={expressMaleBirthAction}
                      femaleAction={expressFemaleBirthAction}
                      timezoneName={session.timezoneName}
                      onSuccess={setConfirmation}
                    />
                    <WhelpingQuickCompletion
                      key={`quick-completion:${quickCompletionItems
                        .map(({ birthOrder, occurredAt, sex }) => `${birthOrder}:${occurredAt}:${sex}`)
                        .join("|")}`}
                      items={quickCompletionItems}
                      timezoneName={session.timezoneName}
                      onSuccess={setConfirmation}
                    />
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <BirthDialog
                        action={birthAction}
                        onSuccess={setConfirmation}
                        triggerLabel="Saisir tous les détails"
                        secondary
                      />
                      <EventDialog action={eventAction} onSuccess={setConfirmation} />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <BirthDialog action={birthAction} onSuccess={setConfirmation} />
                    <EventDialog action={eventAction} onSuccess={setConfirmation} />
                  </div>
                )
              ) : null}
            </div>
          ) : null}

          {canRectifyClosedSession ? (
            <p className="mt-5 rounded-xl border bg-background px-4 py-3 text-sm text-muted">
              La session est clôturée. Les informations des naissances peuvent encore être rectifiées et les poids manquants renseignés. Rouvrez la session pour ajouter une nouvelle naissance ou un nouvel événement.
            </p>
          ) : null}

          <div className="mt-6">
            <h3 className="font-semibold">Chronologie</h3>
            <Timeline
              session={session}
              events={events}
              births={births}
              birthWeightActions={birthWeightActions}
              birthAdjustmentActions={birthAdjustmentActions}
              onWeightSuccess={setConfirmation}
            />
          </div>

          <BirthAdjustmentHistory entries={adjustmentHistory} loadError={adjustmentHistoryLoadError} />

          {sessionIsOpen && canWrite && closeAction ? (
            <div className="mt-6 border-t pt-5">
              <CloseSessionDialog action={closeAction} onSuccess={setConfirmation} />
            </div>
          ) : null}

          {!sessionIsOpen && canWrite && reopenAction ? (
            <div className="mt-6 border-t pt-5">
              <ReopenSessionDialog
                action={reopenAction}
                onSuccess={setConfirmation}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
