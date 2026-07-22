import "server-only";

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { LitterJournalListItem } from "@/features/litter-journal/types";
import { listWhelpingSessionsForLitter } from "@/features/whelping/whelping";
import type { Database } from "@/types/database.types";

import { selectDefaultMobileLitterIndex } from "./whelping-mobile-selection";

const MOBILE_SELECTION_COOKIE = "whelping_mobile_selection";
const COOKIE_PATH = "/whelping";
const REVISION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type WhelpingClient = SupabaseClient<Database>;

export type WhelpingMobileSelection = {
  litterId: string;
  revision: string;
};

function decodeSelection(value: string | undefined): WhelpingMobileSelection | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<WhelpingMobileSelection>;
    return UUID_PATTERN.test(parsed.litterId ?? "") && REVISION_PATTERN.test(parsed.revision ?? "")
      ? { litterId: parsed.litterId!, revision: parsed.revision! }
      : null;
  } catch {
    return null;
  }
}

export async function readWhelpingMobileSelection() {
  const store = await cookies();
  return decodeSelection(store.get(MOBILE_SELECTION_COOKIE)?.value);
}

export async function writeWhelpingMobileSelection(litterId: string) {
  const selection = { litterId, revision: crypto.randomUUID() } satisfies WhelpingMobileSelection;
  const store = await cookies();
  store.set(MOBILE_SELECTION_COOKIE, Buffer.from(JSON.stringify(selection)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
  });
  return selection;
}

export async function mobileSelectionMatches(litterId: string, revision: string) {
  const selection = await readWhelpingMobileSelection();
  return selection?.litterId === litterId && selection.revision === revision;
}

export async function resolveFallbackMobileLitterIndex(
  litters: LitterJournalListItem[],
  supabase: WhelpingClient,
) {
  const sessionResults = await Promise.allSettled(
    litters.map((litter) =>
      litter.id ? listWhelpingSessionsForLitter({ litterId: litter.id }, supabase) : null,
    ),
  );
  const sessionsByLitterIndex = sessionResults.map((result) =>
    result.status === "fulfilled" && result.value?.outcome === "success"
      ? result.value.sessions
      : [],
  );
  return selectDefaultMobileLitterIndex(litters, sessionsByLitterIndex);
}
