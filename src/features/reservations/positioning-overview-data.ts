import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export type PositioningOverviewItem = {
  groupId: string;
  groupName: string;
  status: string;
  litterCount: number;
  bornLitterCount: number;
  missingCapacityCount: number;
  openIncidentCount: number;
  openWaveCount: number;
  confirmedPlaceCount: number;
  needsAttention: boolean;
};

type GroupRow = { id: string; name: string; status: string };
type LitterRow = { id: string; litter_group_id: string | null; actual_birth_date: string | null };
type LitterLinkRow = { litter_id: string };


export async function loadPositioningOverview(
  supabase: SupabaseClient<Database>,
): Promise<PositioningOverviewItem[]> {
  const groupsResult = await supabase
    .from("litter_groups")
    .select("id, name, status")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (groupsResult.error) throw groupsResult.error;

  const groups = (groupsResult.data ?? []) as GroupRow[];
  if (!groups.length) return [];

  const groupIds = groups.map((group) => group.id);
  const littersResult = await supabase
    .from("litters")
    .select("id, litter_group_id, actual_birth_date")
    .in("litter_group_id", groupIds)
    .is("deleted_at", null);
  if (littersResult.error) throw littersResult.error;

  const litters = (littersResult.data ?? []) as LitterRow[];
  const litterIds = litters.map((litter) => litter.id);
  const loose = supabase as unknown as SupabaseClient;
  const empty = Promise.resolve({ data: [], error: null });
  const [capacities, incidents, waves, positions] = await Promise.all([
    litterIds.length
      ? loose.from("post_birth_capacity_states").select("litter_id").in("litter_id", litterIds)
      : empty,
    litterIds.length
      ? loose.from("post_birth_incidents").select("litter_id").in("litter_id", litterIds).eq("status", "open")
      : empty,
    litterIds.length
      ? loose.from("post_birth_positioning_waves").select("litter_id").in("litter_id", litterIds).eq("status", "open")
      : empty,
    litterIds.length
      ? loose.from("post_birth_positions").select("litter_id").in("litter_id", litterIds).eq("status", "confirmed")
      : empty,
  ]);
  const failed = [capacities, incidents, waves, positions].find((result) => result.error);
  if (failed?.error) throw failed.error;

  const capacityIds = new Set(((capacities.data ?? []) as LitterLinkRow[]).map((row) => row.litter_id));
  const openIncidents = (incidents.data ?? []) as LitterLinkRow[];
  const openWaves = (waves.data ?? []) as LitterLinkRow[];
  const confirmedPositions = (positions.data ?? []) as LitterLinkRow[];

  return groups.map((group) => {
    const groupLitters = litters.filter((litter) => litter.litter_group_id === group.id);
    const bornLitters = groupLitters.filter((litter) => Boolean(litter.actual_birth_date));
    const litterIdSet = new Set(groupLitters.map((litter) => litter.id));
    const missingCapacityCount = bornLitters.filter((litter) => !capacityIds.has(litter.id)).length;
    const openIncidentCount = openIncidents.filter((incident) => litterIdSet.has(incident.litter_id)).length;
    const openWaveCount = openWaves.filter((wave) => litterIdSet.has(wave.litter_id)).length;
    const confirmedPlaceCount = confirmedPositions.filter((position) => litterIdSet.has(position.litter_id)).length;

    return {
      groupId: group.id,
      groupName: group.name,
      status: group.status,
      litterCount: groupLitters.length,
      bornLitterCount: bornLitters.length,
      missingCapacityCount,
      openIncidentCount,
      openWaveCount,
      confirmedPlaceCount,
      needsAttention: missingCapacityCount > 0 || openIncidentCount > 0 || openWaveCount > 0,
    };
  });
}

export async function loadPositioningAttentionCount(supabase: SupabaseClient<Database>) {
  const overview = await loadPositioningOverview(supabase);
  return overview.filter((item) => item.needsAttention).length;
}
