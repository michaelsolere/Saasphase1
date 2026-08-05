"use client";

import { useState } from "react";

export function PublicFormShare({ path }: { path: string }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2_000);
    } catch {
      setCopyStatus("error");
    }
  }
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={copy} className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white">
          {copyStatus === "copied" ? "Lien copié" : "Copier le lien"}
        </button>
        <a href={path} target="_blank" rel="noreferrer" className="rounded-xl border px-4 py-2.5 text-center text-sm font-semibold">Ouvrir le formulaire public</a>
      </div>
      <p aria-live="polite" className="mt-2 text-sm text-rose-700">
        {copyStatus === "error" ? "La copie a échoué. Ouvrez le formulaire puis copiez son adresse." : ""}
      </p>
    </div>
  );
}
