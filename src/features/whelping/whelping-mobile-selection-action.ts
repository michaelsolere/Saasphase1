"use server";

import { revalidatePath } from "next/cache";

import { loadLitterJournalCatalog } from "@/features/litter-journal/loader";
import { createClient } from "@/lib/supabase/server";

import { parsePublicLitterIndex } from "./whelping-mobile-selection";
import {
  resolveFallbackMobileLitterIndex,
  writeWhelpingMobileSelection,
} from "./whelping-mobile-selection-server";

export type WhelpingMobileSelectionActionState = {
  status: "success" | "error";
  message?: string;
};

export async function selectWhelpingMobileLitterAction(
  requestedIndex: number,
): Promise<WhelpingMobileSelectionActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Vous devez être connecté pour continuer." };

  try {
    const litters = await loadLitterJournalCatalog(supabase);
    const parsedIndex = parsePublicLitterIndex(String(requestedIndex));
    const fallbackIndex = await resolveFallbackMobileLitterIndex(litters, supabase);
    const selectedIndex = parsedIndex !== null && parsedIndex < litters.length
      ? parsedIndex
      : fallbackIndex;
    const selectedLitter = selectedIndex === null ? null : litters[selectedIndex];
    if (!selectedLitter?.id) {
      return { status: "error", message: "Aucune portée accessible ne peut être affichée." };
    }

    await writeWhelpingMobileSelection(selectedLitter.id);
    revalidatePath("/whelping");
    return { status: "success" };
  } catch {
    return { status: "error", message: "Le changement de portée a échoué. Réessayez." };
  }
}
