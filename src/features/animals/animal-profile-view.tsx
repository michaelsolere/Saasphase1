"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";

import { AnimalPrimaryPhotoManager } from "./animal-primary-photo-manager";
import {
  AvailabilityDialog,
  FinalIdentityDialog,
  HealthEventDialog,
  KeepAtKennelDialog,
  MakeAvailableDialog,
  PromoteBreederDialog,
} from "./animal-profile-dialogs";
import {
  AnimalDocumentsSection,
  AnimalHealthSection,
  AnimalHistoryTab,
  AnimalOverviewSection,
  AnimalReproductionSection,
  type AnimalProfileDocument,
  type AnimalProfileEvent,
  type AnimalProfileFemaleSummary,
  type AnimalProfileLitter,
  type AnimalProfileMaleSummary,
  type AnimalProfileNote,
} from "./animal-profile-sections";
import {
  ANIMAL_PROFILE_TABS,
  isSensitiveAnimalDecisionRole,
  type AnimalAttentionPoint,
  type AnimalProfileTab,
} from "./animal-profile-model";
import type { AnimalHistoryEntry } from "./animal-history-model";
import { formatAnimalAge, getAnimalSexLabel, getAnimalStatusLabel, getOwnershipStatusLabel } from "./formatters";

const tabLabels: Record<AnimalProfileTab, string> = {
  overview: "Aperçu",
  health: "Santé",
  reproduction: "Reproduction",
  documents: "Documents",
  history: "Historique",
};

export type AnimalProfileViewProps = {
  initialTab: AnimalProfileTab;
  role: string;
  animal: {
    id: string;
    title: string;
    callName: string | null;
    officialName: string | null;
    species: string;
    breed: string;
    sex: string;
    status: string;
    ownershipStatus: string;
    birthDate: string | null;
    deathDate: string | null;
    litterId: string | null;
    identificationNumber: string | null;
    lofNumber: string | null;
    coatColor: string | null;
    pedigreeUrl: string | null;
    birthOrder: number | null;
    birthWeightGrams: number | null;
    collarColor: string | null;
    notes: string | null;
    isBreeder: boolean;
    isExternal: boolean;
    isRetired: boolean;
    createdAt: string;
    updatedAt: string;
  };
  photo: { id: string | null; url: string | null; filePath: string | null; width: number | null; height: number | null; unavailable: boolean };
  litter: { id: string; name: string | null } | null;
  mother: { id: string; name: string } | null;
  father: { id: string; name: string } | null;
  owner: { id: string | null; name: string | null } | null;
  reservation: { id: string; status: string; paidCents: number; priceCents: number | null; currency: string } | null;
  attention: AnimalAttentionPoint[];
  recentActivity: AnimalHistoryEntry[];
  healthNotes: AnimalProfileNote[];
  healthEvents: AnimalProfileEvent[];
  healthDocuments: AnimalProfileDocument[];
  documents: AnimalProfileDocument[];
  history: AnimalHistoryEntry[];
  historyHasError: boolean;
  femaleSummary: AnimalProfileFemaleSummary | null;
  maleSummary: AnimalProfileMaleSummary | null;
  reproductionLitters: AnimalProfileLitter[];
  messages: { tone: "success" | "error"; text: string }[];
};

function oldEnoughForBreeder(birthDate: string | null) {
  if (!birthDate) return false;
  const threshold = new Date();
  threshold.setUTCMonth(threshold.getUTCMonth() - 15);
  return new Date(`${birthDate}T00:00:00Z`) <= threshold;
}

export function AnimalProfileView(props: AnimalProfileViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { animal } = props;
  const canDecide = isSensitiveAnimalDecisionRole(props.role);
  const adoptedOut = animal.ownershipStatus === "adopted_out" || animal.ownershipStatus === "sold";
  const canKeep = canDecide && ["born", "active", "available"].includes(animal.status) && !animal.isBreeder && !animal.isExternal && !animal.isRetired && !adoptedOut;
  const canMakeAvailable = canDecide && animal.status === "kept" && !animal.isBreeder && !animal.isExternal && !animal.isRetired && !adoptedOut;
  const canToggleAvailability = canDecide && Boolean(animal.litterId) && animal.ownershipStatus === "produced" && ["born", "available"].includes(animal.status) && !animal.isBreeder && !animal.isExternal && !animal.isRetired;
  const canPromote = canDecide && animal.sex === "female" && !animal.isBreeder && !animal.isExternal && !animal.isRetired && !adoptedOut && !["adopted", "deceased", "archived", "retired"].includes(animal.status) && Boolean(animal.identificationNumber?.trim()) && oldEnoughForBreeder(animal.birthDate);

  function openTab(tab: AnimalProfileTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % ANIMAL_PROFILE_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + ANIMAL_PROFILE_TABS.length) % ANIMAL_PROFILE_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = ANIMAL_PROFILE_TABS.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      tabRefs.current[nextIndex]?.focus();
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openTab(ANIMAL_PROFILE_TABS[index]);
    }
  }

  const tabCounts: Partial<Record<AnimalProfileTab, number>> = {
    health: props.healthEvents.length + props.healthNotes.length,
    reproduction: props.reproductionLitters.length,
    documents: props.documents.length,
  };

  return <main className="min-h-screen w-full overflow-x-hidden" data-testid="animal-profile">
    <div className="mx-auto w-full max-w-[80rem] px-4 py-7 sm:px-8 lg:px-10 lg:py-9">
      <Link href="/animals" className="text-sm font-semibold text-accent hover:underline">← Retour aux animaux</Link>
      <header className="mt-6 grid gap-7 border-b pb-8 md:grid-cols-[12.25rem_minmax(0,1fr)] xl:grid-cols-[12.25rem_minmax(0,1fr)_auto] xl:items-end">
        <AnimalPrimaryPhotoManager animalId={animal.id} animalName={animal.title} hasStoredPhoto={Boolean(props.photo.id)} photoUrl={props.photo.url} photoUnavailable={props.photo.unavailable} photoActionsDisabled={false} photoWidth={props.photo.width} photoHeight={props.photo.height} layout="profile" />
        <div className="min-w-0">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-accent">Fiche animal</p>
          <h1 className="mt-2 break-words text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{animal.title}</h1>
          {animal.callName && animal.callName !== animal.title ? <p className="mt-2 text-lg font-semibold text-muted">{animal.callName}</p> : null}
          <p className="mt-4 text-sm text-muted">{formatAnimalAge(animal.birthDate, animal.deathDate)} · {getAnimalSexLabel(animal.sex)} · {animal.breed}</p>
          <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full border bg-surface px-3 py-1 text-xs font-semibold">{getAnimalStatusLabel(animal.status)}</span><span className="rounded-full border bg-surface px-3 py-1 text-xs font-semibold">{getOwnershipStatusLabel(animal.ownershipStatus)}</span>{animal.isBreeder ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900">Reproducteur</span> : null}</div>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-1 xl:max-w-sm xl:justify-end">
          <Link href={`/animals/${animal.id}/edit`} className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold !text-white">Modifier</Link>
          {animal.litterId ? <FinalIdentityDialog animal={{ id: animal.id, identificationNumber: animal.identificationNumber, officialName: animal.officialName, callName: animal.callName, lofNumber: animal.lofNumber }} /> : null}
          {canKeep ? <KeepAtKennelDialog animalId={animal.id} /> : null}
          {canMakeAvailable ? <MakeAvailableDialog animalId={animal.id} /> : null}
          {canToggleAvailability ? <AvailabilityDialog animalId={animal.id} currentStatus={animal.status} /> : null}
          {canPromote ? <PromoteBreederDialog animalId={animal.id} /> : null}
        </div>
      </header>

      {props.messages.length > 0 ? <div className="mt-5 space-y-2">{props.messages.map((message, index) => <p key={`${message.text}-${index}`} role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" : "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"}>{message.text}</p>)}</div> : null}

      <div role="tablist" aria-label="Sections de la fiche animal" className="sticky top-0 z-10 -mx-4 flex gap-5 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur sm:mx-0 sm:px-0">
        {ANIMAL_PROFILE_TABS.map((tab, index) => <button key={tab} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={`animal-tab-${tab}`} aria-controls={`animal-panel-${tab}`} aria-selected={props.initialTab === tab} tabIndex={props.initialTab === tab ? 0 : -1} onClick={() => openTab(tab)} onKeyDown={(event) => handleTabKeyDown(event, index)} className={`shrink-0 border-b-2 px-0 py-4 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${props.initialTab === tab ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>{tabLabels[tab]}{tabCounts[tab] !== undefined ? <span className="ml-1.5 rounded-full bg-muted/15 px-1.5 py-0.5 text-[0.68rem]">{tabCounts[tab]}</span> : null}</button>)}
      </div>

      <section role="tabpanel" id={`animal-panel-${props.initialTab}`} aria-labelledby={`animal-tab-${props.initialTab}`} tabIndex={0} className="py-7 outline-none focus-visible:ring-2 focus-visible:ring-accent">
        {props.initialTab === "overview" ? <AnimalOverviewSection animal={{ birthDate: animal.birthDate, identificationNumber: animal.identificationNumber, lofNumber: animal.lofNumber, coatColor: animal.coatColor, pedigreeUrl: animal.pedigreeUrl, birthOrder: animal.birthOrder, birthWeightGrams: animal.birthWeightGrams, collarColor: animal.collarColor, notes: animal.notes, createdAt: animal.createdAt, updatedAt: animal.updatedAt }} litter={props.litter} mother={props.mother} father={props.father} owner={props.owner} reservation={props.reservation} attention={props.attention} recentActivity={props.recentActivity} onOpenTab={openTab} /> : null}
        {props.initialTab === "health" ? <AnimalHealthSection notes={props.healthNotes} events={props.healthEvents} documents={props.healthDocuments} onAdd={<HealthEventDialog animalId={animal.id} />} onDocuments={() => openTab("documents")} /> : null}
        {props.initialTab === "reproduction" ? <AnimalReproductionSection animalId={animal.id} sex={animal.sex} female={props.femaleSummary} male={props.maleSummary} litters={props.reproductionLitters} /> : null}
        {props.initialTab === "documents" ? <AnimalDocumentsSection documents={props.documents} /> : null}
        {props.initialTab === "history" ? <AnimalHistoryTab entries={props.history} hasError={props.historyHasError} /> : null}
      </section>
    </div>
  </main>;
}
