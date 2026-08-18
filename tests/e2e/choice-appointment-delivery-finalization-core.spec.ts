import { expect, test } from "@playwright/test";

import { finalizeChoiceAppointmentDelivery } from "@/features/communications/choice-appointment-delivery-finalization-core";

function client(options?: {
  eventErrorCode?: string;
  currentAttemptId?: string;
  planUpdateMissing?: boolean;
}) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const events: Array<Record<string, unknown>> = [];
  let slotAttemptId: string | null = options?.currentAttemptId ?? null;
  function from(table: string) {
    let updateValues: Record<string, unknown> | null = null;
    const builder = {
      select: () => builder,
      update: (values: Record<string, unknown>) => {
        updateValues = values;
        updates.push({ table, values });
        if (
          table === "choice_appointment_slots" &&
          typeof values.invitation_delivery_attempt_id === "string"
        ) {
          slotAttemptId = values.invitation_delivery_attempt_id;
        }
        return builder;
      },
      insert: async (values: Record<string, unknown>) => {
        events.push(values);
        if (table === "choice_appointment_events" && options?.eventErrorCode) {
          return { data: null, error: { code: options.eventErrorCode } };
        }
        if (table === "choice_appointment_events" && events.length > 1) {
          return { data: null, error: { code: "23505" } };
        }
        return { data: null, error: null };
      },
      eq: () => builder,
      is: () => builder,
      in: () => builder,
      maybeSingle: async () => ({
        data: table === "choice_appointment_accesses"
          ? { id: "access-1" }
          : table === "choice_appointment_plans"
            ? updateValues && options?.planUpdateMissing
              ? null
              : { id: "plan-1", sent_at: null, status: "sent" }
            : table === "choice_appointment_slots"
              ? updateValues
                ? { id: "slot-1", invitation_delivery_attempt_id: slotAttemptId }
                : {
                    invitation_delivery_attempt_id: slotAttemptId,
                    reminder_delivery_attempt_id: null,
                  }
              : null,
        error: null,
      }),
      then: (
        resolve: (value: { data: null; error: null }) => unknown,
      ) => resolve({ data: null, error: null }),
    };
    void updateValues;
    return builder;
  }
  return { value: { from } as never, updates, events };
}

const input = {
  kind: "invitation" as const,
  attemptId: "10000000-0000-4000-8000-000000000099",
  sentAt: "2026-09-01T10:00:00.000Z",
  organizationId: "20000000-0000-4000-8000-000000000001",
  planId: "30000000-0000-4000-8000-000000000001",
  slotId: "40000000-0000-4000-8000-000000000001",
  reservationId: "50000000-0000-4000-8000-000000000001",
};

test("finalization is replayable after Brevo success and keeps the same J+3 evidence", async () => {
  const mock = client();
  expect(await finalizeChoiceAppointmentDelivery(input, mock.value)).toEqual({ ok: true });
  expect(await finalizeChoiceAppointmentDelivery(input, mock.value)).toEqual({ ok: true });

  const slotUpdates = mock.updates.filter((entry) => entry.table === "choice_appointment_slots");
  expect(slotUpdates).toHaveLength(1);
  expect(slotUpdates[0]?.values).toMatchObject({
    invitation_delivery_attempt_id: input.attemptId,
    invitation_sent_at: input.sentAt,
    reminder_due_at: "2026-09-04T10:00:00.000Z",
  });
  expect(mock.events).toHaveLength(2);
  expect(mock.events.every((event) => event.client_command_id === input.attemptId)).toBe(true);
});

test("finalization stays uncertain when the durable event cannot be recorded", async () => {
  const mock = client({ eventErrorCode: "42501" });
  expect(await finalizeChoiceAppointmentDelivery(input, mock.value)).toEqual({
    ok: false,
    errorCode: "invitation_event_finalize_failed",
  });
});

test("finalization refuses to overwrite another durable delivery attempt", async () => {
  const mock = client({
    currentAttemptId: "90000000-0000-4000-8000-000000000009",
  });
  expect(await finalizeChoiceAppointmentDelivery(input, mock.value)).toEqual({
    ok: false,
    errorCode: "invitation_attempt_conflict",
  });
  expect(mock.updates).toHaveLength(0);
  expect(mock.events).toHaveLength(0);
});

test("finalization refuses a plan cancelled during the provider call", async () => {
  const mock = client({ planUpdateMissing: true });
  expect(await finalizeChoiceAppointmentDelivery(input, mock.value)).toEqual({
    ok: false,
    errorCode: "choice_plan_finalize_failed",
  });
  expect(mock.events).toHaveLength(0);
});
