import { redirect } from "next/navigation";

import { loadLitterJournalCatalog } from "@/features/litter-journal/loader";
import {
  resolveFallbackMobileLitterIndex,
  writeWhelpingMobileSelection,
} from "@/features/whelping/whelping-mobile-selection-server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=%2Fwhelping");
  }

  const litters = await loadLitterJournalCatalog(supabase);
  const selectedIndex = await resolveFallbackMobileLitterIndex(litters, supabase);
  const selectedLitter = selectedIndex === null ? null : litters[selectedIndex];
  if (selectedLitter?.id) await writeWhelpingMobileSelection(selectedLitter.id);
  redirect("/whelping");
}
