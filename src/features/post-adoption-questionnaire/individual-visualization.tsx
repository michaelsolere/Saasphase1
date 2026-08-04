import type {
  PostAdoptionAxisMilestoneValue,
  PostAdoptionIndividualAxis,
  PostAdoptionIndividualVisualization as VisualizationModel,
  PostAdoptionMilestone,
} from "./individual-visualization-model";

const SVG_WIDTH = 760;
const SVG_HEIGHT = 82;
const PLOT_LEFT = 28;
const PLOT_RIGHT = 732;
const PLOT_Y = 36;

function formatRevisionDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function markerPosition(axis: PostAdoptionIndividualAxis, value: PostAdoptionAxisMilestoneValue | null) {
  if (value?.state !== "answered" || value.position === null) return null;
  if (axis.categories.length <= 1) return (PLOT_LEFT + PLOT_RIGHT) / 2;
  return PLOT_LEFT + (value.position / (axis.categories.length - 1)) * (PLOT_RIGHT - PLOT_LEFT);
}

function OrderedBand({ axis }: { axis: PostAdoptionIndividualAxis }) {
  const t1X = markerPosition(axis, axis.t1);
  const t2X = markerPosition(axis, axis.t2);
  const description = [
    axis.t1 ? `T1 : ${axis.t1.label}` : "T1 indisponible",
    axis.t2 ? `T2 : ${axis.t2.label}` : "T2 indisponible",
  ].join(". ");

  return (
    <>
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`${axis.label}. ${description}`}
        className="block h-auto max-w-full"
        data-testid={`post-adoption-axis-${axis.axis}`}
      >
        <title>{axis.label}</title>
        <desc>{description}. Les positions correspondent à des catégories ordonnées, sans distance mesurée.</desc>
        <line
          x1={PLOT_LEFT}
          x2={PLOT_RIGHT}
          y1={PLOT_Y}
          y2={PLOT_Y}
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {axis.categories.map((category) => {
          const x = markerPosition(axis, {
            state: "answered",
            value: category.value,
            label: category.label,
            position: category.position,
          });
          return x === null ? null : (
            <g key={category.value}>
              <line
                x1={x}
                x2={x}
                y1={PLOT_Y - 7}
                y2={PLOT_Y + 7}
                stroke="currentColor"
                strokeOpacity="0.5"
                vectorEffect="non-scaling-stroke"
              />
              <text x={x} y={PLOT_Y + 30} textAnchor="middle" fontSize="12" fill="currentColor">
                {category.position + 1}
              </text>
            </g>
          );
        })}
        {axis.connect && t1X !== null && t2X !== null ? (
          <line
            x1={t1X}
            x2={t2X}
            y1={PLOT_Y}
            y2={PLOT_Y}
            stroke="#64748b"
            strokeWidth="4"
            strokeLinecap="round"
            strokeOpacity="0.65"
            vectorEffect="non-scaling-stroke"
            data-axis-connection="true"
          />
        ) : null}
        {t1X !== null ? (
          <circle
            cx={t1X}
            cy={PLOT_Y}
            r="9"
            fill="white"
            stroke="#0f766e"
            strokeWidth="4"
            vectorEffect="non-scaling-stroke"
            data-milestone-marker="t1"
          >
            <title>T1 — {axis.t1?.label}</title>
          </circle>
        ) : null}
        {t2X !== null ? (
          <rect
            x={t2X - 8}
            y={PLOT_Y - 8}
            width="16"
            height="16"
            rx="2"
            fill="white"
            stroke="#7c3aed"
            strokeWidth="4"
            vectorEffect="non-scaling-stroke"
            data-milestone-marker="t2"
          >
            <title>T2 — {axis.t2?.label}</title>
          </rect>
        ) : null}
      </svg>
      <ol
        className="mt-2 grid gap-2 text-xs leading-5 text-muted"
        style={{ gridTemplateColumns: `repeat(${Math.min(axis.categories.length, 3)}, minmax(0, 1fr))` }}
        aria-label={`Catégories ordonnées pour ${axis.label}`}
      >
        {axis.categories.map((category) => (
          <li key={category.value} className="break-words">
            <span className="font-semibold text-foreground">{category.position + 1}.</span>{" "}
            {category.label}
          </li>
        ))}
      </ol>
    </>
  );
}

function MilestoneValue({
  milestone,
  value,
}: {
  milestone: PostAdoptionMilestone;
  value: PostAdoptionAxisMilestoneValue | null;
}) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-sm">
      <dt className="font-semibold text-foreground">{milestone.toUpperCase()}</dt>
      <dd className="mt-1 text-muted">
        {value ? value.label : "Jalon non disponible"}
      </dd>
    </div>
  );
}

function AxisCard({ axis }: { axis: PostAdoptionIndividualAxis }) {
  return (
    <article className="rounded-xl border bg-surface p-4" data-axis={axis.axis}>
      <h4 className="text-sm font-semibold text-foreground">{axis.label}</h4>
      {axis.kind === "ordered" && axis.categories.length > 0 ? (
        <div className="mt-3 min-w-0 overflow-x-auto">
          <div className="min-w-[32rem]">
            <OrderedBand axis={axis} />
          </div>
        </div>
      ) : axis.kind === "ordered" ? (
        <p className="mt-2 text-xs leading-5 text-muted">
          Cette bande ne peut pas être construite avec la définition disponible. Les états T1 et T2 restent détaillés ci-dessous.
        </p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted">
          Catégories descriptives sans ordre ni position commune.
        </p>
      )}
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <MilestoneValue milestone="t1" value={axis.t1} />
        <MilestoneValue milestone="t2" value={axis.t2} />
      </dl>
    </article>
  );
}

function RevisionCard({
  milestone,
  revision,
}: {
  milestone: PostAdoptionMilestone;
  revision: VisualizationModel["revisions"][PostAdoptionMilestone];
}) {
  return (
    <div className="rounded-xl border bg-background p-3 text-sm">
      <dt className="font-semibold text-foreground">
        {milestone.toUpperCase()}
        {revision ? ` · révision n° ${revision.revisionNo}` : " · non disponible"}
      </dt>
      <dd className="mt-1 text-muted">
        {revision
          ? `${revision.questionnaireCode} · définition V${revision.questionnaireVersion} · ${formatRevisionDate(revision.submittedAt)}`
          : "Aucune révision familiale reçue."}
      </dd>
    </div>
  );
}

export function PostAdoptionIndividualVisualization({
  model,
}: {
  model: VisualizationModel;
}) {
  const hasRevision = Boolean(model.revisions.t1 || model.revisions.t2);
  if (!hasRevision) {
    return (
      <section className="rounded-2xl border bg-background p-5" aria-labelledby="post-adoption-visualization-title">
        <h3 id="post-adoption-visualization-title" className="font-semibold text-foreground">
          Évolution individuelle de {model.animalName}
        </h3>
        <p className="mt-2 text-sm text-muted">
          Aucune révision familiale n’est encore disponible pour construire cette photographie descriptive.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border bg-background p-5"
      aria-labelledby="post-adoption-visualization-title"
      data-testid="post-adoption-individual-visualization"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Photographie descriptive T1/T2</p>
        <h3 id="post-adoption-visualization-title" className="mt-1 text-lg font-semibold text-foreground">
          Évolution individuelle de {model.animalName}
        </h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          Cette représentation utilise les dernières révisions familiales reçues. Elle ne calcule aucun score et ne fournit aucune interprétation médicale, éducative ou comportementale. L’espacement entre deux catégories ne mesure pas l’intensité d’une évolution.
        </p>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <RevisionCard milestone="t1" revision={model.revisions.t1} />
        <RevisionCard milestone="t2" revision={model.revisions.t2} />
      </dl>

      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        {model.revisions.t1 ? (
          <a href="#post-adoption-responses-t1" className="font-semibold text-accent underline underline-offset-4">
            Lire les réponses complètes T1
          </a>
        ) : null}
        {model.revisions.t2 ? (
          <a href="#post-adoption-responses-t2" className="font-semibold text-accent underline underline-offset-4">
            Lire les réponses complètes T2
          </a>
        ) : null}
      </div>

      <div className="mt-6 space-y-4">
        {model.axes.map((axis) => (
          <AxisCard key={axis.axis} axis={axis} />
        ))}
      </div>
    </section>
  );
}
