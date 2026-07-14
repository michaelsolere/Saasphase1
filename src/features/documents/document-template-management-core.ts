import type { SupabaseClient } from "@supabase/supabase-js";

import {
  parseDocumentTemplateDefinition,
  type DocumentTemplateDefinition,
  type ParseDocumentTemplateDefinitionResult,
} from "./document-template-definitions";
import type { Database } from "@/types/database.types";

type Supabase = SupabaseClient<Database>;
type OrganizationRole = "owner" | "admin" | "member" | "viewer";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_ROLES: OrganizationRole[] = ["owner", "admin"];
const WRITABLE_ROLES: OrganizationRole[] = ["owner", "admin", "member"];

export type DocumentTemplateManagementErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "draft_already_exists"
  | "invalid_template"
  | "stale_draft"
  | "protected_family"
  | "database_error";

export type DocumentTemplateManagementError = {
  code: DocumentTemplateManagementErrorCode;
  message: string;
};

type ErrorResult = {
  outcome: "error";
  error: DocumentTemplateManagementError;
};

export type DocumentTemplateVersionSummary = {
  id: string;
  familyId: string;
  version: number;
  lifecycleStatus: string;
  templateFormat: string;
  templateContent: string | null;
  updatedAt: string;
  publishedAt: string | null;
};

export type DocumentTemplateFamilySummary = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  documentType: string;
  species: string;
  breed: string;
  updatedAt: string;
  draft: DocumentTemplateVersionSummary | null;
  publication: DocumentTemplateVersionSummary | null;
};

export type ListDocumentTemplateFamiliesResult =
  | {
      outcome: "success";
      role: OrganizationRole;
      families: DocumentTemplateFamilySummary[];
    }
  | ErrorResult;

export type CreateDocumentTemplateFamilyWithDraftInput = {
  organizationId: string;
  name: string;
  description: string | null;
  documentType: string;
  species: string;
  breed: string;
  templateFormat: string;
  templateContent: string;
};

export type CreateDocumentTemplateFamilyWithDraftResult =
  | {
      outcome: "success";
      familyId: string;
      templateId: string;
      version: number;
    }
  | ErrorResult;

export type UpdateDocumentTemplateFamilyMetadataInput = {
  organizationId: string;
  familyId: string;
  name: string;
  description: string | null;
};

export type UpdateDocumentTemplateFamilyMetadataResult =
  | {
      outcome: "success";
      familyId: string;
      name: string;
      description: string | null;
      updatedAt: string;
    }
  | ErrorResult;

export type CreateNextDocumentTemplateDraftInput = {
  organizationId: string;
  familyId: string;
};

export type CreateNextDocumentTemplateDraftResult =
  | {
      outcome: "success";
      templateId: string;
      version: number;
      updatedAt: string;
    }
  | ErrorResult;

export type SaveDocumentTemplateDraftInput = {
  organizationId: string;
  templateId: string;
  templateContent: string;
  expectedUpdatedAt: string;
};

export type SaveDocumentTemplateDraftResult =
  | {
      outcome: "success";
      templateId: string;
      updatedAt: string;
    }
  | ErrorResult;

export type ValidateDocumentTemplateDraftInput = {
  organizationId: string;
  templateId: string;
};

export type ValidateDocumentTemplateDraftResult =
  | {
      outcome: "success";
      templateId: string;
      definition: DocumentTemplateDefinition;
      updatedAt: string;
    }
  | ErrorResult;

export type PublishDocumentTemplateDraftInput = {
  organizationId: string;
  templateId: string;
};

export type PublishDocumentTemplateDraftResult =
  | {
      outcome: "success";
      templateId: string;
    }
  | ErrorResult;

export type DiscardDocumentTemplateDraftInput = {
  organizationId: string;
  familyId: string;
  templateId: string;
  expectedUpdatedAt: string;
};

export type DiscardDocumentTemplateDraftResult =
  | {
      outcome: "success";
      result: "draft_discarded" | "family_deleted";
    }
  | ErrorResult;

type AuthorizationResult =
  | { userId: string; role: OrganizationRole }
  | ErrorResult;

function failure(
  code: DocumentTemplateManagementErrorCode,
  message: string,
): ErrorResult {
  return { outcome: "error", error: { code, message } };
}

function invalidInput(message = "Les informations transmises sont invalides.") {
  return failure("invalid_input", message);
}

function databaseFailure(event: string, details: unknown) {
  console.error(event, details);
  return failure(
    "database_error",
    "Une erreur technique empêche momentanément cette opération.",
  );
}

function normalizeUuid(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizeRequiredText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeOptionalText(value: unknown) {
  if (value === null) return null;
  return normalizeRequiredText(value);
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isOrganizationRole(value: string): value is OrganizationRole {
  return ["owner", "admin", "member", "viewer"].includes(value);
}

async function authorizeOrganization(
  supabase: Supabase,
  organizationId: string,
  allowedRoles?: OrganizationRole[],
): Promise<AuthorizationResult> {
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return failure("unauthenticated", "Vous devez être connecté pour continuer.");
  }

  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", auth.data.user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (membership.error) {
    return databaseFailure(
      "document_template_membership_read_failed",
      membership.error,
    );
  }

  if (
    !membership.data ||
    !isOrganizationRole(membership.data.role) ||
    (allowedRoles && !allowedRoles.includes(membership.data.role))
  ) {
    return failure(
      "forbidden",
      "Vous n’avez pas les droits nécessaires pour cette opération.",
    );
  }

  return { userId: auth.data.user.id, role: membership.data.role };
}

function mapVersion(
  version: Database["public"]["Tables"]["document_templates"]["Row"],
): DocumentTemplateVersionSummary {
  return {
    id: version.id,
    familyId: version.family_id,
    version: version.version,
    lifecycleStatus: version.lifecycle_status,
    templateFormat: version.template_format,
    templateContent: version.template_content,
    updatedAt: version.updated_at,
    publishedAt: version.published_at,
  };
}

export function getDocumentTemplateValidationMessage(
  error: Extract<ParseDocumentTemplateDefinitionResult, { success: false }>["error"],
) {
  switch (error) {
    case "invalid_format":
      return "Le format du brouillon doit être JSON.";
    case "invalid_json":
      return "Le contenu du brouillon n’est pas un JSON valide.";
    case "unsupported_schema_version":
      return "La version du schéma documentaire n’est pas prise en charge.";
    case "document_type_mismatch":
      return "Le type de document du contenu ne correspond pas à celui de la famille.";
    case "invalid_template_content":
      return "Le contenu du brouillon ne respecte pas le schéma documentaire attendu.";
  }
}

function invalidTemplate(
  parsed: Extract<ParseDocumentTemplateDefinitionResult, { success: false }>,
) {
  return failure(
    "invalid_template",
    getDocumentTemplateValidationMessage(parsed.error),
  );
}

export async function listDocumentTemplateFamiliesCore(
  input: { organizationId: string },
  supabase: Supabase,
): Promise<ListDocumentTemplateFamiliesResult> {
  const organizationId = normalizeUuid(input.organizationId);
  if (!organizationId) return invalidInput();

  const authorization = await authorizeOrganization(supabase, organizationId);
  if ("outcome" in authorization) return authorization;

  const [families, versions] = await Promise.all([
    supabase
      .from("document_template_families")
      .select(
        "id, organization_id, name, description, document_type, species, breed, updated_at",
      )
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("document_templates")
      .select("*")
      .eq("organization_id", organizationId)
      .in("lifecycle_status", ["draft", "published"])
      .is("deleted_at", null),
  ]);

  if (families.error || versions.error) {
    return databaseFailure("document_template_families_list_failed", {
      families: families.error,
      versions: versions.error,
    });
  }

  const currentVersions = new Map<
    string,
    {
      draft: DocumentTemplateVersionSummary | null;
      publication: DocumentTemplateVersionSummary | null;
    }
  >();

  for (const version of versions.data ?? []) {
    const current = currentVersions.get(version.family_id) ?? {
      draft: null,
      publication: null,
    };
    if (version.lifecycle_status === "draft") current.draft = mapVersion(version);
    if (version.lifecycle_status === "published") {
      current.publication = mapVersion(version);
    }
    currentVersions.set(version.family_id, current);
  }

  return {
    outcome: "success",
    role: authorization.role,
    families: (families.data ?? []).map((family) => {
      const current = currentVersions.get(family.id);
      return {
        id: family.id,
        organizationId: family.organization_id,
        name: family.name,
        description: family.description,
        documentType: family.document_type,
        species: family.species,
        breed: family.breed,
        updatedAt: family.updated_at,
        draft: current?.draft ?? null,
        publication: current?.publication ?? null,
      };
    }),
  };
}

export async function createDocumentTemplateFamilyWithDraftCore(
  input: CreateDocumentTemplateFamilyWithDraftInput,
  supabase: Supabase,
): Promise<CreateDocumentTemplateFamilyWithDraftResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const name = normalizeRequiredText(input.name);
  const description = normalizeOptionalText(input.description);
  const documentType = normalizeRequiredText(input.documentType);
  const species = normalizeRequiredText(input.species);
  const breed = normalizeRequiredText(input.breed);
  const templateFormat = normalizeRequiredText(input.templateFormat);
  if (
    !organizationId ||
    !name ||
    !documentType ||
    !species ||
    !breed ||
    !templateFormat ||
    typeof input.templateContent !== "string"
  ) {
    return invalidInput();
  }

  const authorization = await authorizeOrganization(
    supabase,
    organizationId,
    ADMIN_ROLES,
  );
  if ("outcome" in authorization) return authorization;

  const created = await supabase.rpc(
    "create_document_template_family_with_draft",
    {
      p_organization_id: organizationId,
      p_name: name,
      p_document_type: documentType,
      p_species: species,
      p_breed: breed,
      p_template_format: templateFormat,
      p_template_content: input.templateContent,
      ...(description ? { p_description: description } : {}),
    },
  );

  if (created.error) {
    if (created.error.code === "42501") {
      return failure("forbidden", "Vous ne pouvez pas créer cette famille.");
    }
    if (created.error.code === "23514" || created.error.code === "22P02") {
      return invalidInput(
        "Le brouillon initial ne respecte pas les contraintes de stockage.",
      );
    }
    return databaseFailure("document_template_family_create_failed", created.error);
  }

  const row = created.data?.[0];
  if (!row) {
    return databaseFailure("document_template_family_create_empty_result", null);
  }

  return {
    outcome: "success",
    familyId: row.family_id,
    templateId: row.template_id,
    version: row.version,
  };
}

export async function updateDocumentTemplateFamilyMetadataCore(
  input: UpdateDocumentTemplateFamilyMetadataInput,
  supabase: Supabase,
): Promise<UpdateDocumentTemplateFamilyMetadataResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const familyId = normalizeUuid(input.familyId);
  const name = normalizeRequiredText(input.name);
  const description = normalizeOptionalText(input.description);
  if (!organizationId || !familyId || !name) {
    return invalidInput();
  }

  const authorization = await authorizeOrganization(
    supabase,
    organizationId,
    ADMIN_ROLES,
  );
  if ("outcome" in authorization) return authorization;

  const updated = await supabase
    .from("document_template_families")
    .update({ name, description })
    .eq("organization_id", organizationId)
    .eq("id", familyId)
    .is("deleted_at", null)
    .select("id, name, description, updated_at")
    .maybeSingle();

  if (updated.error) {
    return databaseFailure("document_template_family_update_failed", updated.error);
  }
  if (!updated.data) {
    return failure("not_found", "La famille de modèles est introuvable.");
  }

  return {
    outcome: "success",
    familyId: updated.data.id,
    name: updated.data.name,
    description: updated.data.description,
    updatedAt: updated.data.updated_at,
  };
}

export async function createNextDocumentTemplateDraftCore(
  input: CreateNextDocumentTemplateDraftInput,
  supabase: Supabase,
): Promise<CreateNextDocumentTemplateDraftResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const familyId = normalizeUuid(input.familyId);
  if (!organizationId || !familyId) return invalidInput();

  const authorization = await authorizeOrganization(
    supabase,
    organizationId,
    WRITABLE_ROLES,
  );
  if ("outcome" in authorization) return authorization;

  const family = await supabase
    .from("document_template_families")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", familyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (family.error) {
    return databaseFailure("document_template_family_read_failed", family.error);
  }
  if (!family.data) {
    return failure("not_found", "La famille de modèles est introuvable.");
  }

  const created = await supabase.rpc("create_document_template_draft", {
    p_family_id: familyId,
  });
  if (created.error) {
    if (created.error.code === "23505") {
      return failure(
        "draft_already_exists",
        "Un brouillon existe déjà pour cette famille.",
      );
    }
    if (created.error.code === "P0002") {
      return failure("not_found", "La famille de modèles est introuvable.");
    }
    if (created.error.code === "42501") {
      return failure("forbidden", "Vous ne pouvez pas créer ce brouillon.");
    }
    return databaseFailure("document_template_draft_create_failed", created.error);
  }

  const draft = await supabase
    .from("document_templates")
    .select("id, version, updated_at")
    .eq("organization_id", organizationId)
    .eq("id", created.data)
    .eq("lifecycle_status", "draft")
    .is("deleted_at", null)
    .maybeSingle();
  if (draft.error || !draft.data) {
    return databaseFailure("document_template_draft_created_read_failed", draft.error);
  }

  return {
    outcome: "success",
    templateId: draft.data.id,
    version: draft.data.version,
    updatedAt: draft.data.updated_at,
  };
}

export async function saveDocumentTemplateDraftCore(
  input: SaveDocumentTemplateDraftInput,
  supabase: Supabase,
): Promise<SaveDocumentTemplateDraftResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const templateId = normalizeUuid(input.templateId);
  if (
    !organizationId ||
    !templateId ||
    typeof input.templateContent !== "string" ||
    !validTimestamp(input.expectedUpdatedAt)
  ) {
    return invalidInput();
  }

  const authorization = await authorizeOrganization(
    supabase,
    organizationId,
    WRITABLE_ROLES,
  );
  if ("outcome" in authorization) return authorization;

  const updated = await supabase
    .from("document_templates")
    .update({ template_content: input.templateContent })
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .eq("lifecycle_status", "draft")
    .eq("updated_at", input.expectedUpdatedAt)
    .is("deleted_at", null)
    .select("id, updated_at")
    .maybeSingle();

  if (updated.error) {
    if (updated.error.code === "23514" || updated.error.code === "22P02") {
      return invalidInput(
        "Le contenu ne respecte pas les contraintes de stockage JSON.",
      );
    }
    return databaseFailure("document_template_draft_save_failed", updated.error);
  }
  if (!updated.data) {
    return failure(
      "stale_draft",
      "Ce brouillon a été modifié. Rechargez-le avant de réessayer.",
    );
  }

  return {
    outcome: "success",
    templateId: updated.data.id,
    updatedAt: updated.data.updated_at,
  };
}

async function readDraft(
  supabase: Supabase,
  organizationId: string,
  templateId: string,
) {
  return supabase
    .from("document_templates")
    .select(
      "id, document_type, template_format, template_content, updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .eq("lifecycle_status", "draft")
    .is("deleted_at", null)
    .maybeSingle();
}

export async function validateDocumentTemplateDraftCore(
  input: ValidateDocumentTemplateDraftInput,
  supabase: Supabase,
): Promise<ValidateDocumentTemplateDraftResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const templateId = normalizeUuid(input.templateId);
  if (!organizationId || !templateId) return invalidInput();

  const authorization = await authorizeOrganization(supabase, organizationId);
  if ("outcome" in authorization) return authorization;

  const draft = await readDraft(supabase, organizationId, templateId);
  if (draft.error) {
    return databaseFailure("document_template_draft_validation_read_failed", draft.error);
  }
  if (!draft.data) {
    return failure("not_found", "Le brouillon est introuvable.");
  }

  const parsed = parseDocumentTemplateDefinition({
    templateFormat: draft.data.template_format,
    documentType: draft.data.document_type,
    templateContent: draft.data.template_content,
  });
  if (!parsed.success) return invalidTemplate(parsed);

  return {
    outcome: "success",
    templateId: draft.data.id,
    definition: parsed.definition,
    updatedAt: draft.data.updated_at,
  };
}

export async function publishDocumentTemplateDraftCore(
  input: PublishDocumentTemplateDraftInput,
  supabase: Supabase,
): Promise<PublishDocumentTemplateDraftResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const templateId = normalizeUuid(input.templateId);
  if (!organizationId || !templateId) return invalidInput();

  const authorization = await authorizeOrganization(
    supabase,
    organizationId,
    ADMIN_ROLES,
  );
  if ("outcome" in authorization) return authorization;

  const draft = await readDraft(supabase, organizationId, templateId);
  if (draft.error) {
    return databaseFailure("document_template_draft_publish_read_failed", draft.error);
  }
  if (!draft.data) {
    return failure("not_found", "Le brouillon est introuvable.");
  }

  const parsed = parseDocumentTemplateDefinition({
    templateFormat: draft.data.template_format,
    documentType: draft.data.document_type,
    templateContent: draft.data.template_content,
  });
  if (!parsed.success) return invalidTemplate(parsed);

  const published = await supabase.rpc("publish_document_template_version", {
    p_template_id: draft.data.id,
    p_expected_updated_at: draft.data.updated_at,
    p_expected_template_format: draft.data.template_format,
    p_expected_template_content: draft.data.template_content,
  });
  if (published.error) {
    if (
      published.error.code === "P0001" &&
      published.error.message === "Document template draft is stale"
    ) {
      return failure(
        "stale_draft",
        "Ce brouillon a été modifié. Validez-le de nouveau avant publication.",
      );
    }
    if (published.error.code === "42501") {
      return failure("forbidden", "Vous ne pouvez pas publier ce brouillon.");
    }
    if (published.error.code === "P0002") {
      return failure("not_found", "Le brouillon est introuvable.");
    }
    return databaseFailure("document_template_draft_publish_failed", published.error);
  }

  return { outcome: "success", templateId: published.data };
}

export async function discardDocumentTemplateDraftCore(
  input: DiscardDocumentTemplateDraftInput,
  supabase: Supabase,
): Promise<DiscardDocumentTemplateDraftResult> {
  const organizationId = normalizeUuid(input.organizationId);
  const familyId = normalizeUuid(input.familyId);
  const templateId = normalizeUuid(input.templateId);
  if (
    !organizationId ||
    !familyId ||
    !templateId ||
    !validTimestamp(input.expectedUpdatedAt)
  ) {
    return invalidInput();
  }

  const authorization = await authorizeOrganization(
    supabase,
    organizationId,
    ADMIN_ROLES,
  );
  if ("outcome" in authorization) return authorization;

  const discarded = await supabase.rpc("discard_document_template_draft", {
    p_organization_id: organizationId,
    p_family_id: familyId,
    p_template_id: templateId,
    p_expected_updated_at: input.expectedUpdatedAt,
  });

  if (discarded.error) {
    if (discarded.error.code === "42501") {
      return failure("forbidden", "Vous n’avez pas les droits nécessaires pour cette opération.");
    }
    if (discarded.error.code === "P0002") {
      return failure("not_found", "Le brouillon est introuvable.");
    }
    if (
      discarded.error.code === "P0001" &&
      discarded.error.message === "Document template draft is stale"
    ) {
      return failure("stale_draft", "Ce brouillon a été modifié. Rechargez la page avant de réessayer.");
    }
    if (discarded.error.code === "23503") {
      return failure("protected_family", "Ce modèle est protégé et ne peut pas être retiré.");
    }
    return databaseFailure("document_template_draft_discard_failed", discarded.error);
  }

  const result = discarded.data?.[0]?.outcome;
  if (result !== "draft_discarded" && result !== "family_deleted") {
    return databaseFailure("document_template_draft_discard_invalid_result", discarded.data);
  }

  return { outcome: "success", result };
}
