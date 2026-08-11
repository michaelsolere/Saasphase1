import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export type PostBirthCapacitySnapshot = {
  id: string;
  version: number;
  malePreserved: number;
  femalePreserved: number;
  maleUncertain: number;
  femaleUncertain: number;
};
export type PostBirthLitterSnapshot = {
  id: string;
  name: string;
  maleBorn: number;
  femaleBorn: number;
  capacity: PostBirthCapacitySnapshot | null;
};
export type PostBirthLineSnapshot = {
  id: string;
  reservationId: string;
  sex: "male" | "female" | null;
  outcome: string;
  rank: number;
  blocker: string | null;
  staleReason: string | null;
  family: string;
};
export type PostBirthWaveSnapshot = {
  id: string;
  litterId: string;
  kind: "ordinary" | "complementary";
  status: string;
  version: number;
  lines: PostBirthLineSnapshot[];
};
export type PostBirthDraftSnapshot = {
  id: string;
  status: string;
  version: number;
  waves: PostBirthWaveSnapshot[];
};
export type PostBirthSnapshot = {
  outcome: string;
  role: "owner" | "admin" | "member" | "viewer";
  canMutate: boolean;
  group: { id: string; name: string };
  litters: PostBirthLitterSnapshot[];
  drafts: PostBirthDraftSnapshot[];
  positions: Array<{ id: string; reservationId: string; litterId: string; sex: string; status: string; rank: number; family: string }>;
  incidents: Array<{ id: string; litterId: string; type: string; status: string; summary: string; details: string; openedAt: string }>;
  candidates: PostBirthCandidate[];
  directCandidates: DirectSaleCandidate[];
  availableAnimals: DirectSaleAnimal[];
  limitedSummary: { confirmedPlaces: number; openIncidents: number } | null;
};

export type PostBirthCandidate = {
  reservationId: string;
  family: string;
  litterId: string;
  rank: number | null;
  late: boolean;
  preference: string;
};
export type DirectSaleCandidate = { id: string; family: string };
export type DirectSaleAnimal = { id: string; litterId: string; name: string; sex: string };
export type DirectSaleSnapshot = {
  outcome: string;
  role: string;
  canMutate: boolean;
  sales: Array<Record<string, unknown>>;
  count?: number;
};

export async function loadPostBirthPositioning(
  supabase: SupabaseClient<Database>,
  litterGroupId: string,
) {
  const rpcClient = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const snapshotResult = await rpcClient.rpc("read_post_birth_positioning_snapshot", {
    p_litter_group_id: litterGroupId,
  });
  if (snapshotResult.error || !snapshotResult.data) {
    throw new Error(snapshotResult.error?.message ?? "post_birth_snapshot_failed");
  }
  const snapshot = snapshotResult.data as PostBirthSnapshot;
  if (snapshot.outcome !== "ok") return { snapshot, candidates: [], directCandidates: [], animals: [], directSales: {} };

  if (!snapshot.canMutate) {
    return { snapshot, candidates: [], directCandidates: [], animals: [], directSales: {} };
  }

  const litterIds = snapshot.litters.map((litter) => litter.id);
  const directSales: Record<string, DirectSaleSnapshot> = {};
  await Promise.all(
    litterIds.map(async (litterId) => {
      const result = await rpcClient.rpc("read_direct_late_sales_snapshot", { p_litter_id: litterId });
      if (!result.error && result.data) directSales[litterId] = result.data as DirectSaleSnapshot;
    }),
  );
  return {
    snapshot,
    candidates: snapshot.candidates,
    directCandidates: snapshot.directCandidates,
    animals: snapshot.availableAnimals,
    directSales,
  };
}
