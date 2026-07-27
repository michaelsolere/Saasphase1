import { revalidatePath } from "next/cache";

export function revalidateLitterCareTaskSchedulePaths(litterId: string) {
  revalidatePath("/litters/journal");
  revalidatePath("/litters/journal/calendar");
  revalidatePath("/calendar");
  revalidatePath("/calendar/today");
  revalidatePath(`/litters/${litterId}`);
}
