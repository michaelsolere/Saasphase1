"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";

import { upsertReservationAppointment } from "@/features/reservations/actions";

export type ReservationAppointmentFormValues = {
  eventId: string | null;
  kind: "puppy_choice" | "adoption";
  plannedAt: string | null;
  actualAt: string | null;
  status: "planned" | "done" | "postponed";
  description: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? "Enregistrement..." : "Enregistrer"}
    </button>
  );
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

export function ReservationAppointmentForm({
  reservationId,
  appointment,
}: {
  reservationId: string;
  appointment: ReservationAppointmentFormValues;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await upsertReservationAppointment(formData);
      }}
      className="mt-6 space-y-4"
    >
      <input type="hidden" name="reservation_id" value={reservationId} />
      <input type="hidden" name="appointment_kind" value={appointment.kind} />
      {appointment.eventId ? (
        <input type="hidden" name="event_id" value={appointment.eventId} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor={`${appointment.kind}-planned-at`}
            className="text-sm font-semibold text-foreground"
          >
            Créneau proposé
          </label>
          <input
            id={`${appointment.kind}-planned-at`}
            name="planned_at"
            type="datetime-local"
            min="1970-01-01T00:00"
            step="300"
            defaultValue={toDateTimeLocalValue(appointment.plannedAt)}
            className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent"
          />
        </div>

        <div>
          <label
            htmlFor={`${appointment.kind}-actual-at`}
            className="text-sm font-semibold text-foreground"
          >
            Date de validation adoptant
          </label>
          <input
            id={`${appointment.kind}-actual-at`}
            name="actual_at"
            type="datetime-local"
            min="1970-01-01T00:00"
            step="300"
            defaultValue={toDateTimeLocalValue(appointment.actualAt)}
            className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor={`${appointment.kind}-status`}
          className="text-sm font-semibold text-foreground"
        >
          Validation adoptant
        </label>
        <select
          id={`${appointment.kind}-status`}
          name="status"
          defaultValue={appointment.status}
          className="mt-2 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-accent"
        >
          <option value="planned">Proposé</option>
          <option value="done">Validé par l’adoptant</option>
          <option value="postponed">À modifier</option>
        </select>
      </div>

      <div>
        <label
          htmlFor={`${appointment.kind}-description`}
          className="text-sm font-semibold text-foreground"
        >
          Commentaire court
        </label>
        <textarea
          id={`${appointment.kind}-description`}
          name="description"
          maxLength={500}
          rows={3}
          defaultValue={appointment.description ?? ""}
          placeholder="Précision utile sur le rendez-vous..."
          className="mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm leading-6 outline-none transition focus:border-accent"
        />
      </div>

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
