export type AnimalParentOption = {
  id: string;
  call_name: string | null;
  official_name: string | null;
  sex: string | null;
};

export const animalSpeciesOptions = [
  ["dog", "Chien"],
  ["cat", "Chat"],
] as const;

export const animalSexOptions = [
  ["female", "Femelle"],
  ["male", "Mâle"],
  ["unknown", "Non renseigné"],
] as const;

export const manualAnimalStatusOptions = [
  ["active", "Actif"],
  ["retired", "Retraité"],
  ["archived", "Archivé"],
  ["deceased", "Décédé"],
  ["adopted", "Adopté"],
  ["kept", "Gardé à l’élevage"],
  ["available", "Disponible"],
  ["reserved", "Réservé"],
  ["planned", "Planifié"],
] as const;

export const manualAnimalOwnershipOptions = [
  ["owned", "Maison / détenu"],
  ["external_stud", "Étalon extérieur"],
  ["external_female", "Femelle extérieure"],
  ["co_owned", "Copropriété"],
  ["sold", "Vendu"],
  ["adopted_out", "Adopté hors élevage"],
  ["unknown", "Historique / origine inconnue"],
] as const;

const inputClass =
  "mt-2 w-full rounded-xl border bg-background px-4 py-3 text-sm focus:border-accent focus:outline-none";
const labelClass = "text-xs font-semibold uppercase tracking-wide text-muted";

function parentOptionLabel(animal: AnimalParentOption) {
  return animal.official_name ?? animal.call_name ?? "Animal sans nom";
}

function TextField({
  id,
  label,
  name,
  type = "text",
  required = false,
}: {
  id: string;
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label} {required ? <span className="text-accent">*</span> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        className={inputClass}
      />
    </div>
  );
}

export function AnimalFields({
  idPrefix,
  parentOptions,
}: {
  idPrefix: string;
  parentOptions: AnimalParentOption[];
}) {
  const motherOptions = parentOptions.filter((animal) => animal.sex === "female");
  const fatherOptions = parentOptions.filter((animal) => animal.sex === "male");
  const parentCount = motherOptions.length + fatherOptions.length;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <TextField
          id={`${idPrefix}-official-name`}
          label="Nom complet"
          name="official_name"
        />
      </div>

      <div className="sm:col-span-2">
        <TextField
          id={`${idPrefix}-call-name`}
          label="Nom d’usage"
          name="call_name"
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-species`} className={labelClass}>
          Espèce
        </label>
        <select
          id={`${idPrefix}-species`}
          name="species"
          defaultValue="dog"
          className={inputClass}
        >
          {animalSpeciesOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <TextField id={`${idPrefix}-breed`} label="Race" name="breed" />

      <div>
        <label htmlFor={`${idPrefix}-sex`} className={labelClass}>
          Sexe
        </label>
        <select
          id={`${idPrefix}-sex`}
          name="sex"
          defaultValue="unknown"
          className={inputClass}
        >
          {animalSexOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-status`} className={labelClass}>
          Statut
        </label>
        <select
          id={`${idPrefix}-status`}
          name="status"
          defaultValue="active"
          className={inputClass}
        >
          {manualAnimalStatusOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-ownership-status`} className={labelClass}>
          Origine
        </label>
        <select
          id={`${idPrefix}-ownership-status`}
          name="ownership_status"
          defaultValue="owned"
          className={inputClass}
        >
          {manualAnimalOwnershipOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs leading-5 text-muted">
          L’origine “Né à l’élevage” est réservée aux chiots/chatons créés
          depuis une fiche Portée.
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
        <input
          type="checkbox"
          name="is_breeder"
          value="yes"
          className="mt-1"
        />
        <span>
          <span className="font-semibold">Reproducteur maison</span>
          <span className="mt-1 block text-xs leading-5 text-muted">
            À cocher pour un reproducteur détenu par l’élevage. Pour un étalon
            ou une femelle extérieure, ce rôle est activé automatiquement.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
        <input
          type="checkbox"
          name="is_retired"
          value="yes"
          className="mt-1"
        />
        <span>
          <span className="font-semibold">Retraité</span>
          <span className="mt-1 block text-xs leading-5 text-muted">
            Si coché, le statut enregistré sera Retraité.
          </span>
        </span>
      </label>

      <TextField
        id={`${idPrefix}-birth-date`}
        label="Date de naissance"
        name="birth_date"
        type="date"
      />
      <TextField
        id={`${idPrefix}-identification`}
        label="Numéro d’identification"
        name="identification_number"
      />
      <div className="sm:col-span-2">
        <TextField
          id={`${idPrefix}-pedigree-url`}
          label="Lien vers la page SCC de l’animal"
          name="pedigree_url"
          type="url"
        />
      </div>
      <TextField
        id={`${idPrefix}-lof-number`}
        label="Numéro LOF"
        name="lof_number"
      />
      <TextField id={`${idPrefix}-coat-color`} label="Robe" name="coat_color" />

      <div>
        <label htmlFor={`${idPrefix}-mother`} className={labelClass}>
          Mère
        </label>
        <select
          id={`${idPrefix}-mother`}
          name="mother_id"
          defaultValue=""
          className={inputClass}
        >
          <option value="">Aucune mère</option>
          {motherOptions.map((animal) => (
            <option key={animal.id} value={animal.id}>
              {parentOptionLabel(animal)}
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
          defaultValue=""
          className={inputClass}
        >
          <option value="">Aucun père</option>
          {fatherOptions.map((animal) => (
            <option key={animal.id} value={animal.id}>
              {parentOptionLabel(animal)}
            </option>
          ))}
        </select>
      </div>

      {parentCount === 0 ? (
        <p className="sm:col-span-2 text-xs leading-5 text-muted">
          Aucun parent sélectionnable pour l’instant.
        </p>
      ) : (
        <p className="sm:col-span-2 text-xs leading-5 text-muted">
          {parentCount} parent
          {parentCount > 1 ? "s" : ""} disponible
          {parentCount > 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}
