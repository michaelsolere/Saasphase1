import "server-only";

const BREVO_API_BASE_URL = "https://api.brevo.com/v3";
const BREVO_REQUEST_TIMEOUT_MS = 8_000;

type BrevoApiErrorReason = "not_configured" | "unauthorized" | "timeout" | "api_error";

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

function getBrevoApiKey() {
  const apiKey = process.env.BREVO_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  return apiKey;
}

function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

async function brevoRequest<T>(path: string): Promise<BrevoRequestResult<T>> {
  const apiKey = getBrevoApiKey();

  if (!apiKey) {
    return { ok: false, reason: "not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BREVO_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BREVO_API_BASE_URL}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
      },
      signal: controller.signal,
    });

    const data = await parseJsonSafely(response);

    if (response.ok) {
      return { ok: true, data: data as T };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "unauthorized" };
    }

    return { ok: false, reason: "api_error" };
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
