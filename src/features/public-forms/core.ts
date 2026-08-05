export type PublicFormMembershipRole = "owner" | "admin" | "member" | "viewer" | string | null;

export type PublicFormDraft = {
  name: string;
  slug: string;
  title: string;
  description: string;
  successMessage: string;
  species: "dog";
  breed: string;
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reservedSlugParts = new Set(["admin", "api", "auth", "login", "settings", "supabase"]);

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function buildPublicApplicationPath(organizationSlug: string, formSlug: string) {
  return `/candidature/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(formSlug)}`;
}

export function getPublicFormCapabilities(role: PublicFormMembershipRole) {
  const canEdit = role === "owner" || role === "admin";
  return {
    canEdit,
    canPublish: canEdit,
    canShare: canEdit || role === "member",
  };
}

export function parsePublicFormDraft(input: {
  name: unknown;
  slug: unknown;
  title: unknown;
  description: unknown;
  successMessage: unknown;
  breed: unknown;
}): { ok: true; value: PublicFormDraft } | { ok: false; error: string } {
  const name = clean(input.name, 120);
  const slug = clean(input.slug, 80).toLowerCase();
  const title = clean(input.title, 160);
  const description = clean(input.description, 1_000);
  const successMessage = clean(input.successMessage, 500);
  const breed = clean(input.breed, 120) || "Golden Retriever";
  const slugParts = slug.split("-");

  if (!name || !title || description.length < 20 || successMessage.length < 20) {
    return { ok: false, error: "Les textes obligatoires sont incomplets." };
  }
  if (!slugPattern.test(slug) || slugParts.some((part) => reservedSlugParts.has(part))) {
    return { ok: false, error: "L’adresse publique n’est pas autorisée." };
  }

  return {
    ok: true,
    value: { name, slug, title, description, successMessage, species: "dog", breed },
  };
}
