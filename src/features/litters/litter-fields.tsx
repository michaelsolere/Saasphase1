import { formatLitterDate } from "./formatters";

export type LitterGroupOption = {
  id: string;
  name: string | null;
  species: string | null;
  status: string | null;
  expected_period_start: string | null;
  expected_period_end: string | null;
};

export type LitterAnimalOption = {
  id: string;
  call_name: string | null;
  official_name: string | null;
  sex: string | null;
  species: string | null;
  breed: string | null;
  status: string | null;
  ownership_status: string | null;
  is_breeder: boolean | null;
  is_external: boolean | null;
  is_retired: boolean | null;
  litter_id: string | null;
  deleted_at?: string | null;
};

export type LitterFieldDefaults = {
  name?: string | null;
  species?: string | null;
  breed?: string | null;
  status?: string | null;
  litterGroupId?: string | null;
  motherId?: string | null;
  fatherId?: string | null;
  matingDate?: string | null;
  matingDate2?: string | null;
  estimatedOvulationDate?: string | null;
  expectedBirthDate?: string | null;
  actualBirthDate?: string | null;
  notes?: string | null;
};

export const litterStatusOptions = [
  ["planned", "Planifiée"],
  ["mating_done", "Saillie effectuée"],
  ["pregnancy_unconfirmed", "Gestation à confirmer"],
  ["pregnancy_confirmed", "Gestation confirmée"],
  ["not_pregnant", "Non gestante"],
  ["pregnancy_lost", "Gestation interrompue"],
  ["birth_expected", "Naissance attendue"],
  ["birth_in_progress", "Naissance en cours"],
  ["born", "Née"],
  ["puppies_created", "Animaux créés"],
  ["choice_period", "Période de choix"],
  ["ready_to_leave", "Prête au départ"],
  ["closed", "Clôturée"],
  ["cancelled", "Annulée"],
  ["archived", "Archivée"],
] as const;

export const litterSpeciesOptions = [
  ["dog", "Chien"],
  ["cat", "Chat"],
] as const;

function speciesLabel(value: string | null) {
  if (value === "dog") return "Chien";
  if (value === "cat") return "Chat";
  return value ?? "Espèce inconnue";
}

function sexLabel(value: string | null) {
  if (value === "male") return "Mâle";
  if (value === "female") return "Femelle";
  return "Sexe inconnu";
}

function groupOptionLabel(group: LitterGroupOption) {
  const parts = [group.name ?? "Groupe sans nom", speciesLabel(group.species)];
  if (group.expected_period_start || group.expected_period_end) {
    const start = group.expected_period_start
      ? formatLitterDate(group.expected_period_start)
      : "?";
    const end = group.expected_period_end
      ? formatLitterDate(group.expected_period_end)
      : "?";
    parts.push(`${start} – ${end}`);
  }
  return parts.join(" · ");
}

function animalOptionLabel(animal: LitterAnimalOption) {
  const parts = [
    animal.call_name ?? animal.official_name ?? "Animal sans nom",
    sexLabel(animal.sex),
  ];
  const speciesBreed = [speciesLabel(animal.species), animal.breed]
    .filter(Boolean)
    .join(" / ");
  if (speciesBreed) {
    parts.push(speciesBreed);
  }
  return parts.join(" · ");
}

const inputClass =
  "mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none";
const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-muted";

/**
 * Jeu de champs partagé entre la création (/litters/new) et l'édition
 * (/litters/[id]) d'une portée. Garantit des labels, statuts et valeurs par
 * défaut cohérents entre les deux flux.
 *
 * Le select de groupe n'est rendu que si `groups` est fourni : la fiche portée
 * gère le rattachement au groupe via une section dédiée distincte.
 */
export function LitterFields({
  idPrefix,
  defaults,
  groups,
  motherOptions,
  fatherOptions,
}: {
  idPrefix: string;
  defaults?: LitterFieldDefaults;
  groups?: LitterGroupOption[] | null;
  motherOptions: LitterAnimalOption[];
  fatherOptions: LitterAnimalOption[];
}) {
  const values = defaults ?? {};

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-name`} className={labelClass}>
          Nom de la portée <span className="text-accent">*</span>
        </label>
        <input
          id={`${idPrefix}-name`}
          name="name"
          type="text"
          required
          defaultValue={values.name ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-species`} className={labelClass}>
          Espèce
        </label>
        <select
          id={`${idPrefix}-species`}
          name="species"
          defaultValue={values.species ?? "dog"}
          className={inputClass}
        >
          {litterSpeciesOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-breed`} className={labelClass}>
          Race
        </label>
        <input
          id={`${idPrefix}-breed`}
          name="breed"
          type="text"
          defaultValue={values.breed ?? "Golden Retriever"}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-status`} className={labelClass}>
          Statut
        </label>
        <select
          id={`${idPrefix}-status`}
          name="status"
          defaultValue={values.status ?? "planned"}
          className={inputClass}
        >
          {litterStatusOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {groups ? (
        <div>
          <label htmlFor={`${idPrefix}-group`} className={labelClass}>
            Groupe de portées
          </label>
          <select
            id={`${idPrefix}-group`}
            name="litter_group_id"
            defaultValue={values.litterGroupId ?? ""}
            className={inputClass}
          >
            <option value="">Aucun groupe</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {groupOptionLabel(group)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor={`${idPrefix}-mother`} className={labelClass}>
          Mère
        </label>
        <select
          id={`${idPrefix}-mother`}
          name="mother_id"
          defaultValue={values.motherId ?? ""}
          className={inputClass}
        >
          <option value="">Aucune mère</option>
          {motherOptions.map((animal) => (
            <option key={animal.id} value={animal.id}>
              {animalOptionLabel(animal)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-father`} className={labelClass}>
          Père
        </label>
        <select
          id={`${idPrefix}-father`}
          name="father_id"
          defaultValue={values.fatherId ?? ""}
          className={inputClass}
        >
          <option value="">Aucun père</option>
          {fatherOptions.map((animal) => (
            <option key={animal.id} value={animal.id}>
              {animalOptionLabel(animal)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-mating-date`} className={labelClass}>
          Date de saillie
        </label>
        <input
          id={`${idPrefix}-mating-date`}
          name="mating_date"
          type="date"
          defaultValue={values.matingDate ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-mating-date-2`} className={labelClass}>
          Deuxième date de saillie
        </label>
        <input
          id={`${idPrefix}-mating-date-2`}
          name="mating_date_2"
          type="date"
          defaultValue={values.matingDate2 ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-ovulation-date`} className={labelClass}>
          Date d’ovulation estimée
        </label>
        <input
          id={`${idPrefix}-ovulation-date`}
          name="estimated_ovulation_date"
          type="date"
          defaultValue={values.estimatedOvulationDate ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-expected-birth-date`} className={labelClass}>
          Naissance prévue
        </label>
        <input
          id={`${idPrefix}-expected-birth-date`}
          name="expected_birth_date"
          type="date"
          defaultValue={values.expectedBirthDate ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-actual-birth-date`} className={labelClass}>
          Naissance réelle
        </label>
        <input
          id={`${idPrefix}-actual-birth-date`}
          name="actual_birth_date"
          type="date"
          defaultValue={values.actualBirthDate ?? ""}
          className={inputClass}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-notes`} className={labelClass}>
          Notes
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          name="notes"
          rows={4}
          defaultValue={values.notes ?? ""}
          className={inputClass}
        />
      </div>
    </div>
  );
}
