import Link from "next/link";

import { formatApplicationDate } from "@/features/applications/formatters";
import { getContactRoleLabel } from "@/features/contacts/formatters";
import type { ContactOverview } from "@/features/contacts/types";

function renderRoles(activeRoles: string[] | string | null | undefined) {
  if (!activeRoles) {
    return <span className="text-xs text-muted">Non attribué</span>;
  }

  const rolesArray = Array.isArray(activeRoles)
    ? activeRoles
    : typeof activeRoles === "string"
      ? [activeRoles]
      : [];

  if (rolesArray.length === 0) {
    return <span className="text-xs text-muted">Non attribué</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {rolesArray.map((role, idx) => (
        <span
          key={idx}
          className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent"
        >
          {getContactRoleLabel(role)}
        </span>
      ))}
    </div>
  );
}

export function ContactList({ contacts }: { contacts: ContactOverview[] }) {
  if (contacts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-surface px-6 py-16 text-center">
        <p className="text-lg font-semibold">Aucun contact trouvé</p>
        <p className="mt-2 text-sm text-muted">
          Les fiches contacts apparaîtront ici dès qu’une candidature sera soumise.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-left text-sm">
          <thead className="border-b bg-background text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-5 py-4">Nom</th>
              <th className="px-5 py-4">Coordonnées</th>
              <th className="px-5 py-4">Rôles actifs</th>
              <th className="px-5 py-4">Créé le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contacts.map((contact, index) => {
              return (
                <tr key={contact.id ?? index}>
                  <td className="px-5 py-5 align-top font-medium">
                    <div className="flex flex-col items-start gap-1.5">
                      <span>{contact.display_name ?? "Nom non renseigné"}</span>
                      {contact.id ? (
                        <Link
                          href={`/contacts/${contact.id}`}
                          aria-label={`Ouvrir le contact ${
                            contact.display_name ?? ""
                          }`}
                          className="inline-flex rounded-md border border-border px-2.5 py-1 text-xs font-semibold leading-none text-accent transition hover:border-accent hover:bg-accent-soft"
                        >
                          Fiche
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-5 align-top">
                    <div>{contact.email ?? "Email non renseigné"}</div>
                    <div className="mt-1 text-muted">
                      {contact.phone ?? "Téléphone non renseigné"}
                    </div>
                  </td>
                  <td className="px-5 py-5 align-top">
                    {renderRoles(contact.active_roles)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-5 align-top text-muted">
                    {formatApplicationDate(contact.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
