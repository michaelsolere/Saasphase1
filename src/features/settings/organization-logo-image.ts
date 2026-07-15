import { createHash } from "node:crypto";

import sharp from "sharp";

export const ORGANIZATION_LOGO_MAX_BYTES = 512 * 1024;
export const ORGANIZATION_LOGO_MIN_DIMENSION = 16;
export const ORGANIZATION_LOGO_MAX_DIMENSION = 2000;

export type OrganizationLogoMimeType = "image/png" | "image/jpeg";

export type ValidatedOrganizationLogo = {
  bytes: Buffer;
  fileSha256: string;
  fileSizeBytes: number;
  mimeType: OrganizationLogoMimeType;
  widthPx: number;
  heightPx: number;
  extension: "png" | "jpg";
};

export type OrganizationLogoValidationCode =
  | "invalid_type"
  | "unreadable"
  | "too_large"
  | "invalid_dimensions";

export type OrganizationLogoValidationResult =
  | { ok: true; logo: ValidatedOrganizationLogo }
  | { ok: false; code: OrganizationLogoValidationCode };

const acceptedMimeTypes = new Set<OrganizationLogoMimeType>([
  "image/png",
  "image/jpeg",
]);

export function isOrganizationLogoMimeType(
  value: string,
): value is OrganizationLogoMimeType {
  return acceptedMimeTypes.has(value as OrganizationLogoMimeType);
}

export async function validateOrganizationLogoBytes(input: {
  bytes: Buffer;
  declaredMimeType: string;
}): Promise<OrganizationLogoValidationResult> {
  if (!input.bytes.byteLength) return { ok: false, code: "unreadable" };
  if (input.bytes.byteLength > ORGANIZATION_LOGO_MAX_BYTES) {
    return { ok: false, code: "too_large" };
  }
  if (!isOrganizationLogoMimeType(input.declaredMimeType)) {
    return { ok: false, code: "invalid_type" };
  }

  try {
    const metadata = await sharp(input.bytes, {
      animated: false,
      limitInputPixels:
        ORGANIZATION_LOGO_MAX_DIMENSION * ORGANIZATION_LOGO_MAX_DIMENSION,
    }).metadata();
    const actualMimeType =
      metadata.format === "png"
        ? "image/png"
        : metadata.format === "jpeg"
          ? "image/jpeg"
          : null;

    if (
      !actualMimeType ||
      actualMimeType !== input.declaredMimeType ||
      (metadata.pages ?? 1) !== 1 ||
      (metadata.pageHeight ?? 0) > 0
    ) {
      return { ok: false, code: "invalid_type" };
    }
    if (!metadata.width || !metadata.height) {
      return { ok: false, code: "unreadable" };
    }
    if (
      metadata.width < ORGANIZATION_LOGO_MIN_DIMENSION ||
      metadata.height < ORGANIZATION_LOGO_MIN_DIMENSION ||
      metadata.width > ORGANIZATION_LOGO_MAX_DIMENSION ||
      metadata.height > ORGANIZATION_LOGO_MAX_DIMENSION
    ) {
      return { ok: false, code: "invalid_dimensions" };
    }

    return {
      ok: true,
      logo: {
        bytes: input.bytes,
        fileSha256: createHash("sha256").update(input.bytes).digest("hex"),
        fileSizeBytes: input.bytes.byteLength,
        mimeType: actualMimeType,
        widthPx: metadata.width,
        heightPx: metadata.height,
        extension: actualMimeType === "image/png" ? "png" : "jpg",
      },
    };
  } catch {
    return { ok: false, code: "unreadable" };
  }
}

export async function validateOrganizationLogoFile(
  file: File,
): Promise<OrganizationLogoValidationResult> {
  if (!file.size) return { ok: false, code: "unreadable" };
  if (file.size > ORGANIZATION_LOGO_MAX_BYTES) {
    return { ok: false, code: "too_large" };
  }
  if (!isOrganizationLogoMimeType(file.type)) {
    return { ok: false, code: "invalid_type" };
  }

  try {
    return validateOrganizationLogoBytes({
      bytes: Buffer.from(await file.arrayBuffer()),
      declaredMimeType: file.type,
    });
  } catch {
    return { ok: false, code: "unreadable" };
  }
}
