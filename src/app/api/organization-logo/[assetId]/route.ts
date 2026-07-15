import { NextResponse } from "next/server";

import { readExactOrganizationLogo } from "@/features/settings/organization-logo-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateHeaders });
  }
  const asset = await supabase
    .from("organization_brand_assets")
    .select("organization_id")
    .eq("id", assetId)
    .maybeSingle();
  if (asset.error || !asset.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: privateHeaders });
  }
  const logo = await readExactOrganizationLogo(asset.data.organization_id, assetId, supabase);
  if (!logo.ok) {
    const status = logo.code === "forbidden" ? 403 : logo.code === "not_found" ? 404 : 409;
    return NextResponse.json({ error: "logo_unavailable" }, { status, headers: privateHeaders });
  }
  return new NextResponse(new Uint8Array(logo.logo.bytes), {
    status: 200,
    headers: {
      ...privateHeaders,
      "Content-Type": logo.logo.asset.mime_type,
      "Content-Length": String(logo.logo.asset.file_size_bytes),
    },
  });
}
