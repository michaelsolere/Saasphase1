import type { Database } from "@/types/database.types";

export type DBAnimal = Database["public"]["Tables"]["animals"]["Row"];

export type AnimalListItem = Pick<
  DBAnimal,
  | "id"
  | "display_name"
  | "temporary_name"
  | "call_name"
  | "official_name"
  | "species"
  | "breed"
  | "sex"
  | "status"
  | "birth_date"
  | "litter_id"
  | "mother_id"
  | "father_id"
  | "identification_number"
  | "color"
  | "coat_color"
  | "created_at"
> & {
  litterName: string | null;
  litterGroupName: string | null;
  motherDisplayName: string | null;
  fatherDisplayName: string | null;
};
