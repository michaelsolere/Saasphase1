import { redirect } from "next/navigation";

import { loadLitterJournalCatalog } from "@/features/litter-journal/loader";
import { parsePublicLitterIndex } from "@/features/whelping/whelping-mobile-selection";
import {
  resolveFallbackMobileLitterIndex,
  writeWhelpingMobileSelection,
} from "@/features/whelping/whelping-mobile-selection-server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fwhelping");
  }

  const litters = await loadLitterJournalCatalog(supabase);
  const requestedIndex = parsePublicLitterIndex(
    new URL(request.url).searchParams.get("litter") ?? undefined,
  );
  const selectedIndex = requestedIndex !== null && requestedIndex < litters.length
    ? requestedIndex
    : await resolveFallbackMobileLitterIndex(litters, supabase);
  const selectedLitter = selectedIndex === null ? null : litters[selectedIndex];
  if (selectedLitter?.id) await writeWhelpingMobileSelection(selectedLitter.id);
  redirect("/whelping");
}
