"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import type { LitterPlanningModelEditorActionState } from "@/features/settings/litter-planning-models-actions";

const initialState: LitterPlanningModelEditorActionState = { status: "idle" };

export type LitterPlanningModelDuplicateAction = (
  previousState: LitterPlanningModelEditorActionState,
  formData: FormData,
) => Promise<LitterPlanningModelEditorActionState>;

function DuplicateSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Duplication..." : "Créer une copie personnalisée"}
    </Button>
  );
}

export function LitterPlanningModelDuplicateButton({
  action,
}: {
  action: LitterPlanningModelDuplicateAction;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const submitAction = useCallback(
    async (
      previousState: LitterPlanningModelEditorActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success" && nextState.modelId) {
        startTransition(() => {
          router.push(
            `/settings/litter-planning-models/${nextState.modelId}/edit`,
          );
          router.refresh();
        });
      }
      return nextState;
    },
    [action, router],
  );
  const [state, formAction] = useActionState(submitAction, initialState);

  return (
    <div className="space-y-2">
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm">
          {state.message}
        </p>
      ) : null}
      <form action={formAction}>
        <DuplicateSubmitButton />
      </form>
    </div>
  );
}
