import type { Database } from "@/types/database.types";

export type DBAnimal = Database["public"]["Tables"]["animals"]["Row"];

export type AnimalListItem = Pick<
  DBAnimal,
  | "id"
  | "call_name"
  | "official_name"
  | "species"
  | "breed"
  | "sex"
  | "status"
  | "ownership_status"
  | "is_breeder"
  | "is_external"
  | "is_retired"
  | "birth_date"
  | "litter_id"
  | "mother_id"
  | "father_id"
  | "birth_order"
  | "collar_color_current"
  | "collar_color_initial"
  | "identification_number"
  | "lof_number"
  | "color"
  | "coat_color"
  | "created_at"
> & {
  litterName: string | null;
  litterGroupName: string | null;
  motherCallName: string | null;
  fatherCallName: string | null;
  primaryPhoto: {
    url: string;
    width: number | null;
    height: number | null;
  } | null;
};
