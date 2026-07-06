export type JourneyStepState =
  | "done"
  | "in_progress"
  | "upcoming"
  | "needs_check"
  | "unknown";

export type JourneyStep = {
  label: string;
  state: JourneyStepState;
  detail: string;
  stateLabel?: string;
};

const journeyStepStateLabels: Record<JourneyStepState, string> = {
  done: "Fait",
  in_progress: "En cours",
  upcoming: "À venir",
  needs_check: "À vérifier",
  unknown: "Non renseigné",
};

const journeyStepStateClassNames: Record<JourneyStepState, string> = {
  done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700",
  upcoming: "border-border bg-surface text-muted",
  needs_check: "border-amber-200 bg-amber-50 text-amber-700",
  unknown: "border-border bg-background text-muted",
};

const journeyStepMarkerClassNames: Record<JourneyStepState, string> = {
  done: "border-emerald-500 bg-emerald-500",
  in_progress: "border-amber-500 bg-amber-500",
  upcoming: "border-border bg-background",
  needs_check: "border-amber-500 bg-background",
  unknown: "border-border bg-background",
};

const journeyStepConnectorClassNames: Record<JourneyStepState, string> = {
  done: "bg-emerald-300",
  in_progress: "bg-amber-300",
  upcoming: "bg-border",
  needs_check: "bg-amber-300",
  unknown: "bg-border",
};

export function JourneyTimeline({
  badge = "Indicatif",
  description,
  footer,
  steps,
  title,
  titleId,
}: {
  badge?: string;
  description: string;
  footer?: string;
  steps: JourneyStep[];
  title: string;
  titleId: string;
}) {
  return (
    <section
      aria-labelledby={titleId}
      className="mt-6 rounded-2xl border bg-surface p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-muted">
            {description}
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border bg-background px-3 py-1 text-xs font-semibold text-muted">
          {badge}
        </span>
      </div>

      <ol className="mt-5 space-y-0 md:flex md:items-start md:gap-0 md:space-y-0">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className="relative grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0 md:flex md:flex-1 md:grid-cols-none md:flex-col md:gap-x-0 md:pb-0"
          >
            <div className="relative flex justify-center md:w-full md:items-center">
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 top-0 h-3.5 w-px -translate-x-1/2 md:left-0 md:top-1/2 md:h-0.5 md:w-1/2 md:translate-x-0 md:-translate-y-1/2 ${journeyStepConnectorClassNames[steps[index - 1].state]}`}
                />
              ) : null}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-1/2 top-3.5 h-[calc(100%-0.875rem)] w-px -translate-x-1/2 md:left-1/2 md:top-1/2 md:h-0.5 md:w-1/2 md:translate-x-0 md:-translate-y-1/2 ${journeyStepConnectorClassNames[step.state]}`}
                />
              ) : null}
              <span
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold shadow-sm ${journeyStepMarkerClassNames[step.state]}`}
                aria-hidden="true"
              >
                {step.state === "done" ? (
                  <span className="text-white">✓</span>
                ) : step.state === "in_progress" ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-white" />
                ) : step.state === "needs_check" ? (
                  <span className="text-amber-700">!</span>
                ) : (
                  <span className="text-muted">{index + 1}</span>
                )}
              </span>
            </div>

            <div className="min-w-0 md:mt-3 md:px-2 md:text-center">
              <h3 className="text-sm font-semibold leading-5 text-foreground md:min-h-10">
                {step.label}
              </h3>
              <span
                className={`mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${journeyStepStateClassNames[step.state]}`}
              >
                {step.stateLabel ?? journeyStepStateLabels[step.state]}
              </span>
              <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted md:mx-auto md:max-w-[10rem]">
                {step.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {footer ? (
        <p className="mt-5 border-t pt-4 text-xs leading-5 text-muted">
          {footer}
        </p>
      ) : null}
    </section>
  );
}
