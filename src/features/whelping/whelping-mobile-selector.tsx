"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { selectWhelpingMobileLitterAction } from "./whelping-mobile-selection-action";

export type MobileLitterOption = {
  index: number;
  label: string;
};

const SelectionTransitionContext = createContext<{
  beginChange: () => void;
  cancelChange: () => void;
} | null>(null);

export function WhelpingMobileSelectionBoundary({ children }: { children: ReactNode }) {
  const [changing, setChanging] = useState(false);
  const boundaryRef = useRef<HTMLDivElement>(null);

  function beginChange() {
    if (boundaryRef.current) {
      boundaryRef.current.inert = true;
      boundaryRef.current.setAttribute("aria-hidden", "true");
    }
    setChanging(true);
  }

  function cancelChange() {
    if (boundaryRef.current) {
      boundaryRef.current.inert = false;
      boundaryRef.current.removeAttribute("aria-hidden");
    }
    setChanging(false);
  }

  return (
    <SelectionTransitionContext.Provider value={{ beginChange, cancelChange }}>
      <div data-whelping-selection-boundary>
        {changing ? (
          <section role="status" className="rounded-2xl border bg-surface px-5 py-12 text-center">
            <p className="font-semibold">Changement de portée…</p>
            <p className="mt-2 text-sm text-muted">Les commandes sont temporairement désactivées.</p>
          </section>
        ) : null}
        <div ref={boundaryRef} hidden={changing}>
          {children}
        </div>
      </div>
    </SelectionTransitionContext.Provider>
  );
}

export function WhelpingMobileSelector({
  options,
  selectedIndex,
}: {
  options: MobileLitterOption[];
  selectedIndex: number;
}) {
  const router = useRouter();
  const selectionTransition = useContext(SelectionTransitionContext);
  const [error, setError] = useState<string | null>(null);

  if (options.length < 2) return null;

  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">
      <span>Portée affichée</span>
      <select
        aria-label="Portée affichée"
        value={String(selectedIndex)}
        onChange={(event) => {
          const index = Number(event.target.value);
          selectionTransition?.beginChange();
          void selectWhelpingMobileLitterAction(index).then((result) => {
            if (result.status === "success") {
              router.refresh();
              return;
            }
            setError(result.message ?? "Le changement de portée a échoué.");
            selectionTransition?.cancelChange();
          });
        }}
        className="min-h-11 min-w-0 max-w-full rounded-xl border bg-surface px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.index} value={option.index}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <span role="alert" className="text-sm text-red-700">{error}</span> : null}
    </label>
  );
}
