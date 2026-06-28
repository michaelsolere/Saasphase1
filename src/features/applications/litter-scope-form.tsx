"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { updateApplicationDesiredLitter } from "@/features/applications/actions";
import {
  formatLitterDate,
  getLitterDisplayName,
  getLitterGroupStatusLabel,
  getLitterStatusLabel,
} from "@/features/litters/formatters";

export type ApplicationLitter = {
  id: string;
  name: string | null;
  litter_group_id: string | null;
  litter_group_name: string | null;
  status: string | null;
  mother_display_name: string | null;
  father_display_name: string | null;
  expected_birth_date: string | null;
  actual_birth_date: string | null;
};

export type ApplicationLitterGroup = {
  id: string;
  name: string | null;
  status: string | null;
  expected_period_start: string | null;
  expected_period_end: string | null;
};

type ScopeMode = "none" | "litter" | "group";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Enregistrement…" : "Enregistrer le rattachement"}
    </button>
  );
}

function litterBirthLabel(litter: ApplicationLitter) {
  if (litter.actual_birth_date) {
    return `Née le ${formatLitterDate(litter.actual_birth_date)}`;
  }
  if (litter.expected_birth_date) {
    return `Naissance prévue le ${formatLitterDate(litter.expected_birth_date)}`;
  }
  return "Date de mise-bas non renseignée";
}

function groupPeriodLabel(group: ApplicationLitterGroup) {
  if (group.expected_period_start || group.expected_period_end) {
    const start = group.expected_period_start
      ? formatLitterDate(group.expected_period_start)
      : "?";
    const end = group.expected_period_end
      ? formatLitterDate(group.expected_period_end)
      : "?";
    return `${start} – ${end}`;
  }
  return "Période non renseignée";
}

export function ApplicationLitterScopeForm({
  applicationId,
  litters,
  litterGroups,
  currentLitterId,
  currentGroupId,
}: {
  applicationId: string;
  litters: ApplicationLitter[];
  litterGroups: ApplicationLitterGroup[];
  currentLitterId: string | null;
  currentGroupId: string | null;
}) {
  // Une portée appartient à un groupe : la portée prime sur le groupe pour
  // déterminer le mode initial (les deux peuvent être renseignés ensemble).
  const initialMode: ScopeMode = currentLitterId
    ? "litter"
    : currentGroupId
      ? "group"
      : "none";

  const [scopeMode, setScopeMode] = useState<ScopeMode>(initialMode);
  const [selectedLitterId, setSelectedLitterId] = useState<string>(
    currentLitterId ?? "",
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    currentGroupId ?? "",
  );

  const currentLitter = currentLitterId
    ? litters.find((litter) => litter.id === currentLitterId) ?? null
    : null;
  const currentGroup = currentGroupId
    ? litterGroups.find((group) => group.id === currentGroupId) ?? null
    : null;

  function handleModeChange(mode: ScopeMode) {
    setScopeMode(mode);
    if (mode !== "litter") {
      setSelectedLitterId("");
    }
    if (mode !== "group") {
      setSelectedGroupId("");
    }
  }

  const selectedLitter = selectedLitterId
    ? litters.find((litter) => litter.id === selectedLitterId) ?? null
    : null;

  let currentSummary: string;
  if (currentLitterId) {
    if (currentLitter) {
      const groupSuffix = currentLitter.litter_group_name
        ? ` · Groupe associé : ${currentLitter.litter_group_name}`
        : " · Aucun groupe associé";
      currentSummary = `Portée souhaitée : ${getLitterDisplayName(currentLitter.name, currentLitter.id)}${groupSuffix}`;
    } else {
      currentSummary =
        "Une portée est souhaitée, mais elle n’est plus disponible dans la liste.";
    }
  } else if (currentGroupId) {
    currentSummary = currentGroup
      ? `Groupe de portées souhaité : ${currentGroup.name ?? "Groupe sans nom"}`
      : "Un groupe de portées est souhaité, mais il n’est plus disponible dans la liste.";
  } else {
    currentSummary =
      "Aucun rattachement à une portée ou une période pour l’instant.";
  }

  return (
    <form action={updateApplicationDesiredLitter} className="mt-5">
      <input type="hidden" name="application_id" value={applicationId} />

      <p className="rounded-xl border bg-background px-4 py-3 text-sm text-muted">
        {currentSummary}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(
          [
            ["none", "Aucune portée ou période"],
            ["litter", "Choisir une portée précise"],
            ["group", "Choisir un groupe de portées"],
          ] as const
        ).map(([mode, label]) => {
          const isDisabled =
            (mode === "litter" && litters.length === 0) ||
            (mode === "group" && litterGroups.length === 0);
          return (
            <button
              key={mode}
              type="button"
              onClick={() => handleModeChange(mode)}
              disabled={isDisabled}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                scopeMode === mode
                  ? "border-accent bg-accent text-white"
                  : "text-muted hover:bg-background"
              }`}
            >
              {label}
              {mode === "litter" && litters.length === 0 ? " (aucune)" : ""}
              {mode === "group" && litterGroups.length === 0 ? " (aucun)" : ""}
            </button>
          );
        })}
      </div>

      {scopeMode === "litter" ? (
        <div className="mt-5 space-y-3">
          {/* Une portée appartient à un groupe : on transmet aussi le groupe
              associé à la portée sélectionnée, s'il existe. */}
          {selectedLitter?.litter_group_id ? (
            <input
              type="hidden"
              name="desired_litter_group_id"
              value={selectedLitter.litter_group_id}
            />
          ) : null}
          {litters.map((litter) => {
            const isSelected = selectedLitterId === litter.id;
            return (
              <label
                key={litter.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                  isSelected
                    ? "border-accent bg-accent-soft"
                    : "bg-background hover:bg-surface"
                }`}
              >
                <input
                  type="radio"
                  name="desired_litter_id"
                  value={litter.id}
                  checked={isSelected}
                  onChange={() => setSelectedLitterId(litter.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-foreground">
                    {getLitterDisplayName(litter.name, litter.id)}
                  </span>
                  <span className="block text-xs text-muted">
                    {getLitterStatusLabel(litter.status)} ·{" "}
                    {litterBirthLabel(litter)}
                  </span>
                  <span className="block text-xs text-muted">
                    Mère : {litter.mother_display_name ?? "Non renseignée"} ·
                    Père : {litter.father_display_name ?? "Non renseigné"}
                  </span>
                  <span className="block text-xs text-muted">
                    Groupe associé :{" "}
                    {litter.litter_group_name ?? "Aucun groupe"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      {scopeMode === "group" ? (
        <div className="mt-5 space-y-3">
          {litterGroups.map((group) => {
            const isSelected = selectedGroupId === group.id;
            const linkedLitters = litters.filter(
              (litter) => litter.litter_group_id === group.id,
            ).length;
            return (
              <label
                key={group.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                  isSelected
                    ? "border-accent bg-accent-soft"
                    : "bg-background hover:bg-surface"
                }`}
              >
                <input
                  type="radio"
                  name="desired_litter_group_id"
                  value={group.id}
                  checked={isSelected}
                  onChange={() => setSelectedGroupId(group.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-medium text-foreground">
                    {group.name ?? "Groupe sans nom"}
                  </span>
                  <span className="block text-xs text-muted">
                    {getLitterGroupStatusLabel(group.status)} ·{" "}
                    {groupPeriodLabel(group)}
                  </span>
                  <span className="block text-xs text-muted">
                    {linkedLitters} portée{linkedLitters > 1 ? "s" : ""} liée
                    {linkedLitters > 1 ? "s" : ""}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}

      <div className="mt-5">
        <SubmitButton />
      </div>
    </form>
  );
}
