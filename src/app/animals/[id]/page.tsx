import Link from "next/link";
import { redirect } from "next/navigation";

import { buildAnimalHistory } from "@/features/animals/animal-history-model";
import {
  buildFemaleReproductionSummary,
  buildMaleReproductionSummary,
  getRecentAnimalActivity,
  isAnimalHealthEventType,
  normalizeAnimalProfileTab,
  projectAnimalAttentionPoints,
} from "@/features/animals/animal-profile-model";
import {
  AnimalProfileView,
  type AnimalProfileViewProps,
} from "@/features/animals/animal-profile-view";
import type {
  AnimalProfileDocument,
  AnimalProfileEvent,
  AnimalProfileNote,
} from "@/features/animals/animal-profile-sections";
import {
  listProgesteroneMeasurementsForCycle,
  listReproductiveCycleMatingsForCycle,
  listReproductiveCyclesForMother,
} from "@/features/reproduction/reproductive-cycles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnimalRow = {
  id: string;
  organization_id: string;
  call_name: string | null;
  official_name: string | null;
  species: string;
  breed: string;
  sex: string;
  status: string;
  ownership_status: string;
  birth_date: string | null;
  death_date: string | null;
  litter_id: string | null;
  mother_id: string | null;
  father_id: string | null;
  identification_number: string | null;
  lof_number: string | null;
  coat_color: string | null;
  pedigree_url: string | null;
  birth_order: number | null;
  birth_weight_grams: number | null;
  collar_color_current: string | null;
  notes: string | null;
  is_breeder: boolean;
  is_external: boolean;
  is_retired: boolean;
  created_at: string;
  updated_at: string;
};

type HistoryDocument = AnimalProfileDocument & {
  updated_at: string | null;
  sent_at: string | null;
  received_at: string | null;
  signed_at: string | null;
  signature_required: boolean;
};

type HistoryNote = AnimalProfileNote & {
  visibility: string;
  created_by: string | null;
  profiles: { display_name: string | null } | null;
};

function unavailable() {
  return <main className="mx-auto max-w-3xl px-6 py-16"><section className="rounded-xl border border-dashed p-10 text-center"><h1 className="text-2xl font-semibold">Animal introuvable ou inaccessible</h1><p className="mt-3 text-sm text-muted">Cette fiche n’existe pas ou vous n’êtes pas autorisé à la consulter.</p><Link href="/animals" className="mt-6 inline-flex text-sm font-semibold text-accent hover:underline">Retour aux animaux</Link></section></main>;
}

function buildMessages(query: Record<string, string | undefined>): AnimalProfileViewProps["messages"] {
  const messages: AnimalProfileViewProps["messages"] = [];
  const add = (key: string, success: string, failure: string) => {
    if (!query[key]) return;
    messages.push(query[key] === "success" ? { tone: "success", text: success } : { tone: "error", text: failure });
  };
  add("identity_status", "Les informations de l’animal ont été mises à jour.", "Impossible de modifier les informations de l’animal.");
  add("final_identity_status", "L’identité définitive a été mise à jour.", "Impossible de mettre à jour l’identité définitive.");
  add("health_event_status", "L’événement santé a été ajouté.", "Impossible d’ajouter l’événement santé.");
  add("home_breeder_promotion_status", "L’animal est maintenant reproductrice maison.", "Impossible de promouvoir cet animal.");
  add("keep_at_kennel_status", "L’animal est maintenant gardé à l’élevage.", "Impossible de garder cet animal à l’élevage.");
  add("make_available_status", "L’animal est maintenant disponible.", "Impossible de remettre cet animal disponible.");
  add("availability_status", "La disponibilité a été mise à jour.", "Impossible de modifier la disponibilité.");
  return messages;
}

function isHealthDocument(document: HistoryDocument) {
  const value = `${document.document_type} ${document.title}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ["health", "sante", "medical", "veterin", "vaccin", "radio", "xray", "adn"].some((keyword) => value.includes(keyword));
}

export default async function AnimalDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const animalResult = await supabase.from("animals").select("id, organization_id, call_name, official_name, species, breed, sex, status, ownership_status, birth_date, death_date, litter_id, mother_id, father_id, identification_number, lof_number, coat_color, pedigree_url, birth_order, birth_weight_grams, collar_color_current, notes, is_breeder, is_external, is_retired, created_at, updated_at").eq("id", id).is("deleted_at", null).maybeSingle();
  const animal = animalResult.data as AnimalRow | null;
  if (animalResult.error || !animal) return unavailable();

  const membershipResult = await supabase.from("memberships").select("organization_id, role").eq("organization_id", animal.organization_id).eq("profile_id", user.id).eq("status", "active").is("deleted_at", null).maybeSingle();
  if (membershipResult.error || !membershipResult.data) return unavailable();

  const parentIds = [animal.mother_id, animal.father_id].filter((value): value is string => Boolean(value));
  const [litterResult, parentsResult, photoResult, documentsResult, eventsResult, notesResult, reservationResult, reproductionLittersResult] = await Promise.all([
    animal.litter_id ? supabase.from("litters").select("id, name").eq("id", animal.litter_id).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null, error: null }),
    parentIds.length ? supabase.from("animals").select("id, call_name, official_name").in("id", parentIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
    supabase.from("media").select("id, file_path, width_px, height_px").eq("animal_id", id).eq("is_primary", true).is("deleted_at", null).maybeSingle(),
    supabase.from("documents").select("id, title, document_type, status, created_at, updated_at, sent_at, received_at, signed_at, file_name, signature_required").eq("animal_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("events").select("id, title, description, event_type, status, priority, planned_at, planned_date, actual_at, created_at").eq("animal_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("notes").select("id, title, body, note_type, visibility, created_at, created_by, profiles!created_by(display_name)").eq("animal_id", id).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("reservation_overview").select("id, contact_id, contact_display_name, status, paid_cents, price_cents, currency").eq("animal_id", id).order("created_at", { ascending: false }).limit(1),
    supabase.from("litters").select("id, name, status, actual_birth_date, born_total_count, alive_count").eq(animal.sex === "female" ? "mother_id" : "father_id", id).is("deleted_at", null).order("actual_birth_date", { ascending: false }),
  ]);

  const primaryPhoto = photoResult.data as { id: string; file_path: string; width_px: number | null; height_px: number | null } | null;
  const signedPhoto = primaryPhoto ? await supabase.storage.from("animal-media").createSignedUrl(primaryPhoto.file_path, 3600) : { data: null, error: null };
  const documents = (documentsResult.data ?? []) as HistoryDocument[];
  const events = (eventsResult.data ?? []) as AnimalProfileEvent[];
  const notes = (notesResult.data ?? []) as unknown as HistoryNote[];
  const history = buildAnimalHistory({ events, notes, documents });
  const parents = new Map((parentsResult.data ?? []).map((parent) => [parent.id, { id: parent.id, name: parent.official_name?.trim() || parent.call_name?.trim() || "Animal sans nom" }]));
  const reservationRow = reservationResult.data?.[0] ?? null;
  const reproductionLitters = (reproductionLittersResult.data ?? []).map((litter) => ({ id: litter.id, name: litter.name, status: litter.status, actualBirthDate: litter.actual_birth_date, bornTotalCount: litter.born_total_count, aliveCount: litter.alive_count }));

  let femaleSummary: AnimalProfileViewProps["femaleSummary"] = null;
  let reproductionHasError = Boolean(reproductionLittersResult.error);
  if (animal.sex === "female") {
    const cyclesResult = await listReproductiveCyclesForMother({ motherId: animal.id });
    if (cyclesResult.outcome === "success") {
      const latestCycle = [...cyclesResult.cycles].sort((left, right) => right.startedOn.localeCompare(left.startedOn))[0] ?? null;
      const [measurementsResult, matingsResult] = latestCycle ? await Promise.all([listProgesteroneMeasurementsForCycle({ cycleId: latestCycle.id }), listReproductiveCycleMatingsForCycle({ cycleId: latestCycle.id })]) : [null, null];
      reproductionHasError = reproductionHasError || Boolean(
        measurementsResult?.outcome === "error" || matingsResult?.outcome === "error",
      );
      femaleSummary = buildFemaleReproductionSummary({
        cycles: cyclesResult.cycles.map((cycle) => ({ ...cycle, measurements: cycle.id === latestCycle?.id && measurementsResult?.outcome === "success" ? measurementsResult.measurements : [], matings: cycle.id === latestCycle?.id && matingsResult?.outcome === "success" ? matingsResult.matings : [] })),
        litters: reproductionLitters,
      });
    } else {
      reproductionHasError = true;
    }
  }
  const maleSummary = animal.sex === "male" ? buildMaleReproductionSummary(reproductionLitters) : null;
  const title = animal.official_name?.trim() || animal.call_name?.trim() || "Animal sans nom";

  return <AnimalProfileView
    initialTab={normalizeAnimalProfileTab(query.tab)}
    role={membershipResult.data.role}
    animal={{ id: animal.id, title, callName: animal.call_name, officialName: animal.official_name, species: animal.species, breed: animal.breed, sex: animal.sex, status: animal.status, ownershipStatus: animal.ownership_status, birthDate: animal.birth_date, deathDate: animal.death_date, litterId: animal.litter_id, identificationNumber: animal.identification_number, lofNumber: animal.lof_number, coatColor: animal.coat_color, pedigreeUrl: animal.pedigree_url, birthOrder: animal.birth_order, birthWeightGrams: animal.birth_weight_grams, collarColor: animal.collar_color_current, notes: animal.notes, isBreeder: animal.is_breeder, isExternal: animal.is_external, isRetired: animal.is_retired, createdAt: animal.created_at, updatedAt: animal.updated_at }}
    photo={{ id: primaryPhoto?.id ?? null, url: signedPhoto.data?.signedUrl ?? null, filePath: primaryPhoto?.file_path ?? null, width: primaryPhoto?.width_px ?? null, height: primaryPhoto?.height_px ?? null, unavailable: Boolean(photoResult.error || (primaryPhoto && (signedPhoto.error || !signedPhoto.data?.signedUrl))) }}
    litter={litterResult.data ? { id: litterResult.data.id, name: litterResult.data.name } : null}
    mother={animal.mother_id ? parents.get(animal.mother_id) ?? null : null}
    father={animal.father_id ? parents.get(animal.father_id) ?? null : null}
    owner={reservationRow ? { id: reservationRow.contact_id, name: reservationRow.contact_display_name } : null}
    reservation={reservationRow?.id ? { id: reservationRow.id, status: reservationRow.status ?? "unknown", paidCents: reservationRow.paid_cents ?? 0, priceCents: reservationRow.price_cents, currency: reservationRow.currency ?? "EUR" } : null}
    attention={projectAnimalAttentionPoints({ now: new Date().toISOString(), events: events.map((event) => ({ id: event.id, title: event.title, eventType: event.event_type, status: event.status, priority: event.priority, plannedAt: event.planned_at, plannedDate: event.planned_date })), identity: { kennelBorn: Boolean(animal.litter_id), status: animal.status, identificationNumber: animal.identification_number, officialName: animal.official_name } })}
    recentActivity={getRecentAnimalActivity(history.entries)}
    healthNotes={notes.filter((note) => note.note_type === "health")}
    healthEvents={events.filter((event) => isAnimalHealthEventType(event.event_type))}
    healthDocuments={documents.filter(isHealthDocument)}
    documents={documents}
    history={history.entries}
    historyHasError={Boolean(documentsResult.error || eventsResult.error || notesResult.error)}
    femaleSummary={femaleSummary}
    maleSummary={maleSummary}
    reproductionLitters={reproductionLitters}
    errors={{
      health: Boolean(documentsResult.error || eventsResult.error || notesResult.error),
      documents: Boolean(documentsResult.error),
      reproduction: reproductionHasError,
      situation: Boolean(litterResult.error || parentsResult.error || reservationResult.error),
    }}
    messages={buildMessages(query)}
  />;
}