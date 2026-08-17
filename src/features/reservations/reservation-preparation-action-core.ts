import {
  buildReservationPreparation,
  buildReservationPreparationKey,
  type ReservationPreparationInput,
} from "@/features/reservations/reservation-preparation-model";

export type ReservationPreparationActionState =
  | { status: "idle" }
  | { status: "confirmation_required" }
  | { status: "invalid_input" }
  | { status: "forbidden" }
  | { status: "conflict" }
  | { status: "not_ready"; errorCode: string }
  | {
      status: "sent";
      deliveryStatus: "success" | "already_sent";
      attemptId?: string;
    }
  | { status: "in_progress"; attemptId?: string }
  | { status: "uncertain"; attemptId?: string; errorCode?: string }
  | { status: "error"; errorCode: string; compensated: boolean };

export const initialReservationPreparationActionState = {
  status: "idle",
} satisfies ReservationPreparationActionState;

type DeliveryResult = {
  status: string;
  deliveryState: "sent" | "not_sent" | "in_progress" | "uncertain";
  attemptId?: string;
  errorCode?: string;
  compensated?: boolean;
};

export type ReservationPreparationActionDependencies = {
  loadPreparation: (
    reservationId: string,
  ) => Promise<ReservationPreparationInput | null>;
  send: (input: {
    reservationId: string;
    litterId: string;
  }) => Promise<DeliveryResult>;
  revalidate: (path: string) => void;
};

function isUuid(value: FormDataEntryValue | null): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

export async function confirmReservationPreparationActionCore(
  _previousState: ReservationPreparationActionState,
  formData: FormData,
  dependencies: ReservationPreparationActionDependencies,
): Promise<ReservationPreparationActionState> {
  const reservationId = formData.get("reservation_id");
  const litterId = formData.get("litter_id");
  const expectedKey = formData.get("expected_preparation_key");
  if (
    !isUuid(reservationId) ||
    !isUuid(litterId) ||
    typeof expectedKey !== "string" ||
    expectedKey.length === 0 ||
    expectedKey.length > 32_000
  ) {
    return { status: "invalid_input" };
  }
  if (formData.get("final_confirmation") !== "confirmed") {
    return { status: "confirmation_required" };
  }

  const current = await dependencies.loadPreparation(reservationId);
  if (!current || current.litterId !== litterId) {
    return { status: "not_ready", errorCode: "reservation_not_found" };
  }
  if (current.role !== "owner" && current.role !== "admin") {
    return { status: "forbidden" };
  }
  if (buildReservationPreparationKey(current) !== expectedKey) {
    return { status: "conflict" };
  }
  const preparation = buildReservationPreparation(current);
  if (!preparation.canConfirm) {
    return {
      status: "not_ready",
      errorCode: preparation.blockers[0]?.code ?? "not_ready",
    };
  }

  const delivered = await dependencies.send({ reservationId, litterId });
  if (delivered.status === "success" || delivered.status === "already_sent") {
    dependencies.revalidate("/reservations");
    dependencies.revalidate(`/reservations/${reservationId}`);
    dependencies.revalidate(`/reservations/${reservationId}/preparer`);
    return {
      status: "sent",
      deliveryStatus: delivered.status,
      ...(delivered.attemptId ? { attemptId: delivered.attemptId } : {}),
    };
  }
  if (delivered.deliveryState === "in_progress") {
    return {
      status: "in_progress",
      ...(delivered.attemptId ? { attemptId: delivered.attemptId } : {}),
    };
  }
  if (delivered.deliveryState === "uncertain") {
    return {
      status: "uncertain",
      ...(delivered.attemptId ? { attemptId: delivered.attemptId } : {}),
      ...(delivered.errorCode ? { errorCode: delivered.errorCode } : {}),
    };
  }
  return {
    status: "error",
    errorCode: delivered.errorCode ?? delivered.status,
    compensated: delivered.compensated ?? false,
  };
}
