import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildPostAdoptionEmailVariables,
  buildPostAdoptionVariablesSnapshot,
  classifyPostAdoptionProviderFailure,
  getPostAdoptionTemplateKey,
  type PostAdoptionDispatchMessageKind,
} from "./automated-delivery-core";
import {
  decryptPostAdoptionQuestionnaireToken,
  encryptPostAdoptionQuestionnaireToken,
  getPostAdoptionEncryptionConfig,
} from "./token-encryption";
import {
  buildPostAdoptionQuestionnairePath,
  generatePostAdoptionQuestionnaireToken,
  hashPostAdoptionQuestionnaireToken,
} from "./public-token";
import {
  getBrevoTransactionalTemplate,
  sendBrevoTransactionalEmail,
} from "@/lib/brevo/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

type UntypedClient = SupabaseClient;

type DispatchRow = {
  id: string;
  organization_id: string;
  instance_id: string;
  message_kind: PostAdoptionDispatchMessageKind;
  attempt_count: number;
};

type InstanceRow = {
  id: string;
  organization_id: string;
  questionnaire_code: string;
  status: string;
  response_deadline_at: string | null;
  contact_id: string;
  reservation_id: string;
  animal_id: string;
};

type AccessRow = {
  id: string;
  token_ciphertext: string | null;
  token_iv: string | null;
  token_auth_tag: string | null;
  token_key_version: string | null;
  public_read_until: string;
};

function untypedClient() {
  return createServiceRoleClient() as unknown as UntypedClient;
}

function publicBaseUrl() {
  const explicit = process.env.POST_ADOPTION_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  throw new Error("post_adoption_public_base_url_missing");
}

function isEmail(value: string | null | undefined) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}

async function rpc<T>(client: UntypedClient, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args);
  if (result.error) throw new Error(`${name}:${result.error.message}`);
  return result.data as T;
}

async function complete(
  client: UntypedClient,
  dispatch: DispatchRow,
  leaseToken: string,
  input: Record<string, unknown>,
) {
  return rpc<string>(client, "complete_post_adoption_questionnaire_dispatch", {
    p_dispatch_id: dispatch.id,
    p_lease_token: leaseToken,
    p_recipient_email: null,
    p_recipient_name: null,
    p_template_id: null,
    p_brevo_template_id: null,
    p_variables: {},
    p_brevo_message_id: null,
    p_error_code: null,
    p_error_message: null,
    p_retry_at: null,
    ...input,
  });
}

async function readDispatchContext(client: UntypedClient, dispatch: DispatchRow) {
  const instanceResult = await client
    .from("post_adoption_questionnaire_instances")
    .select("id, organization_id, questionnaire_code, status, response_deadline_at, contact_id, reservation_id, animal_id")
    .eq("organization_id", dispatch.organization_id)
    .eq("id", dispatch.instance_id)
    .maybeSingle();
  if (instanceResult.error || !instanceResult.data) return null;
  const instance = instanceResult.data as unknown as InstanceRow;
  const [contactResult, animalResult, organizationResult, accessResult, automationResult] = await Promise.all([
    client.from("contacts").select("first_name, display_name, email").eq("organization_id", dispatch.organization_id).eq("id", instance.contact_id).is("deleted_at", null).maybeSingle(),
    client.from("animals").select("call_name, official_name").eq("organization_id", dispatch.organization_id).eq("id", instance.animal_id).is("deleted_at", null).maybeSingle(),
    client.from("organizations").select("name, affix_name, dog_affix_name").eq("id", dispatch.organization_id).is("deleted_at", null).maybeSingle(),
    client.from("post_adoption_questionnaire_public_accesses").select("id, token_ciphertext, token_iv, token_auth_tag, token_key_version, public_read_until").eq("organization_id", dispatch.organization_id).eq("instance_id", instance.id).is("revoked_at", null).maybeSingle(),
    client.from("post_adoption_questionnaire_automation").select("timezone").eq("organization_id", dispatch.organization_id).eq("instance_id", instance.id).maybeSingle(),
  ]);
  if (contactResult.error || animalResult.error || organizationResult.error || accessResult.error || automationResult.error) return null;
  return {
    instance,
    contact: contactResult.data as { first_name: string | null; display_name: string; email: string | null } | null,
    animal: animalResult.data as { call_name: string | null; official_name: string | null } | null,
    organization: organizationResult.data as { name: string; affix_name: string | null; dog_affix_name: string | null } | null,
    access: accessResult.data as unknown as AccessRow | null,
    timezone: String(automationResult.data?.timezone ?? "Europe/Paris"),
  };
}

async function ensurePublicToken(
  client: UntypedClient,
  dispatch: DispatchRow,
  leaseToken: string,
  access: AccessRow | null,
) {
  const encryption = getPostAdoptionEncryptionConfig();
  if (access?.token_ciphertext && access.token_iv && access.token_auth_tag && access.token_key_version) {
    const decryptionKey = encryption.keysByVersion.get(access.token_key_version);
    if (!decryptionKey) throw new Error("post_adoption_encryption_key_version_unavailable");
    const token = decryptPostAdoptionQuestionnaireToken(
      {
        algorithm: "aes-256-gcm",
        keyVersion: access.token_key_version,
        ciphertext: access.token_ciphertext,
        iv: access.token_iv,
        authTag: access.token_auth_tag,
      },
      decryptionKey,
    );
    if (access.token_key_version !== encryption.currentVersion) {
      const reencrypted = encryptPostAdoptionQuestionnaireToken(
        token,
        encryption.currentKey,
        encryption.currentVersion,
      );
      const rotated = await rpc<boolean>(client, "reencrypt_post_adoption_questionnaire_public_access", {
        p_access_id: access.id,
        p_expected_key_version: access.token_key_version,
        p_token_ciphertext: reencrypted.ciphertext,
        p_token_iv: reencrypted.iv,
        p_token_auth_tag: reencrypted.authTag,
        p_token_key_version: reencrypted.keyVersion,
      });
      if (!rotated) throw new Error("post_adoption_encryption_rotation_failed");
    }
    return token;
  }
  if (dispatch.message_kind !== "initial") throw new Error("post_adoption_encrypted_token_missing");
  const token = generatePostAdoptionQuestionnaireToken();
  const encrypted = encryptPostAdoptionQuestionnaireToken(
    token,
    encryption.currentKey,
    encryption.currentVersion,
  );
  const prepared = await rpc<Array<{ outcome: string }>>(
    client,
    "prepare_post_adoption_questionnaire_dispatch_access",
    {
      p_dispatch_id: dispatch.id,
      p_lease_token: leaseToken,
      p_token_hash: hashPostAdoptionQuestionnaireToken(token),
      p_token_hint: token.slice(-8),
      p_token_ciphertext: encrypted.ciphertext,
      p_token_iv: encrypted.iv,
      p_token_auth_tag: encrypted.authTag,
      p_token_key_version: encrypted.keyVersion,
    },
  );
  if (!prepared?.[0] || !["success", "existing"].includes(prepared[0].outcome)) {
    throw new Error("post_adoption_access_preparation_failed");
  }
  if (prepared[0].outcome === "existing") {
    const refreshed = await client.from("post_adoption_questionnaire_public_accesses")
      .select("id, token_ciphertext, token_iv, token_auth_tag, token_key_version, public_read_until")
      .eq("organization_id", dispatch.organization_id).eq("instance_id", dispatch.instance_id)
      .is("revoked_at", null).maybeSingle();
    if (refreshed.error || !refreshed.data) throw new Error("post_adoption_existing_access_unreadable");
    return ensurePublicToken(client, dispatch, leaseToken, refreshed.data as unknown as AccessRow);
  }
  return token;
}

async function processDispatch(client: UntypedClient, dispatch: DispatchRow, leaseToken: string) {
  const context = await readDispatchContext(client, dispatch);
  if (!context?.contact || !context.animal || !context.organization) {
    return complete(client, dispatch, leaseToken, {
      p_outcome: "retryable",
      p_error_code: "context_missing",
      p_error_message: "Les données nécessaires à l’envoi sont incomplètes.",
    });
  }
  const email = context.contact.email?.trim() ?? "";
  if (!isEmail(email)) {
    return complete(client, dispatch, leaseToken, {
      p_outcome: "retryable",
      p_error_code: "recipient_email_missing",
      p_error_message: "L’adresse email du contact est absente ou invalide.",
    });
  }
  const templateKey = getPostAdoptionTemplateKey(
    context.instance.questionnaire_code,
    dispatch.message_kind,
  );
  const templateResult = await client.from("email_templates")
    .select("id, brevo_template_id")
    .eq("organization_id", dispatch.organization_id)
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  const template = templateResult.data as { id: string; brevo_template_id: number | null } | null;
  if (templateResult.error || !template?.brevo_template_id) {
    return complete(client, dispatch, leaseToken, {
      p_outcome: "retryable",
      p_recipient_email: email,
      p_recipient_name: context.contact.display_name,
      p_error_code: "template_missing",
      p_error_message: `Le modèle ${templateKey} n’est pas configuré.`,
    });
  }
  const providerTemplate = await getBrevoTransactionalTemplate(template.brevo_template_id);
  if (!providerTemplate.ok) {
    return complete(client, dispatch, leaseToken, {
      p_outcome: "retryable",
      p_recipient_email: email,
      p_recipient_name: context.contact.display_name,
      p_template_id: template.id,
      p_brevo_template_id: template.brevo_template_id,
      p_error_code: providerTemplate.reason,
      p_error_message: "Le modèle Brevo est indisponible.",
    });
  }
  let token: string;
  try {
    token = await ensurePublicToken(client, dispatch, leaseToken, context.access);
  } catch (error) {
    return complete(client, dispatch, leaseToken, {
      p_outcome: "retryable",
      p_recipient_email: email,
      p_recipient_name: context.contact.display_name,
      p_template_id: template.id,
      p_brevo_template_id: template.brevo_template_id,
      p_error_code: error instanceof Error ? error.message : "token_unavailable",
      p_error_message: "Le lien sécurisé ne peut pas être préparé.",
    });
  }
  const now = new Date();
  const responseDeadline = context.instance.response_deadline_at
    ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const milestone = context.instance.questionnaire_code === "post-adoption-t1" ? "t1" : "t2";
  const variables = buildPostAdoptionEmailVariables({
    contactFirstName: context.contact.first_name,
    contactName: context.contact.display_name,
    animalName: context.animal.call_name ?? context.animal.official_name ?? "Votre chien",
    organizationName: context.organization.dog_affix_name ?? context.organization.affix_name ?? context.organization.name,
    milestone,
    publicUrl: `${publicBaseUrl()}${buildPostAdoptionQuestionnairePath(token)}`,
    responseDeadline,
    timezone: context.timezone,
  });
  const variablesSnapshot = buildPostAdoptionVariablesSnapshot(variables);
  const started = await rpc<boolean>(client, "mark_post_adoption_questionnaire_dispatch_provider_started", {
    p_dispatch_id: dispatch.id,
    p_lease_token: leaseToken,
    p_recipient_email: email,
    p_recipient_name: context.contact.display_name,
    p_template_id: template.id,
    p_brevo_template_id: template.brevo_template_id,
    p_variables_snapshot: variablesSnapshot,
  });
  if (!started) throw new Error("post_adoption_provider_start_not_recorded");
  const sent = await sendBrevoTransactionalEmail({
    templateId: template.brevo_template_id,
    to: { email, name: context.contact.display_name },
    params: variables,
    idempotencyKey: `post-adoption:${dispatch.id}`,
    tags: ["saas_elevage", "post_adoption", milestone, dispatch.message_kind],
  });
  if (!sent.ok) {
    return complete(client, dispatch, leaseToken, {
      p_outcome: classifyPostAdoptionProviderFailure(sent.reason),
      p_recipient_email: email,
      p_recipient_name: context.contact.display_name,
      p_template_id: template.id,
      p_brevo_template_id: template.brevo_template_id,
      p_variables: variablesSnapshot,
      p_error_code: sent.reason,
      p_error_message: "Brevo n’a pas confirmé l’envoi.",
    });
  }
  const acceptedOutcome = await complete(client, dispatch, leaseToken, {
    p_outcome: "accepted",
    p_recipient_email: email,
    p_recipient_name: context.contact.display_name,
    p_template_id: template.id,
    p_brevo_template_id: template.brevo_template_id,
    p_variables: variablesSnapshot,
    p_brevo_message_id: sent.messageId,
  });
  if (acceptedOutcome === "success") return acceptedOutcome;
  if (acceptedOutcome === "invalid_claim") return "uncertain";
  if (acceptedOutcome === "invalid_instance_state") {
    const uncertainOutcome = await complete(client, dispatch, leaseToken, {
      p_outcome: "uncertain",
      p_recipient_email: email,
      p_recipient_name: context.contact.display_name,
      p_template_id: template.id,
      p_brevo_template_id: template.brevo_template_id,
      p_variables: variablesSnapshot,
      p_brevo_message_id: sent.messageId,
      p_error_code: "accepted_after_state_change",
      p_error_message: "Brevo a accepté l’email après une modification concurrente du suivi.",
    });
    return uncertainOutcome === "success" ? "uncertain" : acceptedOutcome;
  }
  return acceptedOutcome;
}

export async function runPostAdoptionAutomatedDelivery(
  limit = 4,
  organizationId: string | null = null,
) {
  const client = untypedClient();
  const leaseToken = randomUUID();
  const dispatches = await rpc<DispatchRow[]>(client, "claim_post_adoption_questionnaire_dispatches", {
    p_lease_token: leaseToken,
    p_limit: limit,
    p_organization_id: organizationId,
  });
  const results: Array<{ dispatchId: string; outcome: string }> = [];
  const claimed = dispatches ?? [];
  for (let index = 0; index < claimed.length; index += 2) {
    const wave = claimed.slice(index, index + 2);
    const waveResults = await Promise.all(wave.map(async (dispatch) => {
      try {
        const outcome = await processDispatch(client, dispatch, leaseToken);
        return { dispatchId: dispatch.id, outcome };
      } catch {
        return { dispatchId: dispatch.id, outcome: "interrupted" };
      }
    }));
    results.push(...waveResults);
  }
  return { claimed: dispatches?.length ?? 0, results };
}
