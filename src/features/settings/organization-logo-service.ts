import { createHash, randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

import {
  validateOrganizationLogoBytes,
  validateOrganizationLogoFile,
  type OrganizationLogoValidationCode,
  type ValidatedOrganizationLogo,
} from "./organization-logo-image";

type Supabase = SupabaseClient<Database>;
export type OrganizationBrandAsset =
  Database["public"]["Tables"]["organization_brand_assets"]["Row"];

export type VerifiedOrganizationLogo = {
  asset: OrganizationBrandAsset;
  bytes: Buffer;
  dataUri: string;
};

export type OrganizationLogoServiceError =
  | OrganizationLogoValidationCode
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "inconsistent"
  | "conflict"
  | "temporary_error";

const bucket = "organization-assets";

function dataUri(mimeType: string, bytes: Buffer) {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

export function buildOrganizationLogoPath(input: {
  organizationId: string;
  assetId: string;
  fileSha256: string;
  extension: "png" | "jpg";
}) {
  return `organizations/${input.organizationId}/branding/logos/${input.assetId}/${input.fileSha256}.${input.extension}`;
}

async function requireOrganizationMember(
  supabase: Supabase,
  organizationId: string,
  write: boolean,
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, code: "unauthenticated" as const };
  const membership = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  if (membership.error || !membership.data) {
    return { ok: false as const, code: "forbidden" as const };
  }
  if (write && !["owner", "admin"].includes(membership.data.role)) {
    return { ok: false as const, code: "forbidden" as const };
  }
  return { ok: true as const, userId: user.id };
}

async function verifyStoredAsset(
  supabase: Supabase,
  asset: OrganizationBrandAsset,
): Promise<{ ok: true; logo: VerifiedOrganizationLogo } | { ok: false; code: "inconsistent" | "temporary_error" }> {
  const downloaded = await supabase.storage.from(bucket).download(asset.file_path);
  if (downloaded.error || !downloaded.data) {
    return { ok: false, code: downloaded.error ? "temporary_error" : "inconsistent" };
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await downloaded.data.arrayBuffer());
  } catch {
    return { ok: false, code: "temporary_error" };
  }
  const validated = await validateOrganizationLogoBytes({
    bytes,
    declaredMimeType: asset.mime_type,
  });
  if (
    !validated.ok ||
    validated.logo.fileSha256 !== asset.file_sha256 ||
    validated.logo.fileSizeBytes !== asset.file_size_bytes ||
    validated.logo.widthPx !== asset.width_px ||
    validated.logo.heightPx !== asset.height_px
  ) {
    return { ok: false, code: "inconsistent" };
  }
  return {
    ok: true,
    logo: { asset, bytes, dataUri: dataUri(asset.mime_type, bytes) },
  };
}

export async function readActiveOrganizationLogo(
  organizationId: string,
  suppliedClient?: Supabase,
): Promise<{ ok: true; logo: VerifiedOrganizationLogo | null } | { ok: false; code: OrganizationLogoServiceError }> {
  const supabase = suppliedClient ?? await createClient();
  const access = await requireOrganizationMember(supabase, organizationId, false);
  if (!access.ok) return access;
  const result = await supabase
    .from("organization_brand_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("asset_type", "logo")
    .is("retired_at", null)
    .maybeSingle();
  if (result.error) return { ok: false, code: "temporary_error" };
  if (!result.data) return { ok: true, logo: null };
  const verified = await verifyStoredAsset(supabase, result.data);
  return verified.ok ? { ok: true, logo: verified.logo } : verified;
}

export async function readExactOrganizationLogo(
  organizationId: string,
  assetId: string,
  suppliedClient?: Supabase,
): Promise<{ ok: true; logo: VerifiedOrganizationLogo } | { ok: false; code: OrganizationLogoServiceError }> {
  const supabase = suppliedClient ?? await createClient();
  const access = await requireOrganizationMember(supabase, organizationId, false);
  if (!access.ok) return access;
  const result = await supabase
    .from("organization_brand_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", assetId)
    .maybeSingle();
  if (result.error) return { ok: false, code: "temporary_error" };
  if (!result.data) return { ok: false, code: "not_found" };
  const verified = await verifyStoredAsset(supabase, result.data);
  return verified.ok ? { ok: true, logo: verified.logo } : verified;
}

async function removeUnreferencedObject(supabase: Supabase, path: string) {
  const removal = await supabase.storage.from(bucket).remove([path]);
  if (removal.error) console.error("organization_logo_compensation_failed");
}

function sameAssetIntent(asset: OrganizationBrandAsset, input: {
  organizationId: string;
  assetId: string;
  path: string;
  logo: ValidatedOrganizationLogo;
}) {
  return asset.id === input.assetId
    && asset.organization_id === input.organizationId
    && asset.file_path === input.path
    && asset.file_sha256 === input.logo.fileSha256
    && asset.file_size_bytes === input.logo.fileSizeBytes
    && asset.mime_type === input.logo.mimeType
    && asset.width_px === input.logo.widthPx
    && asset.height_px === input.logo.heightPx
    && asset.retired_at === null;
}

export async function uploadOrganizationLogo(input: {
  organizationId: string;
  file: File;
  assetId?: string;
}, suppliedClient?: Supabase): Promise<
  | { ok: true; outcome: "activated" | "existing"; asset: OrganizationBrandAsset }
  | { ok: false; code: OrganizationLogoServiceError }
> {
  const supabase = suppliedClient ?? await createClient();
  const access = await requireOrganizationMember(supabase, input.organizationId, true);
  if (!access.ok) return access;
  const validated = await validateOrganizationLogoFile(input.file);
  if (!validated.ok) return validated;
  const assetId = input.assetId ?? randomUUID();
  const path = buildOrganizationLogoPath({
    organizationId: input.organizationId,
    assetId,
    fileSha256: validated.logo.fileSha256,
    extension: validated.logo.extension,
  });
  const upload = await supabase.storage.from(bucket).upload(path, validated.logo.bytes, {
    contentType: validated.logo.mimeType,
    upsert: false,
  });
  if (upload.error) {
    const existing = await supabase.from("organization_brand_assets").select("*").eq("id", assetId).maybeSingle();
    if (existing.data && sameAssetIntent(existing.data, { organizationId: input.organizationId, assetId, path, logo: validated.logo })) {
      return { ok: true, outcome: "existing", asset: existing.data };
    }
    return { ok: false, code: existing.error ? "temporary_error" : "conflict" };
  }

  const downloaded = await supabase.storage.from(bucket).download(path);
  if (downloaded.error || !downloaded.data) {
    await removeUnreferencedObject(supabase, path);
    return { ok: false, code: "temporary_error" };
  }
  const storedBytes = Buffer.from(await downloaded.data.arrayBuffer());
  if (
    storedBytes.byteLength !== validated.logo.fileSizeBytes ||
    createHash("sha256").update(storedBytes).digest("hex") !== validated.logo.fileSha256
  ) {
    await removeUnreferencedObject(supabase, path);
    return { ok: false, code: "inconsistent" };
  }

  const activated = await supabase.rpc("activate_organization_logo", {
    p_organization_id: input.organizationId,
    p_asset_id: assetId,
    p_file_path: path,
    p_file_sha256: validated.logo.fileSha256,
    p_file_size_bytes: validated.logo.fileSizeBytes,
    p_mime_type: validated.logo.mimeType,
    p_width_px: validated.logo.widthPx,
    p_height_px: validated.logo.heightPx,
  });
  const reconciled = await supabase.from("organization_brand_assets").select("*").eq("id", assetId).maybeSingle();
  if (reconciled.data && sameAssetIntent(reconciled.data, { organizationId: input.organizationId, assetId, path, logo: validated.logo })) {
    return {
      ok: true,
      outcome: activated.data?.[0]?.outcome === "existing" ? "existing" : "activated",
      asset: reconciled.data,
    };
  }
  if (!reconciled.error) await removeUnreferencedObject(supabase, path);
  return { ok: false, code: activated.error || reconciled.error ? "temporary_error" : "conflict" };
}

export async function retireActiveOrganizationLogo(
  organizationId: string,
  suppliedClient?: Supabase,
): Promise<{ ok: true; outcome: "retired" | "already_absent" } | { ok: false; code: OrganizationLogoServiceError }> {
  const supabase = suppliedClient ?? await createClient();
  const access = await requireOrganizationMember(supabase, organizationId, true);
  if (!access.ok) return access;
  const result = await supabase.rpc("retire_active_organization_logo", {
    p_organization_id: organizationId,
  });
  if (result.error || !result.data?.[0]) return { ok: false, code: "temporary_error" };
  return { ok: true, outcome: result.data[0].outcome as "retired" | "already_absent" };
}
