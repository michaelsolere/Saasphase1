"use client";

import {
  createAnimalHealthEvent,
  keepAnimalAtKennel,
  makeKeptAnimalAvailable,
  promoteAnimalToHomeBreeder,
  updateAnimalFinalIdentity,
  updateProducedOffspringAvailability,
} from "./actions";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const inputClass = "mt-2 min-h-10 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent";
const triggerClass = "inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const primaryClass = "inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white";

export function FinalIdentityDialog({ animal }: { animal: { id: string; identificationNumber: string | null; officialName: string | null; callName: string | null; lofNumber: string | null } }) {
  return <Dialog><DialogTrigger asChild><button id="animal-final-identity-trigger" type="button" className={triggerClass}>Identité définitive</button></DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Renseigner l’identité définitive</DialogTitle><DialogDescription>Complétez les informations utiles avant le départ, sans modifier les données de portée.</DialogDescription></DialogHeader><form action={updateAnimalFinalIdentity} className="space-y-4"><input type="hidden" name="animal_id" value={animal.id} /><TextField id="final-identification" name="identification_number" label="Numéro d’identification" defaultValue={animal.identificationNumber} /><TextField id="final-official-name" name="official_name" label="Nom complet" defaultValue={animal.officialName} /><TextField id="final-call-name" name="call_name" label="Nom d’usage" defaultValue={animal.callName} /><TextField id="final-lof-number" name="lof_number" label="Numéro LOF" defaultValue={animal.lofNumber} /><DialogFooter><DialogClose asChild><button type="button" className={triggerClass}>Annuler</button></DialogClose><button type="submit" className={primaryClass}>Enregistrer l’identité</button></DialogFooter></form></DialogContent></Dialog>;
}

function TextField({ id, name, label, defaultValue }: { id: string; name: string; label: string; defaultValue: string | null }) { return <div><label htmlFor={id} className="text-sm font-semibold">{label}</label><input id={id} name={name} defaultValue={defaultValue ?? ""} className={inputClass} /></div>; }

export function HealthEventDialog({ animalId }: { animalId: string }) {
  return <Dialog><DialogTrigger asChild><button type="button" className={primaryClass}>Ajouter un événement santé</button></DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>Ajouter un événement santé</DialogTitle><DialogDescription>L’événement sera ajouté au suivi Santé et à l’Historique unifié.</DialogDescription></DialogHeader><form action={createAnimalHealthEvent} className="space-y-4"><input type="hidden" name="animal_id" value={animalId} /><TextField id="health-title" name="title" label="Titre" defaultValue={null} /><div><label htmlFor="health-date" className="text-sm font-semibold">Date prévue ou réelle</label><input id="health-date" name="planned_date" type="date" required className={inputClass} /></div><div className="grid gap-4 sm:grid-cols-2"><SelectField id="health-type" name="event_type" label="Type" defaultValue="vaccination" options={[["vaccination","Vaccination"],["xray","Radiographie"],["ultrasound","Échographie"],["pregnancy_check","Contrôle de gestation"],["health_other","Autre événement de santé"]]} /><SelectField id="health-status" name="status" label="Statut" defaultValue="planned" options={[["planned","Planifié"],["todo","À faire"],["in_progress","En cours"],["done","Fait"],["late","En retard"],["cancelled","Annulé"],["postponed","Reporté"],["not_applicable","Sans objet"]]} /><SelectField id="health-priority" name="priority" label="Priorité" defaultValue="normal" options={[["low","Basse"],["normal","Normale"],["high","Haute"],["urgent","Urgente"]]} /><label className="mt-7 flex min-h-10 items-center gap-3 rounded-lg border px-3 text-sm"><input name="is_task" type="checkbox" /> Marquer comme tâche</label></div><div><label htmlFor="health-description" className="text-sm font-semibold">Note</label><textarea id="health-description" name="description" rows={4} maxLength={2000} className={inputClass} /></div><DialogFooter><DialogClose asChild><button type="button" className={triggerClass}>Annuler</button></DialogClose><button type="submit" className={primaryClass}>Ajouter l’événement</button></DialogFooter></form></DialogContent></Dialog>;
}

function SelectField({ id, name, label, defaultValue, options }: { id: string; name: string; label: string; defaultValue: string; options: readonly (readonly [string, string])[] }) { return <div><label htmlFor={id} className="text-sm font-semibold">{label}</label><select id={id} name={name} defaultValue={defaultValue} className={inputClass}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>; }

function ConfirmationDialog({ trigger, title, description, action, animalId, confirmName, submitLabel, children }: { trigger: string; title: string; description: string; action: (formData: FormData) => void | Promise<void>; animalId: string; confirmName?: string; submitLabel: string; children?: React.ReactNode }) {
  return <Dialog><DialogTrigger asChild><button type="button" className={triggerClass}>{trigger}</button></DialogTrigger><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><form action={action} className="space-y-4"><input type="hidden" name="animal_id" value={animalId} />{children}{confirmName ? <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm leading-6"><input className="mt-1" type="checkbox" name={confirmName} value="yes" required /> Je confirme cette décision et ses conséquences sur le parcours de l’animal.</label> : null}<DialogFooter><DialogClose asChild><button type="button" className={triggerClass}>Annuler</button></DialogClose><button type="submit" className={primaryClass}>{submitLabel}</button></DialogFooter></form></DialogContent></Dialog>;
}

export function KeepAtKennelDialog({ animalId }: { animalId: string }) { return <ConfirmationDialog trigger="Garder à l’élevage" title="Garder cet animal à l’élevage" description="L’animal sortira de la logique disponible et réservable. Il ne sera pas promu reproducteur automatiquement." action={keepAnimalAtKennel} animalId={animalId} confirmName="confirm_keep_at_kennel" submitLabel="Garder à l’élevage" />; }
export function MakeAvailableDialog({ animalId }: { animalId: string }) { return <ConfirmationDialog trigger="Remettre disponible" title="Remettre cet animal disponible" description="L’animal pourra de nouveau être proposé ou attribué si aucune réservation active ne le bloque." action={makeKeptAnimalAvailable} animalId={animalId} confirmName="confirm_make_available" submitLabel="Remettre disponible" />; }
export function PromoteBreederDialog({ animalId }: { animalId: string }) { return <ConfirmationDialog trigger="Promouvoir en reproductrice" title="Promouvoir en reproductrice maison" description="Cette décision suppose que les justificatifs nécessaires ont été contrôlés manuellement." action={promoteAnimalToHomeBreeder} animalId={animalId} confirmName="confirm_home_breeder_promotion" submitLabel="Promouvoir en reproductrice" />; }
export function AvailabilityDialog({ animalId, currentStatus }: { animalId: string; currentStatus: string }) { return <ConfirmationDialog trigger="Changer la disponibilité" title="Changer la disponibilité" description="Choisissez le statut opérationnel de cet animal né à l’élevage." action={updateProducedOffspringAvailability} animalId={animalId} submitLabel="Mettre à jour"><SelectField id="animal-availability" name="next_status" label="Statut" defaultValue={currentStatus} options={[["born","Né"],["available","Disponible"]]} /></ConfirmationDialog>; }
