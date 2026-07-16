import "server-only";

import {
  buildBrevoTransactionalEmailPayload,
  type BrevoEmailIdentity,
  type SendBrevoTransactionalEmailInput,
} from "@/lib/brevo/transactional-email-payload";

export type {
  BrevoEmailIdentity,
  SendBrevoTransactionalEmailInput,
} from "@/lib/brevo/transactional-email-payload";

const DEFAULT_BREVO_API_BASE_URL = "https://api.brevo.com/v3";
const BREVO_REQUEST_TIMEOUT_MS = 8_000;

export type BrevoApiErrorReason =
  | "not_configured"
  | "unauthorized"
  | "timeout"
  | "invalid_request"
  | "template_not_found"
  | "template_inactive"
  | "rate_limited"
  | "provider_unavailable"
  | "api_error";

type BrevoAccountResponse = {
  email?: unknown;
  companyName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
};

export type BrevoConnectionResult =
  | {
      ok: true;
      account?: {
        email?: string;
        companyName?: string;
        firstName?: string;
        lastName?: string;
      };
    }
  | {
      ok: false;
      reason: BrevoApiErrorReason;
    };

type BrevoRequestResult<T> =
  | {
      ok: true;
      data: T | null;
    }
  | {
      ok: false;
      reason: BrevoApiErrorReason;
    };

type BrevoTransactionalTemplateResponse = {
  id?: unknown;
  name?: unknown;
  subject?: unknown;
  isActive?: unknown;
  modifiedAt?: unknown;
  sender?: unknown;
  replyTo?: unknown;
};

type BrevoTransactionalEmailResponse = {
  messageId?: unknown;
};

export type BrevoTransactionalTemplate = {
  id: number;
  name: string;
  subject: string;
  isActive: boolean;
  modifiedAt: string | null;
  sender: BrevoEmailIdentity | null;
  replyTo: BrevoEmailIdentity | null;
};

export type BrevoTransactionalTemplateResult =
  | {
      ok: true;
      template: BrevoTransactionalTemplate;
    }
  | {
      ok: false;
      reason: BrevoApiErrorReason;
    };

export type SendBrevoTransactionalEmailResult =
  | {
      ok: true;
      messageId: string;
    }
  | {
      ok: false;
      reason: BrevoApiErrorReason;
    };

function getBrevoApiKey() {
  const apiKey = process.env.BREVO_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  return apiKey;
}

function getBrevoApiBaseUrl() {
  return process.env.BREVO_API_BASE_URL?.trim() || DEFAULT_BREVO_API_BASE_URL;
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) {
    const parsedValue = Number(value);
    return Number.isSafeInteger(parsedValue) ? parsedValue : null;
  }

  return null;
}

function normalizeEmailIdentity(value: unknown): BrevoEmailIdentity | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const email = toOptionalString(record.email);

  if (!email) {
    return null;
  }

  const name = toOptionalString(record.name);
  return name ? { email, name } : { email };
}

async function parseJsonSafely(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function mapBrevoErrorStatus(status: number): BrevoApiErrorReason {
  if (status === 400) {
    return "invalid_request";
  }

  if (status === 401 || status === 403) {
    return "unauthorized";
  }

  if (status === 404) {
    return "template_not_found";
  }

  if (status === 429) {
    return "rate_limited";
  }

  if (status >= 500) {
    return "provider_unavailable";
  }

  return "api_error";
}

async function brevoRequest<T>(
  path: string,
  init?: {
    method?: "GET" | "POST";
    body?: unknown;
  },
): Promise<BrevoRequestResult<T>> {
  const apiKey = getBrevoApiKey();

  if (!apiKey) {
    return { ok: false, reason: "not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getBrevoApiBaseUrl()}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        "api-key": apiKey,
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });

    const data = await parseJsonSafely(response);

    if (response.ok) {
      return { ok: true, data: data as T };
    }

    return { ok: false, reason: mapBrevoErrorStatus(response.status) };
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, reason: "timeout" };
    }

    return { ok: false, reason: "api_error" };
  } finally {
    clearTimeout(timeout);
  }
}

export function getBrevoConfigurationStatus() {
  return {
    isConfigured: Boolean(getBrevoApiKey()),
    senderEmail: process.env.BREVO_SENDER_EMAIL?.trim() || null,
    senderName: process.env.BREVO_SENDER_NAME?.trim() || null,
    replyToEmail: process.env.BREVO_REPLY_TO_EMAIL?.trim() || null,
  };
}

function normalizeTemplateResponse(
  data: BrevoTransactionalTemplateResponse | null,
): BrevoTransactionalTemplate | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const id = normalizePositiveInteger(data.id);
  const name = toOptionalString(data.name);
  const subject = toOptionalString(data.subject);
  const isActive = typeof data.isActive === "boolean" ? data.isActive : null;

  if (!id || !name || !subject || isActive === null) {
    return null;
  }

  const modifiedAt = toOptionalString(data.modifiedAt) ?? null;

  return {
    id,
    name,
    subject,
    isActive,
    modifiedAt,
    sender: normalizeEmailIdentity(data.sender),
    replyTo: normalizeEmailIdentity(data.replyTo),
  };
}

export async function getBrevoTransactionalTemplate(
  templateId: number,
): Promise<BrevoTransactionalTemplateResult> {
  if (!Number.isSafeInteger(templateId) || templateId <= 0) {
    return { ok: false, reason: "invalid_request" };
  }

  const result = await brevoRequest<BrevoTransactionalTemplateResponse>(
    `/smtp/templates/${templateId}`,
  );

  if (!result.ok) {
    return result;
  }

  const template = normalizeTemplateResponse(result.data);

  if (!template) {
    return { ok: false, reason: "api_error" };
  }

  if (!template.isActive) {
    return { ok: false, reason: "template_inactive" };
  }

  return { ok: true, template };
}

export async function sendBrevoTransactionalEmail({
  templateId,
  to,
  params,
  idempotencyKey,
  tags = ["saas_elevage", "pre_reservation"],
  attachments,
}: SendBrevoTransactionalEmailInput): Promise<SendBrevoTransactionalEmailResult> {
  if (
    !Number.isSafeInteger(templateId) ||
    templateId <= 0 ||
    !to.email.trim() ||
    !idempotencyKey.trim()
  ) {
    return { ok: false, reason: "invalid_request" };
  }

  const configuration = getBrevoConfigurationStatus();
  const payload = buildBrevoTransactionalEmailPayload(
    { templateId, to, params, idempotencyKey, tags, attachments },
    configuration,
  );

  const result = await brevoRequest<BrevoTransactionalEmailResponse>(
    "/smtp/email",
    {
      method: "POST",
      body: payload,
    },
  );

  if (!result.ok) {
    return result;
  }

  const messageId = toOptionalString(result.data?.messageId);

  if (!messageId) {
    return { ok: false, reason: "api_error" };
  }

  return { ok: true, messageId };
}

export async function testBrevoConnection(): Promise<BrevoConnectionResult> {
  const result = await brevoRequest<BrevoAccountResponse>("/account");

  if (!result.ok) {
    return result;
  }

  const account = result.data ?? {};

  return {
    ok: true,
    account: {
      email: toOptionalString(account.email),
      companyName: toOptionalString(account.companyName),
      firstName: toOptionalString(account.firstName),
      lastName: toOptionalString(account.lastName),
    },
  };
}
