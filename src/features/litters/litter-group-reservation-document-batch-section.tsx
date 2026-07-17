import { randomUUID } from "node:crypto";

import { getDocumentStatusLabel } from "@/features/documents/formatters";
import {
  classifyLitterGroupDocumentBatchReservations,
} from "@/features/documents/litter-group-reservation-document-batch-plan-core";
import { isReservationDocumentTemplateCompatible } from "@/features/documents/reservation-document-template-compatibility";
import { generateLitterGroupReservationDocumentsBatchAction } from "@/features/litters/litter-group-reservation-document-batch-action";
import { LitterGroupReservationDocumentBatchPanel } from "@/features/litters/litter-group-reservation-document-batch-panel";
import { createClient } from "@/lib/supabase/server";

const WRITABLE_ROLES = new Set(["owner", "admin", "member"]);
const DOCUMENT_TYPES = ["commitment_certificate", "reservation_contract"] as const;

function UnavailableMessage() {
  return <p role="alert" className="text-sm text-amber-800">La génération groupée n’est pas disponible pour le moment. Aucune donnée n’a été modifiée.</p>;
}

function documentStateLabel(statuses: string[]) {
  if (statuses.length === 0) return "Absent";
  if (statuses.length > 1) return "État incohérent";
  return getDocumentStatusLabel(statuses[0]);
}

function disabledReason(state: string) {
  if (state === "group_only") return "Une portée précise doit être attribuée avant la génération.";
  if (["reservation_group_mismatch", "litter_outside_group", "litter_missing_or_deleted", "organization_mismatch"].includes(state)) return "Le rattachement de ce dossier doit être vérifié avant la génération.";
  if (state === "missing_taxonomy") return "La taxonomie documentaire doit être complétée.";
  if (state === "kernel_pre_ineligible") return "Ce dossier ne remplit pas les conditions préalables.";
  return "Ce dossier n’est pas disponible pour la génération.";
}

export async function LitterGroupReservationDocumentBatchSection({
  litterGroupId,
}: {
  litterGroupId: string;
}) {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  const shell = (content: React.ReactNode) => <section id="generation-documents-groupes" className="rounded-2xl border bg-surface p-6 sm:p-8"><h2 className="text-xl font-semibold">Génération groupée des documents</h2><div className="mt-5">{content}</div></section>;

  if (auth.error || !auth.data.user) return shell(<UnavailableMessage />);

  const groupResult = await supabase
    .from("litter_groups")
    .select("id, organization_id")
    .eq("id", litterGroupId)
    .is("deleted_at", null)
    .maybeSingle();
  if (groupResult.error || !groupResult.data) return shell(<UnavailableMessage />);
  const group = groupResult.data;

  const membershipResult = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", group.organization_id)
    .eq("profile_id", auth.data.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (membershipResult.error || !membershipResult.data) return shell(<UnavailableMessage />);
  const canGenerate = WRITABLE_ROLES.has(membershipResult.data.role);

  // Les portées supprimées restent relues : elles sont nécessaires à la
  // classification neutre des rattachements historiques.
  const littersResult = await supabase
    .from("litters")
    .select("id, organization_id, litter_group_id, species, breed, deleted_at, name")
    .eq("organization_id", group.organization_id)
    .eq("litter_group_id", group.id);
  if (littersResult.error) return shell(<UnavailableMessage />);
  const litters = littersResult.data ?? [];
  const litterIds = litters.map((litter) => litter.id);

  const reservationsResult = litterIds.length
    ? await supabase
        .from("reservations")
        .select("id, organization_id, litter_id, litter_group_id, status, contact_id, application_id, animal_id, created_at")
        .eq("organization_id", group.organization_id)
        .or(`litter_group_id.eq.${group.id},litter_id.in.(${litterIds.join(",")})`)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    : await supabase
        .from("reservations")
        .select("id, organization_id, litter_id, litter_group_id, status, contact_id, application_id, animal_id, created_at")
        .eq("organization_id", group.organization_id)
        .eq("litter_group_id", group.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
  if (reservationsResult.error) return shell(<UnavailableMessage />);
  const reservations = [...new Map((reservationsResult.data ?? []).map((reservation) => [reservation.id, reservation])).values()];
  const reservationLitterIds = [
    ...new Set(
      reservations
        .map((reservation) => reservation.litter_id)
        .filter((litterId): litterId is string => Boolean(litterId)),
    ),
  ];
  // Une réservation encore rattachée au groupe peut pointer vers une portée
  // déplacée ou supprimée. Il faut la relire elle aussi pour que le core puisse
  // produire la classe neutre correcte, sans jamais sortir de l'organisation.
  const exactLittersResult = reservationLitterIds.length
    ? await supabase
        .from("litters")
        .select("id, organization_id, litter_group_id, species, breed, deleted_at, name")
        .eq("organization_id", group.organization_id)
        .in("id", reservationLitterIds)
    : { data: [], error: null };
  if (exactLittersResult.error) return shell(<UnavailableMessage />);
  const classificationLitters = [
    ...new Map(
      [...litters, ...(exactLittersResult.data ?? [])].map((litter) => [
        litter.id,
        litter,
      ]),
    ).values(),
  ];
  const contactIds = [...new Set(reservations.map((item) => item.contact_id).filter((id): id is string => Boolean(id)))];
  const applicationIds = [...new Set(reservations.map((item) => item.application_id).filter((id): id is string => Boolean(id)))];
  const animalIds = [...new Set(reservations.map((item) => item.animal_id).filter((id): id is string => Boolean(id)))];
  const reservationIds = reservations.map((item) => item.id);

  const [contactsResult, applicationsResult, animalsResult, documentsResult, templatesResult] = await Promise.all([
    contactIds.length ? supabase.from("contacts").select("id, display_name").eq("organization_id", group.organization_id).in("id", contactIds).is("deleted_at", null) : Promise.resolve({ data: [], error: null }),
    applicationIds.length ? supabase.from("applications").select("id, organization_id, contact_id, species, breed, deleted_at").eq("organization_id", group.organization_id).in("id", applicationIds) : Promise.resolve({ data: [], error: null }),
    animalIds.length ? supabase.from("animals").select("id, organization_id, litter_id, species, breed, deleted_at").eq("organization_id", group.organization_id).in("id", animalIds) : Promise.resolve({ data: [], error: null }),
    reservationIds.length ? supabase.from("documents").select("reservation_id, document_type, status").eq("organization_id", group.organization_id).in("reservation_id", reservationIds).in("document_type", [...DOCUMENT_TYPES]).is("deleted_at", null).is("superseded_at", null) : Promise.resolve({ data: [], error: null }),
    supabase.from("document_templates").select("id, name, version, document_type, species, breed, template_format, is_active, lifecycle_status, deleted_at").eq("organization_id", group.organization_id).eq("is_active", true).eq("lifecycle_status", "published").is("deleted_at", null).in("document_type", [...DOCUMENT_TYPES]).order("name", { ascending: true }).order("version", { ascending: false }),
  ]);
  if (contactsResult.error || applicationsResult.error || animalsResult.error || documentsResult.error || templatesResult.error) return shell(<UnavailableMessage />);

  const applications = new Map((applicationsResult.data ?? []).map((item) => [item.id, item]));
  const animals = new Map((animalsResult.data ?? []).map((item) => [item.id, item]));
  const classifications = classifyLitterGroupDocumentBatchReservations({
    group: { id: group.id, organizationId: group.organization_id, deletedAt: null },
    litters: classificationLitters.map((item) => ({ id: item.id, organizationId: item.organization_id, litterGroupId: item.litter_group_id, species: item.species, breed: item.breed, deletedAt: item.deleted_at })),
    reservations: reservations.map((item) => {
      const application = item.application_id ? applications.get(item.application_id) : null;
      const animal = item.animal_id ? animals.get(item.animal_id) : null;
      return { id: item.id, organizationId: item.organization_id, litterId: item.litter_id, litterGroupId: item.litter_group_id, status: item.status, contactId: item.contact_id, applicationId: item.application_id, animalTaxonomy: animal && animal.deleted_at === null && animal.organization_id === group.organization_id && animal.litter_id === item.litter_id ? { species: animal.species, breed: animal.breed } : null, applicationTaxonomy: application && application.deleted_at === null && application.organization_id === group.organization_id && application.contact_id === item.contact_id ? { species: application.species, breed: application.breed } : null };
    }),
  });
  const classificationsById = new Map(classifications.map((item) => [item.reservationId, item]));
  const templates = templatesResult.data ?? [];
  const taxonomyGroups = new Map<string, { key: string; species: string; breed: string; commitmentTemplates: Array<{ id: string; name: string; version: number }>; contractTemplates: Array<{ id: string; name: string; version: number }> }>();
  for (const classification of classifications) {
    if (!classification.taxonomy || !classification.taxonomyKey) continue;
    if (taxonomyGroups.has(classification.taxonomyKey)) continue;
    const taxonomy = classification.taxonomy;
    taxonomyGroups.set(classification.taxonomyKey, {
      key: classification.taxonomyKey,
      species: taxonomy.species,
      breed: taxonomy.breed,
      commitmentTemplates: templates.filter((template) => isReservationDocumentTemplateCompatible({ template, documentType: "commitment_certificate", taxonomy })).filter((template) => template.document_type === "commitment_certificate").map(({ id, name, version }) => ({ id, name, version })),
      contractTemplates: templates.filter((template) => isReservationDocumentTemplateCompatible({ template, documentType: "reservation_contract", taxonomy })).filter((template) => template.document_type === "reservation_contract").map(({ id, name, version }) => ({ id, name, version })),
    });
  }
  const contactNames = new Map((contactsResult.data ?? []).map((item) => [item.id, item.display_name || "Contact non renseigné"]));
  const litterNames = new Map(classificationLitters.map((item) => [item.id, item.name || "Portée"]));
  const currentDocuments = documentsResult.data ?? [];
  const panelReservations = reservations.map((reservation) => {
    const classification = classificationsById.get(reservation.id);
    const taxonomyGroup = classification?.taxonomyKey ? taxonomyGroups.get(classification.taxonomyKey) : null;
    const modelsAvailable = Boolean(taxonomyGroup?.commitmentTemplates.length && taxonomyGroup?.contractTemplates.length);
    const documents = currentDocuments.filter((document) => document.reservation_id === reservation.id);
    return {
      id: reservation.id,
      contactName: contactNames.get(reservation.contact_id) ?? "Contact non renseigné",
      status: reservation.status,
      litterId: classification?.litterId ?? null,
      litterName: classification?.litterId ? litterNames.get(classification.litterId) ?? "Portée" : "Non attribuée",
      taxonomyKey: classification?.taxonomyKey ?? null,
      taxonomyLabel: classification?.taxonomy ? `${classification.taxonomy.species} — ${classification.taxonomy.breed}` : "Taxonomie non renseignée",
      selectable: Boolean(classification?.selectable && modelsAvailable),
      disabledReason: classification?.selectable && !modelsAvailable ? "Les deux modèles publiés compatibles doivent être disponibles." : disabledReason(classification?.state ?? ""),
      commitmentStatus: documentStateLabel(documents.filter((document) => document.document_type === "commitment_certificate").map((document) => document.status)),
      contractStatus: documentStateLabel(documents.filter((document) => document.document_type === "reservation_contract").map((document) => document.status)),
    };
  });

  if (!canGenerate) return shell(<LitterGroupReservationDocumentBatchPanel readOnly reservations={panelReservations} taxonomies={[...taxonomyGroups.values()]} />);
  const intention = { litterGroupId: group.id, operationId: randomUUID(), capturedAt: new Date().toISOString() };
  const action = generateLitterGroupReservationDocumentsBatchAction.bind(null, intention);
  return shell(<LitterGroupReservationDocumentBatchPanel litterGroupId={group.id} action={action} reservations={panelReservations} taxonomies={[...taxonomyGroups.values()]} />);
}
