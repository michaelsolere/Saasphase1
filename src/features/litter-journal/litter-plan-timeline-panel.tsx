"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { formatLitterDate } from "@/features/litters/formatters";

import type { LitterCareTaskActionState } from "./litter-care-tasks-actions";
import {
  ScheduleTaskDialog,
  type LitterCareTaskScheduleActionSet,
} from "./litter-care-task-schedule-dialog";
import type { LitterCareTaskScheduleView } from "./litter-care-task-schedule-view";
import { litterCareTaskCategoryLabels } from "./litter-care-task-labels";
import type { LitterPlanAdHocProgrammerActionState } from "./litter-plan-ad-hoc-programmer-actions";
import { LitterPlanAdHocProgrammerDialog } from "./litter-plan-ad-hoc-programmer-dialog";
import { LitterPlanAdHocMetadataDialog, type LitterPlanAdHocMetadataView } from "./litter-plan-ad-hoc-metadata-dialog";
import { LitterCareTaskResolutionDialog } from "./litter-care-task-resolution-dialog";
import type { LitterPlanAdHocMetadataActionState } from "./litter-plan-ad-hoc-metadata-actions";
import {
  buildLitterPlanAdHocProgrammerDisplayTimeline,
  formatLitterPlanAdHocProgrammerPreparedLine,
  litterPlanAdHocProgrammerPreviewTypeLabel,
  type LitterPlanAdHocProgrammerPreview,
} from "./litter-plan-ad-hoc-programmer";
import type {
  InteractiveLitterPlanTimeline,
} from "./litter-plan-timeline-interaction";
import {
  buildInteractiveTimelineGeometry,
  buildTimelinePreviewLiveMessage,
  civilInclusiveDurationDays,
  cumulativeDayDeltaForHandle,
  filterInteractiveLitterPlanTimeline,
  formatHandleDisplacementLabel,
  keyboardScheduleDayStep,
  pointerDeltaToCivilDays,
  previewPointMove,
  previewWindowMove,
  previewWindowResizeEnd,
  previewWindowResizeStart,
  timelineScheduleResultRequiresRefresh,
  type InteractiveTimelineGeometryItem,
  type InteractiveTimelineItem,
  type LitterPlanTimelineCategoryFilter,
  type TimelineDragHandle,
} from "./litter-plan-timeline-interaction";

type TimelineAction = (
  previousState: LitterCareTaskActionState,
  formData: FormData,
) => Promise<LitterCareTaskActionState>;

type ProgrammerAction = (
  previousState: LitterPlanAdHocProgrammerActionState,
  formData: FormData,
) => Promise<LitterPlanAdHocProgrammerActionState>;
type MetadataAction = (previousState: LitterPlanAdHocMetadataActionState, formData: FormData) => Promise<LitterPlanAdHocMetadataActionState>;
export type LitterPlanTimelineMetadataTarget = { view: LitterPlanAdHocMetadataView; action: MetadataAction };

export type LitterPlanTimelineScheduleTarget = {
  view: LitterCareTaskScheduleView;
  actions: LitterCareTaskScheduleActionSet;
};
export type LitterPlanTimelineResolutionTarget = { action: TimelineAction };

export type LitterPlanTimelinePanelProps = {
  timeline: InteractiveLitterPlanTimeline | null;
  unavailable?: boolean;
  movePointActions?: Record<string, TimelineAction>;
  moveWindowActions?: Record<string, TimelineAction>;
  scheduleTargets?: Record<string, LitterPlanTimelineScheduleTarget>;
  resolutionTargets?: Record<string, LitterPlanTimelineResolutionTarget>;
  metadataTargets?: Record<string, LitterPlanTimelineMetadataTarget>;
  programmerAction?: ProgrammerAction | null;
  programmerInstanceKey?: string | null;
  programmerBusinessDate?: string | null;
};

type DragHandle = TimelineDragHandle;

type DragState = {
  publicKey: string;
  handle: DragHandle;
  pointerId: number;
  originX: number;
  baseStart: string;
  baseEnd: string;
  previewStart: string;
  previewEnd: string;
  dayDelta: number;
};

type FeedbackState = {
  publicKey: string | null;
  kind: "preview" | "saving" | "success" | "error" | "stale";
  message: string;
  requiresRefresh?: boolean;
};

const idleActionState: LitterCareTaskActionState = { status: "idle" };

function timelinePanelState(
  timeline: InteractiveLitterPlanTimeline | null,
  unavailable: boolean,
) {
  if (unavailable) return "unavailable" as const;
  return timeline ? ("available" as const) : ("empty" as const);
}

function dateLabel(date: string | null) {
  return date ? formatLitterDate(date) : "Date non renseignée";
}

function kindLabel(kind: InteractiveTimelineItem["kind"]) {
  if (kind === "milestone") return "Jalon";
  if (kind === "window") return "Fenêtre";
  return "Tâche";
}

function StatusBadge({ item }: { item: InteractiveTimelineItem }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
      {item.statusLabel}
    </p>
  );
}

function HandleButton({
  label,
  disabled,
  cursorClass,
  onPointerDown,
  onKeyDown,
  testId,
}: {
  label: string;
  disabled: boolean;
  cursorClass: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-timeline-handle={testId}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={`absolute z-10 flex h-11 w-11 items-center justify-center touch-none disabled:cursor-not-allowed disabled:opacity-40 ${cursorClass}`}
      style={{ touchAction: "none" }}
    >
      <span
        aria-hidden="true"
        className="block h-5 w-2 rounded-sm border border-foreground/40 bg-background shadow-sm"
      />
    </button>
  );
}

export function LitterPlanTimelinePanel({
  timeline,
  unavailable = false,
  movePointActions = {},
  moveWindowActions = {},
  scheduleTargets = {},
  resolutionTargets = {},
  metadataTargets = {},
  programmerAction = null,
  programmerInstanceKey = null,
  programmerBusinessDate = null,
}: LitterPlanTimelinePanelProps) {
  const router = useRouter();
  const categoryFilterId = useId();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [keyboardPreview, setKeyboardPreview] = useState<{
    publicKey: string;
    handle: DragHandle;
    startDate: string;
    endDate: string;
    dayDelta: number;
  } | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [disabledKeys, setDisabledKeys] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [programmerPreview, setProgrammerPreview] =
    useState<LitterPlanAdHocProgrammerPreview | null>(null);
  const [programmerMessage, setProgrammerMessage] = useState<string | null>(
    null,
  );
  const [categoryFilter, setCategoryFilter] =
    useState<LitterPlanTimelineCategoryFilter>("all");
  const [includeTerminalItems, setIncludeTerminalItems] = useState(false);

  const handleProgrammerPreviewChange = useCallback(
    (preview: LitterPlanAdHocProgrammerPreview | null) => {
      setProgrammerPreview(preview);
    },
    [],
  );

  const displayTimeline = useMemo(
    () =>
      buildLitterPlanAdHocProgrammerDisplayTimeline(timeline, programmerPreview),
    [timeline, programmerPreview],
  );

  const availableCategories = useMemo(
    () =>
      displayTimeline
        ? filterInteractiveLitterPlanTimeline({
            timeline: displayTimeline,
            category: "all",
            includeTerminal: true,
          }).availableCategories
        : [],
    [displayTimeline],
  );
  const activeCategoryFilter =
    categoryFilter === "all" || availableCategories.includes(categoryFilter)
      ? categoryFilter
      : "all";

  const filteredTimeline = useMemo(
    () =>
      displayTimeline
        ? filterInteractiveLitterPlanTimeline({
            timeline: displayTimeline,
            category: activeCategoryFilter,
            includeTerminal: includeTerminalItems,
            pinnedPublicKeys: programmerPreview
              ? [programmerPreview.publicKey]
              : [],
          })
        : null,
    [
      activeCategoryFilter,
      displayTimeline,
      includeTerminalItems,
      programmerPreview,
    ],
  );

  const overrides = useMemo(() => {
    const map: Record<string, { startDate: string; endDate: string }> = {};
    if (drag) {
      map[drag.publicKey] = {
        startDate: drag.previewStart,
        endDate: drag.previewEnd,
      };
    } else if (keyboardPreview) {
      map[keyboardPreview.publicKey] = {
        startDate: keyboardPreview.startDate,
        endDate: keyboardPreview.endDate,
      };
    }
    return map;
  }, [drag, keyboardPreview]);

  const geometry = filteredTimeline
    ? buildInteractiveTimelineGeometry(filteredTimeline.timeline, overrides)
    : null;
  const visibleUndatedItems =
    geometry?.undatedItems ?? filteredTimeline?.timeline.items ?? [];
  const state = timelinePanelState(displayTimeline, unavailable);
  const showProgrammer =
    !unavailable &&
    Boolean(programmerAction && programmerInstanceKey && programmerBusinessDate);

  const activePreview = useMemo(() => {
    if (drag) {
      return {
        publicKey: drag.publicKey,
        startDate: drag.previewStart,
        endDate: drag.previewEnd,
        dayDelta: drag.dayDelta,
        handle: drag.handle,
      };
    }
    if (keyboardPreview) {
      return {
        publicKey: keyboardPreview.publicKey,
        startDate: keyboardPreview.startDate,
        endDate: keyboardPreview.endDate,
        dayDelta: keyboardPreview.dayDelta,
        handle: keyboardPreview.handle,
      };
    }
    return null;
  }, [drag, keyboardPreview]);

  const liveMessage = useMemo(() => {
    if (feedback?.kind === "saving") return "Enregistrement…";
    if (feedback?.kind === "success" || feedback?.kind === "error" || feedback?.kind === "stale") {
      return feedback.message;
    }
    if (!activePreview || !timeline) return "";
    const item = timeline.items.find(
      (entry) => entry.publicKey === activePreview.publicKey,
    );
    if (!item) return "";
    return buildTimelinePreviewLiveMessage({
      kind: item.kind,
      handle: activePreview.handle,
      currentDateLabel: dateLabel(item.retainedStartDate),
      newDateLabel: dateLabel(activePreview.startDate),
      startLabel: dateLabel(activePreview.startDate),
      endLabel: dateLabel(activePreview.endDate),
      durationDays: civilInclusiveDurationDays(
        activePreview.startDate,
        activePreview.endDate,
      ),
      dayDelta: activePreview.dayDelta,
    });
  }, [activePreview, feedback, timeline]);

  const isProgrammerPreviewItem = (item: InteractiveTimelineItem) =>
    item.statusLabel === "Aperçu — non enregistré" ||
    item.publicKey.startsWith("programmer-preview-");

  const cancelPreview = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setKeyboardPreview(null);
    setFeedback(null);
  }, []);

  const commitPreview = useCallback(
    async (
      publicKey: string,
      handle: DragHandle,
      startDate: string,
      endDate: string,
    ) => {
      const item = timeline?.items.find((entry) => entry.publicKey === publicKey);
      if (!item || disabledKeys.has(publicKey)) return;

      const unchanged =
        startDate === item.retainedStartDate &&
        endDate === item.retainedEndDate;
      if (unchanged) {
        cancelPreview();
        return;
      }

      setFeedback({
        publicKey,
        kind: "saving",
        message: "Enregistrement…",
      });
      dragRef.current = null;
      setDrag(null);
      setKeyboardPreview(null);

      startTransition(async () => {
        const formData = new FormData();
        let result: LitterCareTaskActionState = idleActionState;
        if (item.kind === "window") {
          const action = moveWindowActions[publicKey];
          if (!action) {
            setFeedback({
              publicKey,
              kind: "error",
              message: "Action indisponible.",
            });
            return;
          }
          formData.set("proposed_start_date", startDate);
          formData.set("proposed_end_date", endDate);
          result = await action(idleActionState, formData);
        } else {
          const action = movePointActions[publicKey];
          if (!action) {
            setFeedback({
              publicKey,
              kind: "error",
              message: "Action indisponible.",
            });
            return;
          }
          formData.set("proposed_date", startDate);
          result = await action(idleActionState, formData);
        }

        if (result.status === "success") {
          setDisabledKeys((previous) => new Set(previous).add(publicKey));
          setFeedback({
            publicKey,
            kind: "success",
            message: result.message ?? "Programmation modifiée",
            requiresRefresh: true,
          });
          router.refresh();
          return;
        }

        const needsRefresh = timelineScheduleResultRequiresRefresh(result);
        if (needsRefresh) {
          setDisabledKeys((previous) => new Set(previous).add(publicKey));
        }
        const stale = result.code === "stale_revision";
        setFeedback({
          publicKey,
          kind: stale ? "stale" : "error",
          message:
            result.message ??
            "La programmation ne peut pas être modifiée pour le moment.",
          requiresRefresh: needsRefresh,
        });
      });
    },
    [
      cancelPreview,
      disabledKeys,
      movePointActions,
      moveWindowActions,
      router,
      timeline,
    ],
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      const width = trackRef.current?.clientWidth ?? 0;
      if (!geometry || width <= 0) return;
      const dayDelta = pointerDeltaToCivilDays(
        geometry.domain,
        event.clientX - current.originX,
        width,
      );
      let preview: { startDate: string; endDate: string } | null = null;
      if (current.handle === "point") {
        const next = previewPointMove(current.baseStart, dayDelta);
        preview = next ? { startDate: next, endDate: next } : null;
      } else if (current.handle === "window-move") {
        preview = previewWindowMove(current.baseStart, current.baseEnd, dayDelta);
      } else if (current.handle === "window-start") {
        preview = previewWindowResizeStart(
          current.baseStart,
          current.baseEnd,
          dayDelta,
        );
      } else {
        preview = previewWindowResizeEnd(
          current.baseStart,
          current.baseEnd,
          dayDelta,
        );
      }
      if (!preview) return;
      const nextDrag: DragState = {
        ...current,
        previewStart: preview.startDate,
        previewEnd: preview.endDate,
        dayDelta:
          cumulativeDayDeltaForHandle(
            current.handle,
            current.baseStart,
            current.baseEnd,
            preview.startDate,
            preview.endDate,
          ) ?? dayDelta,
      };
      dragRef.current = nextDrag;
      setDrag(nextDrag);
      setFeedback({
        publicKey: current.publicKey,
        kind: "preview",
        message: "Aperçu — non enregistré",
      });
    };

    const onUp = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      void commitPreview(
        current.publicKey,
        current.handle,
        current.previewStart,
        current.previewEnd,
      );
    };

    const onCancel = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      cancelPreview();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelPreview();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [cancelPreview, commitPreview, drag, geometry]);

  const beginDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    item: InteractiveTimelineGeometryItem,
    handle: DragHandle,
  ) => {
    if (
      event.button !== 0 ||
      item.interactionMode === "read_only" ||
      disabledKeys.has(item.publicKey) ||
      isPending
    ) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setKeyboardPreview(null);
    const nextDrag: DragState = {
      publicKey: item.publicKey,
      handle,
      pointerId: event.pointerId,
      originX: event.clientX,
      baseStart: item.displayStartDate,
      baseEnd: item.displayEndDate,
      previewStart: item.displayStartDate,
      previewEnd: item.displayEndDate,
      dayDelta: 0,
    };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
    setFeedback({
      publicKey: item.publicKey,
      kind: "preview",
      message: "Aperçu — non enregistré",
    });
  };

  const applyKeyboardDelta = (
    item: InteractiveTimelineGeometryItem,
    handle: DragHandle,
    dayDelta: number,
  ) => {
    const baseStart =
      keyboardPreview?.publicKey === item.publicKey
        ? keyboardPreview.startDate
        : item.displayStartDate;
    const baseEnd =
      keyboardPreview?.publicKey === item.publicKey
        ? keyboardPreview.endDate
        : item.displayEndDate;
    const originStart = item.retainedStartDate ?? item.displayStartDate;
    const originEnd = item.retainedEndDate ?? item.displayEndDate;

    let preview: { startDate: string; endDate: string } | null = null;
    if (handle === "point") {
      const next = previewPointMove(baseStart, dayDelta);
      preview = next ? { startDate: next, endDate: next } : null;
    } else if (handle === "window-move") {
      preview = previewWindowMove(baseStart, baseEnd, dayDelta);
    } else if (handle === "window-start") {
      preview = previewWindowResizeStart(baseStart, baseEnd, dayDelta);
    } else {
      preview = previewWindowResizeEnd(baseStart, baseEnd, dayDelta);
    }
    if (!preview) return;

    const totalDelta =
      cumulativeDayDeltaForHandle(
        handle,
        originStart,
        originEnd,
        preview.startDate,
        preview.endDate,
      ) ?? 0;

    setDrag(null);
    setKeyboardPreview({
      publicKey: item.publicKey,
      handle,
      startDate: preview.startDate,
      endDate: preview.endDate,
      dayDelta: totalDelta,
    });
    setFeedback({
      publicKey: item.publicKey,
      kind: "preview",
      message: "Aperçu — non enregistré",
    });
  };

  const onHandleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: InteractiveTimelineGeometryItem,
    handle: DragHandle,
  ) => {
    if (item.interactionMode === "read_only" || disabledKeys.has(item.publicKey)) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelPreview();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!keyboardPreview || keyboardPreview.publicKey !== item.publicKey) {
        return;
      }
      void commitPreview(
        item.publicKey,
        handle,
        keyboardPreview.startDate,
        keyboardPreview.endDate,
      );
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      applyKeyboardDelta(
        item,
        handle,
        keyboardScheduleDayStep(event.shiftKey, direction),
      );
    }
  };

  const resolveProgrammerPreview = (item: InteractiveTimelineItem) =>
    programmerPreview && programmerPreview.publicKey === item.publicKey
      ? programmerPreview
      : null;

  const renderPoint = (item: InteractiveTimelineGeometryItem) => {
    const previewItem = isProgrammerPreviewItem(item);
    const matchedPreview = previewItem ? resolveProgrammerPreview(item) : null;
    const type = matchedPreview
      ? litterPlanAdHocProgrammerPreviewTypeLabel(matchedPreview)
      : kindLabel(item.kind);
    const symbol = item.kind === "milestone" ? "●" : "◇";
    const alignment =
      item.startPercent === 0
        ? "translate-x-0"
        : item.startPercent === 100
          ? "-translate-x-full"
          : "-translate-x-1/2";
    const interactive = !previewItem && item.interactionMode === "point_move";
    const scheduleTarget = scheduleTargets[item.publicKey];
    const resolutionTarget = resolutionTargets[item.publicKey];
    const metadataTarget = metadataTargets[item.publicKey];
    const showPrecise =
      !previewItem &&
      scheduleTarget &&
      item.readOnlyReason !== "viewer" &&
      item.readOnlyReason !== "terminal" &&
      item.readOnlyReason !== "pending_anchor" &&
      item.readOnlyReason !== "missing_task";

    return (
      <li
        key={item.publicKey}
        className={`absolute top-3 w-44 ${alignment}`}
        style={{ left: `${item.startPercent}%` }}
        aria-label={`${type} : ${item.title}`}
        data-timeline-item={item.publicKey}
        data-timeline-status={item.statusLabel}
        data-programmer-preview={previewItem ? "true" : undefined}
      >
        <span
          aria-hidden="true"
          className={`block text-center text-lg font-bold ${previewItem ? "opacity-60" : ""}`}
        >
          {symbol}
        </span>
        <div
          className={`relative mt-1 rounded border px-2 py-1.5 shadow-sm ${
            previewItem
              ? "border-dashed border-accent/50 bg-accent/5"
              : "bg-surface"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {type}
          </p>
          <p className="mt-1 text-sm font-medium">{item.title}</p>
          <p className="mt-1 text-xs text-muted">
            {dateLabel(item.displayStartDate)}
          </p>
          <StatusBadge item={item} />
          {activePreview?.publicKey === item.publicKey ? (
            <div className="mt-2 space-y-1 text-xs">
              <p>Date actuelle : {dateLabel(item.retainedStartDate)}</p>
              <p>Nouvelle date : {dateLabel(activePreview.startDate)}</p>
              <p>
                {formatHandleDisplacementLabel(
                  activePreview.handle,
                  activePreview.dayDelta,
                )}
              </p>
              <p className="font-semibold">Aperçu — non enregistré</p>
            </div>
          ) : null}
          {feedback?.publicKey === item.publicKey && feedback.kind === "saving" ? (
            <p className="mt-2 text-xs font-semibold">Enregistrement…</p>
          ) : null}
          {feedback?.publicKey === item.publicKey && feedback.kind === "success" ? (
            <p className="mt-2 text-xs font-semibold" role="status">
              {feedback.message}
            </p>
          ) : null}
          {feedback?.publicKey === item.publicKey &&
          (feedback.kind === "error" || feedback.kind === "stale") ? (
            <div className="mt-2 space-y-2" role="alert">
              <p className="text-xs">{feedback.message}</p>
              {feedback.requiresRefresh || feedback.kind === "stale" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => router.refresh()}
                >
                  Recharger le Journal
                </Button>
              ) : null}
            </div>
          ) : null}
          {interactive && !disabledKeys.has(item.publicKey) ? (
            <HandleButton
              label={`modifier la date de ${item.title}`}
              disabled={isPending}
              cursorClass="left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
              testId="point"
              onPointerDown={(event) => beginDrag(event, item, "point")}
              onKeyDown={(event) => onHandleKeyDown(event, item, "point")}
            />
          ) : null}
          {showPrecise && scheduleTarget ? (
            <div className="mt-2">
              <ScheduleTaskDialog
                key={item.publicKey}
                view={scheduleTarget.view}
                actions={scheduleTarget.actions}
                onSuccess={setScheduleMessage}
                triggerLabel="Ajuster précisément"
                domIdPrefix={item.publicKey}
              />
            </div>
          ) : null}
          {resolutionTarget ? (
            <div className="mt-2">
              <LitterCareTaskResolutionDialog
                itemTitle={item.title}
                action={resolutionTarget.action}
                triggerLabel="Traiter"
                dialogTitle="Traiter l’élément"
                domIdPrefix={`${item.publicKey}-resolution`}
                onSuccess={setScheduleMessage}
              />
            </div>
          ) : null}
          {metadataTarget ? <div className="mt-2"><LitterPlanAdHocMetadataDialog view={metadataTarget.view} action={metadataTarget.action} onSuccess={setScheduleMessage} /></div> : null}
        </div>
      </li>
    );
  };

  const renderWindow = (item: InteractiveTimelineGeometryItem) => {
    const width = Math.max(item.endPercent - item.startPercent, 1);
    const previewItem = isProgrammerPreviewItem(item);
    const matchedPreview = previewItem ? resolveProgrammerPreview(item) : null;
    const type = matchedPreview
      ? litterPlanAdHocProgrammerPreviewTypeLabel(matchedPreview)
      : "Fenêtre";
    const interactive =
      !previewItem && item.interactionMode === "window_move_and_resize";
    const scheduleTarget = scheduleTargets[item.publicKey];
    const resolutionTarget = resolutionTargets[item.publicKey];
    const metadataTarget = metadataTargets[item.publicKey];
    const showPrecise =
      !previewItem &&
      scheduleTarget &&
      item.readOnlyReason !== "viewer" &&
      item.readOnlyReason !== "terminal" &&
      item.readOnlyReason !== "pending_anchor" &&
      item.readOnlyReason !== "missing_task";
    const duration = civilInclusiveDurationDays(
      item.displayStartDate,
      item.displayEndDate,
    );
    const recurringDetails = matchedPreview?.recurringDetails ?? null;
    const preparedLine = recurringDetails
      ? formatLitterPlanAdHocProgrammerPreparedLine({
          total: recurringDetails.totalOccurrences,
          initialPrepared: recurringDetails.initialPrepared,
          horizonDays: recurringDetails.horizonDays,
        })
      : null;

    return (
      <li
        key={item.publicKey}
        className="absolute top-4 h-28"
        style={{ left: `${item.startPercent}%`, width: `${width}%` }}
        aria-label={`${type} : ${item.title}`}
        data-timeline-window
        data-timeline-item={item.publicKey}
        data-timeline-status={item.statusLabel}
        data-programmer-preview={previewItem ? "true" : undefined}
        data-start-percent={item.startPercent}
        data-end-percent={item.endPercent}
      >
        <div
          className={`absolute inset-x-0 top-7 h-3 rounded-full ${
            previewItem
              ? "border border-dashed border-accent/60 bg-accent/20"
              : "bg-accent/30"
          }`}
          aria-hidden="true"
          data-timeline-window-band
        />
        <span
          aria-hidden="true"
          className="absolute left-0 top-6 h-5 w-1 -translate-x-1/2 rounded-full bg-foreground/70"
          data-timeline-window-start
        />
        <span
          aria-hidden="true"
          className="absolute right-0 top-6 h-5 w-1 translate-x-1/2 rounded-full bg-foreground/70"
          data-timeline-window-end
        />
        <div
          className={`absolute left-0 top-12 min-w-[11rem] max-w-[16rem] rounded border px-2 py-1.5 shadow-sm ${
            previewItem
              ? "border-dashed border-accent/50 bg-accent/5"
              : "bg-surface"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {type}
          </p>
          <p className="mt-1 text-sm font-medium">{item.title}</p>
          {recurringDetails ? (
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              <li>{recurringDetails.cadenceLabel}</li>
              <li>Créneaux : {recurringDetails.slotsLabel}</li>
              <li>{recurringDetails.totalOccurrences} occurrences au total</li>
              {preparedLine ? <li>{preparedLine}</li> : null}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted">
              {dateLabel(item.displayStartDate)} → {dateLabel(item.displayEndDate)}
              {duration ? ` · ${duration} j` : ""}
            </p>
          )}
          <StatusBadge item={item} />
          {activePreview?.publicKey === item.publicKey ? (
            <div className="mt-2 space-y-1 text-xs">
              <p>
                Période actuelle : {dateLabel(item.retainedStartDate)} →{" "}
                {dateLabel(item.retainedEndDate)}
              </p>
              <p>
                Nouvelle période : {dateLabel(activePreview.startDate)} →{" "}
                {dateLabel(activePreview.endDate)}
              </p>
              <p>
                {formatHandleDisplacementLabel(
                  activePreview.handle,
                  activePreview.dayDelta,
                )}
              </p>
              <p className="font-semibold">Aperçu — non enregistré</p>
            </div>
          ) : null}
          {feedback?.publicKey === item.publicKey && feedback.kind === "saving" ? (
            <p className="mt-2 text-xs font-semibold">Enregistrement…</p>
          ) : null}
          {feedback?.publicKey === item.publicKey && feedback.kind === "success" ? (
            <p className="mt-2 text-xs font-semibold" role="status">
              {feedback.message}
            </p>
          ) : null}
          {feedback?.publicKey === item.publicKey &&
          (feedback.kind === "error" || feedback.kind === "stale") ? (
            <div className="mt-2 space-y-2" role="alert">
              <p className="text-xs">{feedback.message}</p>
              {feedback.requiresRefresh || feedback.kind === "stale" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => router.refresh()}
                >
                  Recharger le Journal
                </Button>
              ) : null}
            </div>
          ) : null}
          {showPrecise && scheduleTarget ? (
            <div className="mt-2">
              <ScheduleTaskDialog
                key={item.publicKey}
                view={scheduleTarget.view}
                actions={scheduleTarget.actions}
                onSuccess={setScheduleMessage}
                triggerLabel="Ajuster précisément"
                domIdPrefix={item.publicKey}
              />
            </div>
          ) : null}
          {resolutionTarget ? (
            <div className="mt-2">
              <LitterCareTaskResolutionDialog
                itemTitle={item.title}
                action={resolutionTarget.action}
                triggerLabel="Traiter"
                dialogTitle="Traiter l’élément"
                domIdPrefix={`${item.publicKey}-resolution`}
                onSuccess={setScheduleMessage}
              />
            </div>
          ) : null}
          {metadataTarget ? <div className="mt-2"><LitterPlanAdHocMetadataDialog view={metadataTarget.view} action={metadataTarget.action} onSuccess={setScheduleMessage} /></div> : null}
        </div>
        {interactive && !disabledKeys.has(item.publicKey) ? (
          <>
            <HandleButton
              label={`modifier le début de ${item.title}`}
              disabled={isPending}
              cursorClass="left-0 top-5 -translate-x-1/2 cursor-ew-resize"
              testId="window-start"
              onPointerDown={(event) =>
                beginDrag(event, item, "window-start")
              }
              onKeyDown={(event) =>
                onHandleKeyDown(event, item, "window-start")
              }
            />
            <HandleButton
              label={`modifier la fin de ${item.title}`}
              disabled={isPending}
              cursorClass="right-0 top-5 translate-x-1/2 cursor-ew-resize"
              testId="window-end"
              onPointerDown={(event) => beginDrag(event, item, "window-end")}
              onKeyDown={(event) => onHandleKeyDown(event, item, "window-end")}
            />
            <button
              type="button"
              aria-label={`Déplacer toute la période ${item.title}`}
              data-timeline-handle="window-move"
              disabled={isPending}
              onPointerDown={(event) => beginDrag(event, item, "window-move")}
              onKeyDown={(event) => onHandleKeyDown(event, item, "window-move")}
              className="absolute left-1/2 top-5 z-10 flex h-11 w-16 -translate-x-1/2 items-center justify-center touch-none cursor-grab disabled:cursor-not-allowed disabled:opacity-40"
              style={{ touchAction: "none" }}
            >
              <span
                aria-hidden="true"
                className="block h-2 w-10 rounded-full border border-foreground/40 bg-background"
              />
            </button>
          </>
        ) : null}
      </li>
    );
  };

  return (
    <section
      className="rounded-2xl border bg-surface p-5 sm:p-6"
      aria-labelledby="litter-plan-timeline-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 id="litter-plan-timeline-title" className="text-lg font-semibold">
          Planning de la portée
        </h2>
        {showProgrammer &&
        programmerAction &&
        programmerInstanceKey &&
        programmerBusinessDate ? (
          <LitterPlanAdHocProgrammerDialog
            key={programmerInstanceKey}
            action={programmerAction}
            instanceKey={programmerInstanceKey}
            businessDate={programmerBusinessDate}
            onPreviewChange={handleProgrammerPreviewChange}
            onSuccess={setProgrammerMessage}
          />
        ) : null}
      </div>
      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>
      {scheduleMessage ? (
        <p role="status" className="mt-2 text-sm">
          {scheduleMessage}
        </p>
      ) : null}
      {programmerMessage ? (
        <p role="status" className="mt-2 whitespace-pre-line text-sm">
          {programmerMessage}
        </p>
      ) : null}
      {state === "unavailable" ? (
        <p className="mt-2 text-sm text-muted">
          Planning momentanément indisponible
        </p>
      ) : state === "available" && displayTimeline ? (
        <>
          <p className="mt-1 text-sm text-muted">{displayTimeline.title}</p>
          {filteredTimeline ? (
            <div
              className="mt-4 flex flex-col gap-4 rounded-lg border bg-background/40 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between"
              data-timeline-filters
            >
              <div className="min-w-0 w-full sm:w-auto">
                <label
                  htmlFor={categoryFilterId}
                  className="mb-1 block text-sm font-medium"
                >
                  Catégorie
                </label>
                <select
                  id={categoryFilterId}
                  value={activeCategoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(
                      event.target.value as LitterPlanTimelineCategoryFilter,
                    )
                  }
                  className="h-10 w-full max-w-full rounded-md border bg-background px-3 text-sm sm:w-64"
                >
                  <option value="all">Toutes les catégories</option>
                  {filteredTimeline.availableCategories.map((category) => (
                    <option key={category} value={category}>
                      {litterCareTaskCategoryLabels[category]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeTerminalItems}
                  onChange={(event) =>
                    setIncludeTerminalItems(event.target.checked)
                  }
                  className="h-4 w-4 shrink-0 accent-current"
                />
                <span>Inclure les éléments traités</span>
              </label>
              <p
                className="text-sm text-muted"
                role="status"
                aria-live="polite"
                aria-atomic="true"
                data-timeline-filter-count
              >
                {filteredTimeline.visibleCount} éléments affichés sur{" "}
                {filteredTimeline.totalCount}
              </p>
            </div>
          ) : null}
          <div className="mt-5 space-y-5">
            {filteredTimeline &&
            filteredTimeline.totalCount > 0 &&
            filteredTimeline.visibleCount === 0 ? (
              <div
                className="rounded-lg border border-dashed p-4"
                data-timeline-filter-empty
              >
                <p className="text-sm font-medium">
                  Aucun élément ne correspond aux filtres actuels.
                </p>
                <p className="mt-1 text-sm text-muted">
                  Aucune donnée n’a été modifiée. Vous pouvez revenir à toutes
                  les catégories ou inclure les éléments traités.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeCategoryFilter !== "all" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCategoryFilter("all")}
                    >
                      Voir toutes les catégories
                    </Button>
                  ) : null}
                  {!includeTerminalItems ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setIncludeTerminalItems(true)}
                    >
                      Inclure les éléments traités
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : geometry ? (
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[48rem]" ref={trackRef}>
                  <div
                    className="relative h-12 border-b"
                    aria-label={`Axe du ${dateLabel(geometry.domain.startsOn)} au ${dateLabel(geometry.domain.endsOn)}`}
                  >
                    {geometry.ticks.map((tick) => (
                      <div
                        key={tick.date}
                        className="absolute top-0 h-full -translate-x-1/2 border-l"
                        style={{ left: `${tick.percent}%` }}
                      >
                        <span className="absolute top-5 w-28 -translate-x-1/2 text-center text-xs text-muted">
                          {dateLabel(tick.date)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 space-y-5">
                    {geometry.categories.map((category) => (
                      <section key={category.category}>
                        <h3 className="text-sm font-semibold">
                          {litterCareTaskCategoryLabels[category.category]}
                        </h3>
                        <div className="mt-3 h-40 overflow-hidden border-t border-dashed">
                          <ol className="relative h-full">
                            {category.items.map((item) =>
                              item.kind === "window"
                                ? renderWindow(item)
                                : renderPoint(item),
                            )}
                          </ol>
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Aucune date exploitable n’est disponible pour tracer ce
                planning.
              </p>
            )}
            {visibleUndatedItems.length ? (
              <section className="rounded-lg border border-dashed p-4">
                <h3 className="text-sm font-semibold">
                  Éléments sans date exploitable
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {visibleUndatedItems.map((item) => (
                    <li key={item.publicKey}>
                      {kindLabel(item.kind)} · {item.title}
                      {item.readOnlyReason === "missing_task"
                        ? " · Programmation indisponible"
                        : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {filteredTimeline &&
            filteredTimeline.timeline.pendingAnchorItems.length > 0 ? (
              <section className="rounded-lg border border-dashed p-4">
                <h3 className="text-sm font-semibold">
                  En attente d’une date de référence
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {filteredTimeline.timeline.pendingAnchorItems.map((item) => (
                    <li key={item.publicKey}>
                      <span className="font-medium">
                        {kindLabel(item.kind)}
                      </span>{" "}
                      · {item.title}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Aucun planning n’a encore été appliqué à cette portée.
        </p>
      )}
    </section>
  );
}
