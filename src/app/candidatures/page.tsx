import Link from "next/link";
import { redirect } from "next/navigation";

import { ApplicationList } from "@/features/applications/application-list";
import type { ApplicationFilter } from "@/features/applications/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const filters = [
  {
    value: "to_validate",
    label: "À valider",
    href: "/candidatures",
  },
  {
    value: "validated",
    label: "Validées",
    href: "/candidatures?filtre=validees",
  },
  {
    value: "unsuccessful",
    label: "Non abouties",
    href: "/candidatures?filtre=non-abouties",
  },
  {
    value: "all",
    label: "Toutes",
    href: "/candidatures?filtre=toutes",
  },
] satisfies Array<{
  value: ApplicationFilter;
  label: string;
  href: string;
}>;

const toValidateStatuses = ["new", "to_review", "to_call"];

function getDecisionPreview(value: string | null) {
  if (!value) {
    return null;
  }

  const reasonMatch = value.match(/Raison\s*:\s*([\s\S]+)/);
  const decision = (reasonMatch?.[1] ?? value).replace(/\s+/g, " ").trim();

  if (!decision) {
    return null;
  }

  return decision.length > 110 ? `${decision.slice(0, 107).trimEnd()}…` : decision;
}

function getApplicationFilter(value: string | undefined): ApplicationFilter {
  if (value === "validees") {
    return "validated";
  }

  if (value === "non-abouties") {
    return "unsuccessful";
  }

  if (value === "toutes") {
    return "all";
  }

  return "to_validate";
}

function ErrorMessage() {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-10 text-center text-amber-950"
    >
      <p className="font-semibold">Impossible de charger les candidatures</p>
      <p className="mt-2 text-sm">
        Réessayez dans quelques instants. Aucune donnée n’a été modifiée.
      </p>
    </div>
  );
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    connexion?: string;
    erreur?: string;
    filtre?: string;
  }>;
}) {
  const params = await searchParams;
  const filter = getApplicationFilter(params.filtre);
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let applications = null;
  let hasLoadingError = Boolean(authError);

  let query = supabase
    .from("application_overview")
    .select(
      "id, contact_id, contact_display_name, contact_email, contact_phone, desired_sex_preference, project_description, status, public_form_name, public_form_slug, submitted_at, created_at",
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (filter === "to_validate") {
    query = query.in("status", toValidateStatuses);
  } else if (filter === "validated") {
    query = query.in("status", ["qualified", "waiting_litter"]);
  } else if (filter === "unsuccessful") {
    query = query.in("status", ["rejected", "withdrawn", "archived"]);
  }

  const result = await query;
  applications = result.data;
  hasLoadingError = hasLoadingError || Boolean(result.error);

  if (applications && applications.length > 0) {
    const applicationIds = applications
      .map((application) => application.id)
      .filter((id): id is string => Boolean(id));

    if (applicationIds.length > 0) {
      const { data: decisionNotes, error: decisionNotesError } = await supabase
        .from("notes")
        .select("application_id, body, created_at")
        .in("application_id", applicationIds)
        .eq("note_type", "decision")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      hasLoadingError = hasLoadingError || Boolean(decisionNotesError);

      if (decisionNotes) {
        const decisionPreviewByApplication = new Map<string, string>();

        decisionNotes.forEach((note) => {
          if (!note.application_id || decisionPreviewByApplication.has(note.application_id)) {
            return;
          }

          const preview = getDecisionPreview(note.body);

          if (preview) {
            decisionPreviewByApplication.set(note.application_id, preview);
          }
        });

        applications = applications.map((application) => ({
          ...application,
          decision_note_preview: application.id
            ? decisionPreviewByApplication.get(application.id) ?? null
            : null,
        }));
      }
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-10 sm:px-10 lg:px-12">
      <header className="border-b pb-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">
              Espace privé · Aperçu
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Candidats
            </h1>
            <p className="mt-3 max-w-2xl leading-7 text-muted">
              Candidatures reçues avant entrée dans un parcours adoptant.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="w-fit rounded-full border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
              Lecture seule
            </span>
          </div>
        </div>
      </header>

      <section className="py-8">
        {params.connexion === "success" ? (
          <p
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          >
            Connexion réussie.
          </p>
        ) : null}

        {params.erreur === "logout" ? (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            La déconnexion n’a pas abouti. Réessayez.
          </p>
        ) : null}

        {hasLoadingError || !applications ? (
          <ErrorMessage />
        ) : (
          <>
            <nav
              aria-label="Filtrer les candidatures"
              className="mb-5 flex w-fit gap-1 rounded-xl border bg-surface p-1"
            >
              {filters.map((candidateFilter) => (
                <Link
                  key={candidateFilter.value}
                  href={candidateFilter.href}
                  aria-current={
                    filter === candidateFilter.value ? "page" : undefined
                  }
                  className={
                    filter === candidateFilter.value
                      ? "rounded-lg bg-accent px-4 py-2 text-sm font-semibold !text-white hover:!text-white"
                      : "rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-background"
                  }
                >
                  {candidateFilter.label}
                </Link>
              ))}
            </nav>
            <ApplicationList applications={applications} filter={filter} />
          </>
        )}
      </section>
    </main>
  );
}
