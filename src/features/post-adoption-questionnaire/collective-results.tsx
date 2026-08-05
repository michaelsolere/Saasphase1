"use client";

import Link from "next/link";
import { useId, useState, type KeyboardEvent } from "react";

import type {
  PostAdoptionCollectiveAnimal,
  PostAdoptionCollectiveAxis,
  PostAdoptionCollectiveResults,
  PostAdoptionCollectiveState,
} from "./collective-results-model";
import type { PostAdoptionMilestone } from "./compatibility";

const colors = ["#365f78", "#67849a", "#8b7d69", "#6f8572", "#8c6f78", "#72728d"];

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function Names({
  animals,
  prefix = true,
}: {
  animals: PostAdoptionCollectiveAnimal[];
  prefix?: boolean;
}) {
  if (animals.length === 0) return null;
  return (
    <span>
      {prefix ? <>Chiots :{" "}</> : null}
      {animals.map((animal, index) => (
        <span key={animal.animalId}>
          {index > 0 ? ", " : null}
          <Link
            href={`/post-adoption/animals/${animal.animalId}`}
            className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
          >
            {animal.animalName}
          </Link>
        </span>
      ))}
    </span>
  );
}

function pieSlicePath(start: number, size: number) {
  const point = (percent: number) => {
    const angle = (percent / 100) * Math.PI * 2 - Math.PI / 2;
    return { x: 21 + 18 * Math.cos(angle), y: 21 + 18 * Math.sin(angle) };
  };
  const from = point(start);
  const to = point(start + size);
  return `M 21 21 L ${from.x} ${from.y} A 18 18 0 ${size > 50 ? 1 : 0} 1 ${to.x} ${to.y} Z`;
}

function notApplicableReason(axis: string) {
  if (axis === "dogs_course") {
    return "aucune rencontre avec d’autres chiens n’a été déclarée.";
  }
  if (axis === "solitude_duration" || axis === "solitude_course") {
    return "aucune période de solitude n’a été déclarée.";
  }
  return null;
}

function StateRows({ axis }: { axis: PostAdoptionCollectiveAxis }) {
  const rows = [
    { label: "Non observable", state: axis.explicitUnobservable },
    { label: "Question non applicable", state: axis.notApplicable },
    { label: "Réponse absente", state: axis.missing },
    { label: "Donnée invalide", state: axis.invalid },
  ].filter((item) => item.state.count > 0);

  if (rows.length === 0) return null;
  return (
    <dl className="mt-5 grid gap-2 border-t pt-4 text-sm">
      {rows.map((item) => (
        <div key={item.label} className="grid gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <dt className="font-medium text-muted">{item.label}</dt>
            <dd className="text-right text-foreground">
              {countLabel(item.state.count, "chiot")}
              <span className="ml-2 text-muted"><Names animals={item.state.animals} /></span>
              {item.label === "Question non applicable" && notApplicableReason(axis.axis) ? (
                <span className="mt-1 block text-xs text-muted">
                  Motif : {notApplicableReason(axis.axis)}
                </span>
              ) : null}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

function PieAxis({ axis }: { axis: PostAdoptionCollectiveAxis }) {
  const [selected, setSelected] = useState<string | null>(null);
  const segments = axis.categories.map((category, index) => ({
    category,
    index,
    size: (category.count / axis.representedAnswers) * 100,
    start:
      (axis.categories
        .slice(0, index)
        .reduce((total, item) => total + item.count, 0) /
        axis.representedAnswers) *
      100,
  }));

  return (
    <article className="rounded-2xl border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">{axis.label}</h3>
        <span className="rounded-full bg-background px-3 py-1 text-sm font-medium text-muted">
          {countLabel(axis.representedAnswers, "réponse représentée", "réponses représentées")}
        </span>
      </div>

      {axis.hasChart ? (
        <div className="mt-6 grid items-center gap-6 sm:grid-cols-[11rem_1fr]">
          <svg
            viewBox="0 0 42 42"
            className="mx-auto h-40 w-40"
            aria-hidden="true"
          >
            {segments.map(({ category, index, size, start }) => {
              const active = selected === null || selected === category.value;
              return size >= 99.999 ? (
                <circle
                  key={category.value}
                  cx="21"
                  cy="21"
                  r="18"
                  fill={colors[index % colors.length]}
                  opacity={active ? 1 : 0.24}
                />
              ) : (
                <path
                  key={category.value}
                  d={pieSlicePath(start, size)}
                  fill={colors[index % colors.length]}
                  stroke="white"
                  strokeWidth={selected === category.value ? 0.8 : 0.35}
                  opacity={active ? 1 : 0.24}
                />
              );
            })}
          </svg>

          <div>
            <p className="text-sm font-medium text-muted">Légende interactive</p>
            <div className="mt-3 grid gap-2">
              {axis.categories.map((category, index) => {
                const isSelected = selected === category.value;
                return (
                  <button
                    key={category.value}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${category.label} · ${category.count}`}
                    onClick={() => setSelected(isSelected ? null : category.value)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: colors[index % colors.length] }}
                      />
                      <span>{category.label}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{category.count}</span>
                  </button>
                );
              })}
            </div>
            {selected ? (
              <p className="mt-3 rounded-xl bg-background px-3 py-2 text-sm text-muted" aria-live="polite">
                <Names animals={axis.categories.find((category) => category.value === selected)?.animals ?? []} />
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed bg-background p-4 text-sm text-muted">
          Aucune réponse structurée à représenter.
        </p>
      )}
      <StateRows axis={axis} />
    </article>
  );
}

function TableAxis({ axis }: { axis: PostAdoptionCollectiveAxis }) {
  const rows = [
    ...axis.categories.map((category) => ({
      label: category.label,
      count: category.count,
      animals: category.animals,
    })),
    { label: "Non observable", count: axis.explicitUnobservable.count, animals: axis.explicitUnobservable.animals },
    { label: "Question non applicable", count: axis.notApplicable.count, animals: axis.notApplicable.animals },
    { label: "Réponse absente", count: axis.missing.count, animals: axis.missing.animals },
    { label: "Donnée invalide", count: axis.invalid.count, animals: axis.invalid.animals },
  ].filter((row) => row.count > 0);

  return (
    <article className="overflow-hidden rounded-2xl border bg-surface">
      <div className="border-b px-5 py-4 sm:px-6">
        <h3 className="font-semibold text-foreground">{axis.label}</h3>
        <p className="mt-1 text-sm text-muted">
          {countLabel(axis.representedAnswers, "réponse représentée", "réponses représentées")}
        </p>
      </div>
      {rows.length > 0 ? (
        <div>
          <table className="w-full table-fixed text-left text-sm" aria-label={`${axis.label} — vue en tableau`}>
            <colgroup>
              <col className="w-[42%]" />
              <col className="w-16 sm:w-20" />
              <col />
            </colgroup>
            <thead className="bg-background text-muted">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold sm:px-6">Réponse</th>
                <th scope="col" className="px-2 py-3 text-right font-semibold sm:px-5">Nombre</th>
                <th scope="col" className="px-3 py-3 font-semibold sm:px-6">Chiots</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="break-words px-3 py-3 font-medium sm:px-6">{row.label}</th>
                  <td className="px-2 py-3 text-right tabular-nums sm:px-5">{row.count}</td>
                  <td className="break-words px-3 py-3 text-muted sm:px-6">
                    <Names animals={row.animals} prefix={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-5 text-sm text-muted sm:p-6">Aucune réponse structurée à représenter.</p>
      )}
    </article>
  );
}

function QuestionnaireStateSummary({
  results,
}: {
  results: PostAdoptionCollectiveResults;
}) {
  const rows: Array<{ label: string; state: PostAdoptionCollectiveState }> = [
    { label: "Jalon absent", state: results.questionnaireStates.absent },
    { label: "Questionnaire non soumis", state: results.questionnaireStates.notSubmitted },
    { label: "Version non compatible", state: results.questionnaireStates.incompatible },
    { label: "Donnée invalide", state: results.questionnaireStates.invalid },
    { label: "Rattachement à vérifier", state: results.questionnaireStates.linkageIssue },
  ].filter((row) => row.state.count > 0);

  if (rows.length === 0) return null;
  return (
    <aside className="mt-5 rounded-2xl border bg-background p-5" aria-labelledby="questionnaire-availability-heading">
      <h3 id="questionnaire-availability-heading" className="font-semibold text-foreground">
        Questionnaires qui ne peuvent pas alimenter les graphiques
      </h3>
      <dl className="mt-3 grid gap-3 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap justify-between gap-x-5 gap-y-1">
            <dt className="font-medium text-muted">
              {row.label} : {countLabel(row.state.count, "chiot")}
            </dt>
            <dd><Names animals={row.state.animals} /></dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export function PostAdoptionCollectiveResultsView({
  results,
}: {
  results: Record<PostAdoptionMilestone, PostAdoptionCollectiveResults>;
}) {
  const [milestone, setMilestone] = useState<PostAdoptionMilestone>("t1");
  const [view, setView] = useState<"charts" | "table">("charts");
  const id = useId();
  const current = results[milestone];

  const changeTab = (next: PostAdoptionMilestone) => {
    setMilestone(next);
    requestAnimationFrame(() => document.getElementById(`${id}-${next}-tab`)?.focus());
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    changeTab(milestone === "t1" ? "t2" : "t1");
  };

  return (
    <section className="border-t py-8" aria-labelledby="collective-results-heading">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Lecture collective descriptive</p>
          <h2 id="collective-results-heading" className="mt-2 text-2xl font-semibold">Résultats T1/T2 de la portée</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Répartition factuelle des réponses structurées. Aucun score, classement ou interprétation n’est calculé.
          </p>
        </div>
        {current.axes.length > 0 ? <div className="flex w-fit rounded-xl border bg-background p-1" aria-label="Mode d’affichage">
          <button
            type="button"
            aria-pressed={view === "charts"}
            onClick={() => setView("charts")}
            className="rounded-lg px-3 py-2 text-sm font-semibold aria-pressed:bg-surface aria-pressed:shadow-sm"
          >
            Graphiques
          </button>
          <button
            type="button"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
            className="rounded-lg px-3 py-2 text-sm font-semibold aria-pressed:bg-surface aria-pressed:shadow-sm"
          >
            Vue en tableau
          </button>
        </div> : null}
      </div>

      <div className="mt-7 flex gap-2 border-b" role="tablist" aria-label="Jalon du questionnaire">
        {(["t1", "t2"] as const).map((item) => (
          <button
            key={item}
            id={`${id}-${item}-tab`}
            type="button"
            role="tab"
            aria-selected={milestone === item}
            aria-controls={`${id}-panel`}
            tabIndex={milestone === item ? 0 : -1}
            onClick={() => setMilestone(item)}
            onKeyDown={onTabKeyDown}
            className="min-w-20 border-b-2 border-transparent px-4 py-3 text-sm font-semibold uppercase tracking-wide text-muted aria-selected:border-accent aria-selected:text-accent"
          >
            {item === "t1" ? "T1 — 2 mois" : "T2 — 15 mois"}
          </button>
        ))}
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${milestone}-tab`}
        className="pt-6"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border bg-surface p-5">
            <p className="text-sm text-muted">Chiots concernés</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{current.counts.concernedAnimals}</p>
          </div>
          <div className="rounded-2xl border bg-surface p-5">
            <p className="text-sm text-muted">Questionnaires reçus</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {countLabel(current.counts.receivedQuestionnaires, "questionnaire reçu", "questionnaires reçus")}
            </p>
          </div>
        </div>

        <QuestionnaireStateSummary results={current} />

        {current.axes.length > 0 ? (
          <div className={`mt-6 grid gap-5 ${view === "charts" ? "lg:grid-cols-2" : ""}`}>
            {current.axes.map((axis) =>
              view === "charts" ? <PieAxis key={axis.axis} axis={axis} /> : <TableAxis key={axis.axis} axis={axis} />,
            )}
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-dashed bg-background p-6 text-sm text-muted">
            {current.counts.receivedQuestionnaires === 0
              ? `Aucun questionnaire ${milestone.toUpperCase()} n’a encore été reçu pour cette portée.`
              : "Aucun questionnaire reçu ne peut alimenter les graphiques."}
          </p>
        )}
      </div>
    </section>
  );
}
