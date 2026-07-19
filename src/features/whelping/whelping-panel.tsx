"use client";

import { Baby, Clock3, Plus } from "lucide-react";
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
  type WhelpingActionState,
  type WhelpingBirthActionState,
} from "./whelping-actions-core";
import type {
  GenericWhelpingEventType,
  WhelpingBirthSex,
  WhelpingBirthSummary,
  WhelpingBirthViability,
  WhelpingEventSummary,
  WhelpingSessionSummary,
} from "./whelping-core";

type SimpleAction = (
  previousState: WhelpingActionState,
  formData: FormData,
) => Promise<WhelpingActionState>;

type BirthAction = (
  previousState: WhelpingBirthActionState,
  formData: FormData,
) => Promise<WhelpingBirthActionState>;

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
  unknown: "À confirmer",
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

function BirthDialog({
  action,
  onSuccess,
}: {
  action: BirthAction;
  onSuccess: (message: string) => void;
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
          className="min-h-14 w-full text-sm font-bold tracking-wide sm:w-auto sm:text-base"
        >
          <Baby aria-hidden="true" />
          + ENREGISTRER UNE NAISSANCE
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
            Cette clôture est irréversible. Aucune réouverture n’est disponible dans l’état actuel du produit.
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

function Timeline({
  session,
  events,
  births,
}: {
  session: WhelpingSessionSummary;
  events: WhelpingEventSummary[];
  births: WhelpingBirthSummary[];
}) {
  const birthsByEventId = new Map(
    births.map((birth) => [birth.event.id, birth]),
  );

  if (events.length === 0) {
    return (
      <p className="mt-5 text-sm text-muted">
        Aucun événement enregistré dans cette chronologie.
      </p>
    );
  }

  return (
    <ol className="mt-5 space-y-3">
      {events.map((event) => {
        const birth = event.eventType === "birth"
          ? birthsByEventId.get(event.id)
          : undefined;
        const title = event.eventType === "birth"
          ? birth
            ? `Naissance n° ${birth.birthOrder}`
            : "Naissance"
          : event.eventType === "session_closed"
            ? "Mise-bas clôturée"
            : eventLabels[event.eventType];

        return (
          <li key={event.id} className="min-w-0 rounded-xl border bg-background p-4 sm:p-5">
            <div className="flex min-w-0 flex-col justify-between gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <p className="break-words font-semibold">
                  <span className="mr-2 text-sm text-muted">#{event.sequenceNo}</span>
                  {title}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {formatDateTime(event.occurredAt, session.timezoneName)}
                </p>
              </div>
              {birth ? (
                <span className="w-fit shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold">
                  {viabilityLabels[birth.viability]}
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
                ) : null}
              </dl>
            ) : null}
            {event.note ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted">
                {event.note}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function WhelpingPanel({
  session,
  events,
  births,
  role,
  loadError = false,
  openAction,
  eventAction,
  birthAction,
  closeAction,
}: {
  session: WhelpingSessionSummary | null;
  events: WhelpingEventSummary[];
  births: WhelpingBirthSummary[];
  role: WhelpingRole;
  loadError?: boolean;
  openAction: SimpleAction | null;
  eventAction: SimpleAction | null;
  birthAction: BirthAction | null;
  closeAction: SimpleAction | null;
}) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const canWrite = role === "owner" || role === "admin" || role === "member";
  const sessionIsOpen = session?.status === "open";

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
                <span className="ml-2 text-lg font-semibold text-foreground">{births.length}</span>
              </p>
              {canWrite && birthAction && eventAction ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <BirthDialog action={birthAction} onSuccess={setConfirmation} />
                  <EventDialog action={eventAction} onSuccess={setConfirmation} />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6">
            <h3 className="font-semibold">Chronologie</h3>
            <Timeline session={session} events={events} births={births} />
          </div>

          {sessionIsOpen && canWrite && closeAction ? (
            <div className="mt-6 border-t pt-5">
              <CloseSessionDialog action={closeAction} onSuccess={setConfirmation} />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
