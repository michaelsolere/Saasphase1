"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  initialWhelpingBirthAdjustmentActionState,
  type WhelpingBirthAdjustmentActionState,
} from "./whelping-actions-core";
import type { WhelpingBirthSex } from "./whelping-core";

type QuickCompletionAction = (
  previousState: WhelpingBirthAdjustmentActionState,
  formData: FormData,
) => Promise<WhelpingBirthAdjustmentActionState>;

export type WhelpingQuickCompletionItem = {
  birthOrder: number;
  sex: WhelpingBirthSex;
  occurredAt: string;
  initialCollarColor: string | null;
  birthWeightMeasurement: { grams: number; measuredAt: string } | null;
  assignedColors: Array<{ birthOrder: number; color: string }>;
  action: QuickCompletionAction;
};

const palette = [
  { label: "Rouge", swatch: "#dc2626" },
  { label: "Bleu", swatch: "#2563eb" },
  { label: "Vert", swatch: "#16a34a" },
  { label: "Jaune", swatch: "#facc15" },
  { label: "Orange", swatch: "#f97316" },
  { label: "Rose", swatch: "#ec4899" },
  { label: "Violet", swatch: "#7c3aed" },
  { label: "Turquoise", swatch: "#14b8a6" },
  { label: "Blanc", swatch: "#ffffff" },
  { label: "Noir", swatch: "#111827" },
  { label: "Autre", swatch: "linear-gradient(135deg,#dc2626 0 25%,#2563eb 25% 50%,#16a34a 50% 75%,#facc15 75%)" },
] as const;

function formatTime(value: string, timezoneName: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezoneName,
  }).format(new Date(value));
}

function sexLabel(sex: WhelpingBirthSex) {
  return sex === "male" ? "Mâle" : sex === "female" ? "Femelle" : "Sexe à compléter";
}

function normalizeColor(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR");
}

function QuickCompletionCard({
  item,
  timezoneName,
  expanded,
  onExpand,
  onLater,
  onSuccess,
}: {
  item: WhelpingQuickCompletionItem;
  timezoneName: string;
  expanded: boolean;
  onExpand: () => void;
  onLater: () => void;
  onSuccess: (message: string) => void;
}) {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState("");
  const [weight, setWeight] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<WhelpingBirthAdjustmentActionState>(
    initialWhelpingBirthAdjustmentActionState,
  );
  const [serverDuplicateOrder, setServerDuplicateOrder] = useState<number | null>(null);

  const chosenColor = selectedColor === "Autre" ? customColor.trim() : selectedColor;
  const localDuplicate = chosenColor
    ? item.assignedColors.find(({ color }) => normalizeColor(color) === normalizeColor(chosenColor))
    : undefined;
  const duplicateOrder = localDuplicate?.birthOrder ?? serverDuplicateOrder;
  const customColorInvalid = selectedColor === "Autre" && customColor.trim().length === 0;
  const hasNewColor = item.initialCollarColor === null && Boolean(chosenColor) && !customColorInvalid;
  const hasNewWeight = item.birthWeightMeasurement === null && weight.trim().length > 0;
  const canSubmit = (hasNewColor || hasNewWeight) && (!duplicateOrder || allowDuplicate);

  function selectColor(label: string) {
    setSelectedColor(label);
    setAllowDuplicate(false);
    setServerDuplicateOrder(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setState(initialWhelpingBirthAdjustmentActionState);

    const formData = new FormData();
    if (hasNewColor && chosenColor) formData.set("initial_collar_color", chosenColor);
    if (hasNewWeight) {
      formData.set("birth_weight_grams", weight.trim());
      formData.set("weight_measured_at", new Date().toISOString());
    }
    if (allowDuplicate) formData.set("allow_duplicate_color", "true");

    try {
      const nextState = await item.action(initialWhelpingBirthAdjustmentActionState, formData);
      setState(nextState);
      if (nextState.duplicateColorBirthOrder) {
        setServerDuplicateOrder(nextState.duplicateColorBirthOrder);
        setAllowDuplicate(false);
      }
      if (nextState.status === "success") {
        onSuccess(nextState.message ?? `Naissance n°${item.birthOrder} complétée.`);
        router.refresh();
      }
    } catch {
      setState({ status: "error", message: "Le complément n’a pas pu être enregistré. Rechargez les données avant de réessayer." });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const title = `Naissance n°${item.birthOrder} — ${sexLabel(item.sex)} — ${formatTime(item.occurredAt, timezoneName)}`;

  return (
    <article className="min-w-0 rounded-xl border bg-background p-4" data-testid="quick-completion-card">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold"
        aria-expanded={expanded}
        onClick={onExpand}
      >
        <span className="min-w-0 break-words">{title}</span>
        <span aria-hidden="true" className="shrink-0 text-muted">{expanded ? "−" : "+"}</span>
      </button>

      {expanded ? (
        <form className="mt-4 space-y-5 border-t pt-4" onSubmit={(event) => void submit(event)}>
          <div>
            <p className="text-sm font-semibold">Poids de naissance</p>
            {item.birthWeightMeasurement ? (
              <p className="mt-2 rounded-xl border bg-surface px-3 py-3 text-sm">
                <span className="font-semibold">{item.birthWeightMeasurement.grams} g</span>
                <span className="ml-2 text-muted">
                  pesé à {formatTime(item.birthWeightMeasurement.measuredAt, timezoneName)}, déjà enregistré, correction dans le Journal complet
                </span>
              </p>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    aria-label="Poids de naissance"
                    className="min-h-14 min-w-0 flex-1 rounded-xl border bg-background px-4 text-lg outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100000}
                    step={1}
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    disabled={submitting}
                  />
                  <span className="shrink-0 text-lg font-semibold">g</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Vous pouvez utiliser la dictée du clavier de votre téléphone si elle est disponible.
                </p>
              </>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold">Couleur du collier</p>
            {item.initialCollarColor ? (
              <p className="mt-2 rounded-xl border bg-surface px-3 py-3 text-sm">
                <span className="font-semibold">{item.initialCollarColor}</span>
                <span className="ml-2 text-muted">déjà enregistrée, correction dans le Journal complet</span>
              </p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {palette.map(({ label, swatch }) => {
                    const selected = selectedColor === label;
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={selected}
                        className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium ${selected ? "border-accent bg-accent/10 ring-2 ring-accent" : "bg-background"}`}
                        onClick={() => selectColor(label)}
                        disabled={submitting}
                      >
                        <span
                          aria-hidden="true"
                          className="size-4 shrink-0 rounded-full border border-black/20"
                          style={{ background: swatch }}
                        />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedColor === "Autre" ? (
                  <label className="mt-3 block text-sm font-semibold">
                    Couleur personnalisée
                    <input
                      className="mt-2 min-h-12 w-full rounded-xl border bg-background px-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                      value={customColor}
                      onChange={(event) => {
                        setCustomColor(event.target.value);
                        setAllowDuplicate(false);
                        setServerDuplicateOrder(null);
                      }}
                      maxLength={255}
                      required
                      disabled={submitting}
                    />
                  </label>
                ) : null}
              </>
            )}
          </div>

          {duplicateOrder ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <p>Cette couleur est déjà attribuée à la naissance n°{duplicateOrder}.</p>
              <label className="mt-3 flex min-h-11 items-center gap-3 font-semibold">
                <input
                  type="checkbox"
                  checked={allowDuplicate}
                  onChange={(event) => setAllowDuplicate(event.target.checked)}
                  disabled={submitting}
                />
                Utiliser quand même cette couleur
              </label>
            </div>
          ) : null}

          {state.status === "error" && state.message && !state.duplicateColorBirthOrder ? (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
              <p>{state.message}</p>
              {state.stale ? (
                <Button type="button" variant="outline" className="mt-3" onClick={() => router.refresh()}>
                  Recharger les données
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="min-h-12 flex-1" disabled={!canSubmit || submitting}>
              {submitting ? "ENREGISTREMENT…" : "Enregistrer le complément"}
            </Button>
            <Button type="button" variant="outline" className="min-h-12" onClick={onLater} disabled={submitting}>
              Plus tard
            </Button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

export function WhelpingQuickCompletion({
  items,
  timezoneName,
  onSuccess,
}: {
  items: WhelpingQuickCompletionItem[];
  timezoneName: string;
  onSuccess: (message: string) => void;
}) {
  const sortedItems = [...items].sort(
    (left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.birthOrder - left.birthOrder,
  );
  const [expandedBirthOrder, setExpandedBirthOrder] = useState<number | null | undefined>(undefined);
  const effectiveExpandedBirthOrder =
    expandedBirthOrder === undefined ||
    (expandedBirthOrder !== null && !sortedItems.some(({ birthOrder }) => birthOrder === expandedBirthOrder))
      ? sortedItems[0]?.birthOrder ?? null
      : expandedBirthOrder;

  if (sortedItems.length === 0) return null;

  return (
    <section className="mt-4 rounded-xl border border-accent/30 bg-surface p-3 sm:p-4" aria-labelledby="quick-completion-title">
      <h3 id="quick-completion-title" className="font-semibold">Naissances à compléter</h3>
      <div className="mt-3 space-y-2">
        {sortedItems.map((item) => (
          <QuickCompletionCard
            key={item.birthOrder}
            item={item}
            timezoneName={timezoneName}
            expanded={effectiveExpandedBirthOrder === item.birthOrder}
            onExpand={() => setExpandedBirthOrder(item.birthOrder)}
            onLater={() => setExpandedBirthOrder(null)}
            onSuccess={onSuccess}
          />
        ))}
      </div>
    </section>
  );
}
