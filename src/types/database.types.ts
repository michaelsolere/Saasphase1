export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      animals: {
        Row: {
          birth_date: string | null
          birth_order: number | null
          birth_time: string | null
          birth_weight_grams: number | null
          breed: string
          call_name: string | null
          coat_color: string | null
          collar_color_current: string | null
          collar_color_initial: string | null
          collar_color_note: string | null
          color: string | null
          created_at: string
          created_by: string | null
          death_date: string | null
          deleted_at: string | null
          father_id: string | null
          id: string
          identification_number: string | null
          is_breeder: boolean
          is_external: boolean
          is_retired: boolean
          litter_id: string | null
          lof_number: string | null
          mother_id: string | null
          notes: string | null
          official_name: string | null
          organization_id: string
          ownership_status: string
          pedigree_url: string | null
          sex: string
          species: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          birth_date?: string | null
          birth_order?: number | null
          birth_time?: string | null
          birth_weight_grams?: number | null
          breed?: string
          call_name?: string | null
          coat_color?: string | null
          collar_color_current?: string | null
          collar_color_initial?: string | null
          collar_color_note?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          death_date?: string | null
          deleted_at?: string | null
          father_id?: string | null
          id?: string
          identification_number?: string | null
          is_breeder?: boolean
          is_external?: boolean
          is_retired?: boolean
          litter_id?: string | null
          lof_number?: string | null
          mother_id?: string | null
          notes?: string | null
          official_name?: string | null
          organization_id: string
          ownership_status?: string
          pedigree_url?: string | null
          sex?: string
          species?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          birth_date?: string | null
          birth_order?: number | null
          birth_time?: string | null
          birth_weight_grams?: number | null
          breed?: string
          call_name?: string | null
          coat_color?: string | null
          collar_color_current?: string | null
          collar_color_initial?: string | null
          collar_color_note?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          death_date?: string | null
          deleted_at?: string | null
          father_id?: string | null
          id?: string
          identification_number?: string | null
          is_breeder?: boolean
          is_external?: boolean
          is_retired?: boolean
          litter_id?: string | null
          lof_number?: string | null
          mother_id?: string | null
          notes?: string | null
          official_name?: string | null
          organization_id?: string
          ownership_status?: string
          pedigree_url?: string | null
          sex?: string
          species?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "animals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animals_father_organization_fk"
            columns: ["organization_id", "father_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "animals_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "animals_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "animals_mother_organization_fk"
            columns: ["organization_id", "mother_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "animals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animals_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          active_rank: number | null
          adults_count: number | null
          breed: string
          children_description: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          daily_absence: string | null
          deleted_at: string | null
          desired_litter_group_id: string | null
          desired_litter_id: string | null
          desired_period: string | null
          desired_quantity: number
          desired_sex_preference: string
          dog_experience: string | null
          form_data: Json
          form_submission_id: string | null
          garden_fenced: boolean | null
          has_garden: boolean | null
          housing_type: string | null
          id: string
          initial_rank: number | null
          internal_comment: string | null
          organization_id: string
          other_animals: string | null
          planned_activities: string | null
          project_description: string | null
          rank_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_channel: string | null
          species: string
          specific_project: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_rank?: number | null
          adults_count?: number | null
          breed?: string
          children_description?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          daily_absence?: string | null
          deleted_at?: string | null
          desired_litter_group_id?: string | null
          desired_litter_id?: string | null
          desired_period?: string | null
          desired_quantity?: number
          desired_sex_preference?: string
          dog_experience?: string | null
          form_data?: Json
          form_submission_id?: string | null
          garden_fenced?: boolean | null
          has_garden?: boolean | null
          housing_type?: string | null
          id?: string
          initial_rank?: number | null
          internal_comment?: string | null
          organization_id: string
          other_animals?: string | null
          planned_activities?: string | null
          project_description?: string | null
          rank_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_channel?: string | null
          species?: string
          specific_project?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_rank?: number | null
          adults_count?: number | null
          breed?: string
          children_description?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          daily_absence?: string | null
          deleted_at?: string | null
          desired_litter_group_id?: string | null
          desired_litter_id?: string | null
          desired_period?: string | null
          desired_quantity?: number
          desired_sex_preference?: string
          dog_experience?: string | null
          form_data?: Json
          form_submission_id?: string | null
          garden_fenced?: boolean | null
          has_garden?: boolean | null
          housing_type?: string | null
          id?: string
          initial_rank?: number | null
          internal_comment?: string | null
          organization_id?: string
          other_animals?: string | null
          planned_activities?: string | null
          project_description?: string | null
          rank_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_channel?: string | null
          species?: string
          specific_project?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "applications_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "applications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_form_submission_organization_fk"
            columns: ["organization_id", "form_submission_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "applications_litter_group_organization_fk"
            columns: ["organization_id", "desired_litter_group_id"]
            isOneToOne: false
            referencedRelation: "litter_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "applications_litter_organization_fk"
            columns: ["organization_id", "desired_litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "applications_litter_organization_fk"
            columns: ["organization_id", "desired_litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_roles: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ended_at: string | null
          id: string
          is_active: boolean
          notes: string | null
          organization_id: string
          role: string
          started_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id: string
          role: string
          started_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id?: string
          role?: string
          started_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_roles_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "contact_roles_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "contact_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_roles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_type: string
          country: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          display_name: string
          email: string | null
          family_or_structure_name: string | null
          first_name: string | null
          id: string
          internal_comment: string | null
          last_interaction_at: string | null
          last_name: string | null
          organization_id: string
          origin_channel: string | null
          origin_details: string | null
          phone: string | null
          postal_code: string | null
          primary_status: string
          restriction_added_at: string | null
          restriction_level: string
          restriction_reason: string | null
          restriction_review_at: string | null
          restriction_visible_admin_only: boolean
          secondary_phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_type?: string
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name: string
          email?: string | null
          family_or_structure_name?: string | null
          first_name?: string | null
          id?: string
          internal_comment?: string | null
          last_interaction_at?: string | null
          last_name?: string | null
          organization_id: string
          origin_channel?: string | null
          origin_details?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_status?: string
          restriction_added_at?: string | null
          restriction_level?: string
          restriction_reason?: string | null
          restriction_review_at?: string | null
          restriction_visible_admin_only?: boolean
          secondary_phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_type?: string
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string
          email?: string | null
          family_or_structure_name?: string | null
          first_name?: string | null
          id?: string
          internal_comment?: string | null
          last_interaction_at?: string | null
          last_name?: string | null
          organization_id?: string
          origin_channel?: string | null
          origin_details?: string | null
          phone?: string | null
          postal_code?: string | null
          primary_status?: string
          restriction_added_at?: string | null
          restriction_level?: string
          restriction_reason?: string | null
          restriction_review_at?: string | null
          restriction_visible_admin_only?: boolean
          secondary_phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_usages: {
        Row: {
          amount_used_cents: number
          contact_id: string
          created_at: string
          created_by: string | null
          credit_id: string
          deleted_at: string | null
          id: string
          notes: string | null
          organization_id: string
          target_payment_id: string | null
          target_reservation_id: string | null
          updated_at: string
          updated_by: string | null
          used_at: string
        }
        Insert: {
          amount_used_cents: number
          contact_id: string
          created_at?: string
          created_by?: string | null
          credit_id: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          target_payment_id?: string | null
          target_reservation_id?: string | null
          updated_at?: string
          updated_by?: string | null
          used_at?: string
        }
        Update: {
          amount_used_cents?: number
          contact_id?: string
          created_at?: string
          created_by?: string | null
          credit_id?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          target_payment_id?: string | null
          target_reservation_id?: string | null
          updated_at?: string
          updated_by?: string | null
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_usages_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credit_usages_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credit_usages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_usages_credit_organization_fk"
            columns: ["organization_id", "credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credit_usages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_usages_payment_organization_fk"
            columns: ["organization_id", "target_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credit_usages_reservation_organization_fk"
            columns: ["organization_id", "target_reservation_id"]
            isOneToOne: false
            referencedRelation: "reservation_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credit_usages_reservation_organization_fk"
            columns: ["organization_id", "target_reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credit_usages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credits: {
        Row: {
          amount_initial_cents: number
          amount_remaining_cents: number
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          expires_at: string | null
          id: string
          issued_at: string
          notes: string | null
          organization_id: string
          origin_payment_id: string | null
          origin_reservation_id: string | null
          reason: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_initial_cents: number
          amount_remaining_cents: number
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          notes?: string | null
          organization_id: string
          origin_payment_id?: string | null
          origin_reservation_id?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_initial_cents?: number
          amount_remaining_cents?: number
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          notes?: string | null
          organization_id?: string
          origin_payment_id?: string | null
          origin_reservation_id?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credits_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credits_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_payment_organization_fk"
            columns: ["organization_id", "origin_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credits_reservation_organization_fk"
            columns: ["organization_id", "origin_reservation_id"]
            isOneToOne: false
            referencedRelation: "reservation_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credits_reservation_organization_fk"
            columns: ["organization_id", "origin_reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "credits_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signed_returns: {
        Row: {
          created_at: string
          created_by: string
          document_id: string
          file_path: string
          file_sha256: string
          file_size_bytes: number
          id: string
          mime_type: string
          organization_id: string
          received_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id: string
          file_path: string
          file_sha256: string
          file_size_bytes: number
          id: string
          mime_type: string
          organization_id: string
          received_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string
          file_path?: string
          file_sha256?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          organization_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signed_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signed_returns_document_organization_fk"
            columns: ["organization_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "document_signed_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_template_families: {
        Row: {
          breed: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_type: string
          id: string
          name: string
          organization_id: string
          species: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          breed?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_type: string
          id?: string
          name: string
          organization_id: string
          species?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          breed?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_type?: string
          id?: string
          name?: string
          organization_id?: string
          species?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_template_families_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_families_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_template_families_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          breed: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_type: string
          family_id: string
          id: string
          is_active: boolean
          lifecycle_status: string
          name: string
          organization_id: string
          publication_metadata_is_legacy: boolean
          published_at: string | null
          published_by: string | null
          species: string
          template_content: string | null
          template_format: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          breed?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_type: string
          family_id: string
          id?: string
          is_active?: boolean
          lifecycle_status?: string
          name: string
          organization_id: string
          publication_metadata_is_legacy?: boolean
          published_at?: string | null
          published_by?: string | null
          species?: string
          template_content?: string | null
          template_format?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          breed?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_type?: string
          family_id?: string
          id?: string
          is_active?: boolean
          lifecycle_status?: string
          name?: string
          organization_id?: string
          publication_metadata_is_legacy?: boolean
          published_at?: string | null
          published_by?: string | null
          species?: string
          template_content?: string | null
          template_format?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_family_taxonomy_fk"
            columns: [
              "organization_id",
              "family_id",
              "document_type",
              "species",
              "breed",
            ]
            isOneToOne: false
            referencedRelation: "document_template_families"
            referencedColumns: [
              "organization_id",
              "id",
              "document_type",
              "species",
              "breed",
            ]
          },
          {
            foreignKeyName: "document_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          animal_id: string | null
          application_id: string | null
          archived_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_type: string
          expires_at: string | null
          file_name: string | null
          file_path: string | null
          file_sha256: string | null
          file_size_bytes: number | null
          generated_at: string | null
          generated_from_template: boolean
          generation_data: Json
          id: string
          litter_group_id: string | null
          litter_id: string | null
          mime_type: string | null
          notes: string | null
          organization_id: string
          payment_id: string | null
          received_at: string | null
          replaces_document_id: string | null
          reservation_id: string | null
          sent_at: string | null
          signature_required: boolean
          signed_at: string | null
          source_template_version: number | null
          status: string
          superseded_at: string | null
          template_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          animal_id?: string | null
          application_id?: string | null
          archived_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_type: string
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_sha256?: string | null
          file_size_bytes?: number | null
          generated_at?: string | null
          generated_from_template?: boolean
          generation_data?: Json
          id?: string
          litter_group_id?: string | null
          litter_id?: string | null
          mime_type?: string | null
          notes?: string | null
          organization_id: string
          payment_id?: string | null
          received_at?: string | null
          replaces_document_id?: string | null
          reservation_id?: string | null
          sent_at?: string | null
          signature_required?: boolean
          signed_at?: string | null
          source_template_version?: number | null
          status?: string
          superseded_at?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          animal_id?: string | null
          application_id?: string | null
          archived_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_type?: string
          expires_at?: string | null
          file_name?: string | null
          file_path?: string | null
          file_sha256?: string | null
          file_size_bytes?: number | null
          generated_at?: string | null
          generated_from_template?: boolean
          generation_data?: Json
          id?: string
          litter_group_id?: string | null
          litter_id?: string | null
          mime_type?: string | null
          notes?: string | null
          organization_id?: string
          payment_id?: string | null
          received_at?: string | null
          replaces_document_id?: string | null
          reservation_id?: string | null
          sent_at?: string | null
          signature_required?: boolean
          signed_at?: string | null
          source_template_version?: number | null
          status?: string
          superseded_at?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_animal_organization_fk"
            columns: ["organization_id", "animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "application_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_litter_group_organization_fk"
            columns: ["organization_id", "litter_group_id"]
            isOneToOne: false
            referencedRelation: "litter_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_payment_organization_fk"
            columns: ["organization_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_replaces_document_organization_fk"
            columns: ["organization_id", "replaces_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservation_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "documents_template_exact_fk"
            columns: [
              "organization_id",
              "template_id",
              "source_template_version",
            ]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["organization_id", "id", "version"]
          },
          {
            foreignKeyName: "documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_delivery_attempts: {
        Row: {
          attempt_count: number
          brevo_message_id: string | null
          brevo_template_id: number | null
          brevo_template_modified_at: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email_template_id: string | null
          failed_at: string | null
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          last_error_code: string | null
          litter_group_id: string | null
          litter_id: string | null
          message_type: string
          organization_id: string
          recipient_email: string
          recipient_name: string | null
          reservation_id: string | null
          sent_at: string | null
          status: string
          subject_snapshot: string | null
          updated_at: string
          updated_by: string | null
          variables_snapshot: Json
        }
        Insert: {
          attempt_count?: number
          brevo_message_id?: string | null
          brevo_template_id?: number | null
          brevo_template_modified_at?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email_template_id?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          litter_group_id?: string | null
          litter_id?: string | null
          message_type: string
          organization_id: string
          recipient_email: string
          recipient_name?: string | null
          reservation_id?: string | null
          sent_at?: string | null
          status?: string
          subject_snapshot?: string | null
          updated_at?: string
          updated_by?: string | null
          variables_snapshot?: Json
        }
        Update: {
          attempt_count?: number
          brevo_message_id?: string | null
          brevo_template_id?: number | null
          brevo_template_modified_at?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email_template_id?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          litter_group_id?: string | null
          litter_id?: string | null
          message_type?: string
          organization_id?: string
          recipient_email?: string
          recipient_name?: string | null
          reservation_id?: string | null
          sent_at?: string | null
          status?: string
          subject_snapshot?: string | null
          updated_at?: string
          updated_by?: string | null
          variables_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_delivery_attempts_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_email_template_organization_fk"
            columns: ["organization_id", "email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_litter_group_organization_fk"
            columns: ["organization_id", "litter_group_id"]
            isOneToOne: false
            referencedRelation: "litter_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservation_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "email_delivery_attempts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          brevo_template_id: number | null
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          organization_id: string
          subject: string
          template_key: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body: string
          brevo_template_id?: number | null
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          subject: string
          template_key: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          brevo_template_id?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          subject?: string
          template_key?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actual_at: string | null
          animal_id: string | null
          application_id: string | null
          assigned_to: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          document_id: string | null
          event_type: string
          id: string
          is_task: boolean
          litter_id: string | null
          organization_id: string
          payment_id: string | null
          planned_at: string | null
          planned_date: string | null
          priority: string
          reservation_id: string | null
          status: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_at?: string | null
          animal_id?: string | null
          application_id?: string | null
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          event_type: string
          id?: string
          is_task?: boolean
          litter_id?: string | null
          organization_id: string
          payment_id?: string | null
          planned_at?: string | null
          planned_date?: string | null
          priority?: string
          reservation_id?: string | null
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_at?: string | null
          animal_id?: string | null
          application_id?: string | null
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          document_id?: string | null
          event_type?: string
          id?: string
          is_task?: boolean
          litter_id?: string | null
          organization_id?: string
          payment_id?: string | null
          planned_at?: string | null
          planned_date?: string | null
          priority?: string
          reservation_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_animal_organization_fk"
            columns: ["organization_id", "animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "application_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_document_organization_fk"
            columns: ["organization_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_payment_organization_fk"
            columns: ["organization_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservation_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "events_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          application_id: string | null
          breed: string
          city: string | null
          consent_contact: boolean
          consent_data_processing: boolean
          contact_id: string | null
          country: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          desired_sex_preference: string
          duplicate_candidate_contact_id: string | null
          duplicate_resolution: string | null
          email: string | null
          family_or_structure_name: string | null
          first_name: string | null
          form_type: string
          id: string
          internal_comment: string | null
          ip_address: unknown
          last_name: string | null
          organization_id: string
          phone: string | null
          postal_code: string | null
          project_description: string | null
          public_form_id: string
          public_reference: string
          raw_data: Json
          reviewed_at: string | null
          reviewed_by: string | null
          source_channel: string
          species: string
          status: string
          submitted_at: string
          updated_at: string
          updated_by: string | null
          user_agent: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          application_id?: string | null
          breed?: string
          city?: string | null
          consent_contact?: boolean
          consent_data_processing?: boolean
          contact_id?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          desired_sex_preference?: string
          duplicate_candidate_contact_id?: string | null
          duplicate_resolution?: string | null
          email?: string | null
          family_or_structure_name?: string | null
          first_name?: string | null
          form_type?: string
          id?: string
          internal_comment?: string | null
          ip_address?: unknown
          last_name?: string | null
          organization_id: string
          phone?: string | null
          postal_code?: string | null
          project_description?: string | null
          public_form_id: string
          public_reference?: string
          raw_data?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_channel?: string
          species?: string
          status?: string
          submitted_at?: string
          updated_at?: string
          updated_by?: string | null
          user_agent?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          application_id?: string | null
          breed?: string
          city?: string | null
          consent_contact?: boolean
          consent_data_processing?: boolean
          contact_id?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          desired_sex_preference?: string
          duplicate_candidate_contact_id?: string | null
          duplicate_resolution?: string | null
          email?: string | null
          family_or_structure_name?: string | null
          first_name?: string | null
          form_type?: string
          id?: string
          internal_comment?: string | null
          ip_address?: unknown
          last_name?: string | null
          organization_id?: string
          phone?: string | null
          postal_code?: string | null
          project_description?: string | null
          public_form_id?: string
          public_reference?: string
          raw_data?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_channel?: string
          species?: string
          status?: string
          submitted_at?: string
          updated_at?: string
          updated_by?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "application_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "form_submissions_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "form_submissions_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "form_submissions_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "form_submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_duplicate_contact_organization_fk"
            columns: ["organization_id", "duplicate_candidate_contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "form_submissions_duplicate_contact_organization_fk"
            columns: ["organization_id", "duplicate_candidate_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "form_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_public_form_organization_fk"
            columns: ["organization_id", "public_form_id"]
            isOneToOne: false
            referencedRelation: "public_forms"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "form_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      litter_groups: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          expected_period_end: string | null
          expected_period_start: string | null
          id: string
          name: string
          organization_id: string
          species: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expected_period_end?: string | null
          expected_period_start?: string | null
          id?: string
          name: string
          organization_id: string
          species?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expected_period_end?: string | null
          expected_period_start?: string | null
          id?: string
          name?: string
          organization_id?: string
          species?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "litter_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "litter_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "litter_groups_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      litters: {
        Row: {
          actual_birth_date: string | null
          alive_count: number | null
          born_female_count: number | null
          born_male_count: number | null
          born_total_count: number | null
          breed: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          estimated_ovulation_date: string | null
          expected_birth_date: string | null
          expected_puppy_count: number | null
          father_id: string | null
          id: string
          litter_group_id: string | null
          mating_date: string | null
          mating_date_2: string | null
          mother_id: string | null
          name: string
          notes: string | null
          organization_id: string
          pregnancy_confirmation_method: string | null
          pregnancy_confirmed_at: string | null
          species: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_birth_date?: string | null
          alive_count?: number | null
          born_female_count?: number | null
          born_male_count?: number | null
          born_total_count?: number | null
          breed?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          estimated_ovulation_date?: string | null
          expected_birth_date?: string | null
          expected_puppy_count?: number | null
          father_id?: string | null
          id?: string
          litter_group_id?: string | null
          mating_date?: string | null
          mating_date_2?: string | null
          mother_id?: string | null
          name: string
          notes?: string | null
          organization_id: string
          pregnancy_confirmation_method?: string | null
          pregnancy_confirmed_at?: string | null
          species?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_birth_date?: string | null
          alive_count?: number | null
          born_female_count?: number | null
          born_male_count?: number | null
          born_total_count?: number | null
          breed?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          estimated_ovulation_date?: string | null
          expected_birth_date?: string | null
          expected_puppy_count?: number | null
          father_id?: string | null
          id?: string
          litter_group_id?: string | null
          mating_date?: string | null
          mating_date_2?: string | null
          mother_id?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          pregnancy_confirmation_method?: string | null
          pregnancy_confirmed_at?: string | null
          species?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "litters_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "litters_father_organization_fk"
            columns: ["organization_id", "father_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "litters_litter_group_organization_fk"
            columns: ["organization_id", "litter_group_id"]
            isOneToOne: false
            referencedRelation: "litter_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "litters_mother_organization_fk"
            columns: ["organization_id", "mother_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "litters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "litters_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          animal_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          file_name: string | null
          file_path: string
          file_size_bytes: number | null
          height_px: number | null
          id: string
          is_primary: boolean
          litter_id: string | null
          media_type: string
          mime_type: string | null
          organization_id: string
          publication_authorization: string
          puppy_age_days: number | null
          received_at: string | null
          reservation_id: string | null
          source: string
          tags: string[]
          taken_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          visibility: string
          width_px: number | null
        }
        Insert: {
          animal_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_name?: string | null
          file_path: string
          file_size_bytes?: number | null
          height_px?: number | null
          id?: string
          is_primary?: boolean
          litter_id?: string | null
          media_type?: string
          mime_type?: string | null
          organization_id: string
          publication_authorization?: string
          puppy_age_days?: number | null
          received_at?: string | null
          reservation_id?: string | null
          source?: string
          tags?: string[]
          taken_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          visibility?: string
          width_px?: number | null
        }
        Update: {
          animal_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          file_name?: string | null
          file_path?: string
          file_size_bytes?: number | null
          height_px?: number | null
          id?: string
          is_primary?: boolean
          litter_id?: string | null
          media_type?: string
          mime_type?: string | null
          organization_id?: string
          publication_authorization?: string
          puppy_age_days?: number | null
          received_at?: string | null
          reservation_id?: string | null
          source?: string
          tags?: string[]
          taken_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          visibility?: string
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_animal_organization_fk"
            columns: ["organization_id", "animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "media_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "media_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "media_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "media_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservation_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "media_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "media_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          organization_id: string
          profile_id: string
          role: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          organization_id: string
          profile_id: string
          role?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          organization_id?: string
          profile_id?: string
          role?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          animal_id: string | null
          application_id: string | null
          body: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          id: string
          is_pinned: boolean
          litter_id: string | null
          note_type: string
          organization_id: string
          payment_id: string | null
          reservation_id: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          visibility: string
        }
        Insert: {
          animal_id?: string | null
          application_id?: string | null
          body: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          is_pinned?: boolean
          litter_id?: string | null
          note_type?: string
          organization_id: string
          payment_id?: string | null
          reservation_id?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Update: {
          animal_id?: string | null
          application_id?: string | null
          body?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          is_pinned?: boolean
          litter_id?: string | null
          note_type?: string
          organization_id?: string
          payment_id?: string | null
          reservation_id?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_animal_organization_fk"
            columns: ["organization_id", "animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "application_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_document_organization_fk"
            columns: ["organization_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_payment_organization_fk"
            columns: ["organization_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservation_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_document_settings: {
        Row: {
          commitment_certificate_text: string | null
          created_at: string
          created_by: string | null
          credit_terms: string | null
          deleted_at: string | null
          deposit_terms: string | null
          id: string
          legal_mentions: string | null
          mediator_contact: string | null
          mediator_name: string | null
          mediator_website_url: string | null
          organization_id: string
          postponement_terms: string | null
          refund_terms: string | null
          reservation_contract_terms: string | null
          signature_city_default: string | null
          updated_at: string
          updated_by: string | null
          withholding_terms: string | null
        }
        Insert: {
          commitment_certificate_text?: string | null
          created_at?: string
          created_by?: string | null
          credit_terms?: string | null
          deleted_at?: string | null
          deposit_terms?: string | null
          id?: string
          legal_mentions?: string | null
          mediator_contact?: string | null
          mediator_name?: string | null
          mediator_website_url?: string | null
          organization_id: string
          postponement_terms?: string | null
          refund_terms?: string | null
          reservation_contract_terms?: string | null
          signature_city_default?: string | null
          updated_at?: string
          updated_by?: string | null
          withholding_terms?: string | null
        }
        Update: {
          commitment_certificate_text?: string | null
          created_at?: string
          created_by?: string | null
          credit_terms?: string | null
          deleted_at?: string | null
          deposit_terms?: string | null
          id?: string
          legal_mentions?: string | null
          mediator_contact?: string | null
          mediator_name?: string | null
          mediator_website_url?: string | null
          organization_id?: string
          postponement_terms?: string | null
          refund_terms?: string | null
          reservation_contract_terms?: string | null
          signature_city_default?: string | null
          updated_at?: string
          updated_by?: string | null
          withholding_terms?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_document_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_document_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_document_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_representatives: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          display_name: string
          email: string | null
          first_name: string | null
          id: string
          is_active: boolean
          is_default_signatory: boolean
          last_name: string | null
          organization_id: string
          phone: string | null
          representative_role: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          is_default_signatory?: boolean
          last_name?: string | null
          organization_id: string
          phone?: string | null
          representative_role?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          display_name?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          is_default_signatory?: boolean
          last_name?: string | null
          organization_id?: string
          phone?: string | null
          representative_role?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_representatives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_representatives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_representatives_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          created_at: string
          created_by: string | null
          default_arrhes_second_payment_cents: number
          default_currency: string
          default_dog_breed: string
          default_female_puppy_price_cents: number | null
          default_male_puppy_price_cents: number | null
          default_pre_reservation_deposit_cents: number
          default_puppy_price_cents: number | null
          default_species: string
          deleted_at: string | null
          dog_gestation_average_days: number
          dog_ultrasound_max_day: number
          dog_ultrasound_min_day: number
          dog_xray_day: number
          id: string
          organization_id: string
          post_adoption_follow_up_1_days: number
          post_adoption_follow_up_2_months: number
          pre_reservation_response_delay_days: number
          puppy_adoption_age_weeks: number
          puppy_choice_age_weeks: number
          settings_json: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_arrhes_second_payment_cents?: number
          default_currency?: string
          default_dog_breed?: string
          default_female_puppy_price_cents?: number | null
          default_male_puppy_price_cents?: number | null
          default_pre_reservation_deposit_cents?: number
          default_puppy_price_cents?: number | null
          default_species?: string
          deleted_at?: string | null
          dog_gestation_average_days?: number
          dog_ultrasound_max_day?: number
          dog_ultrasound_min_day?: number
          dog_xray_day?: number
          id?: string
          organization_id: string
          post_adoption_follow_up_1_days?: number
          post_adoption_follow_up_2_months?: number
          pre_reservation_response_delay_days?: number
          puppy_adoption_age_weeks?: number
          puppy_choice_age_weeks?: number
          settings_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_arrhes_second_payment_cents?: number
          default_currency?: string
          default_dog_breed?: string
          default_female_puppy_price_cents?: number | null
          default_male_puppy_price_cents?: number | null
          default_pre_reservation_deposit_cents?: number
          default_puppy_price_cents?: number | null
          default_species?: string
          deleted_at?: string | null
          dog_gestation_average_days?: number
          dog_ultrasound_max_day?: number
          dog_ultrasound_min_day?: number
          dog_xray_day?: number
          id?: string
          organization_id?: string
          post_adoption_follow_up_1_days?: number
          post_adoption_follow_up_2_months?: number
          pre_reservation_response_delay_days?: number
          puppy_adoption_age_weeks?: number
          puppy_choice_age_weeks?: number
          settings_json?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          affix_name: string | null
          cat_affix_name: string | null
          city: string | null
          country: string
          created_at: string
          deleted_at: string | null
          dog_affix_name: string | null
          email: string | null
          id: string
          legal_form: string | null
          legal_name: string | null
          name: string
          phone: string | null
          postal_code: string | null
          siret: string | null
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          affix_name?: string | null
          cat_affix_name?: string | null
          city?: string | null
          country?: string
          created_at?: string
          deleted_at?: string | null
          dog_affix_name?: string | null
          email?: string | null
          id?: string
          legal_form?: string | null
          legal_name?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          siret?: string | null
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          affix_name?: string | null
          cat_affix_name?: string | null
          city?: string | null
          country?: string
          created_at?: string
          deleted_at?: string | null
          dog_affix_name?: string | null
          email?: string | null
          id?: string
          legal_form?: string | null
          legal_name?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          siret?: string | null
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          document_id: string | null
          due_date: string | null
          external_reference: string | null
          id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          payment_method: string
          payment_type: string
          refunded_at: string | null
          requested_at: string | null
          reservation_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_cents: number
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          document_id?: string | null
          due_date?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          payment_method?: string
          payment_type: string
          refunded_at?: string | null
          requested_at?: string | null
          reservation_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_cents?: number
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          document_id?: string | null
          due_date?: string | null
          external_reference?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_method?: string
          payment_type?: string
          refunded_at?: string | null
          requested_at?: string | null
          reservation_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payments_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_document_organization_fk"
            columns: ["organization_id", "document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservation_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payments_reservation_organization_fk"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      public_forms: {
        Row: {
          breed: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          form_type: string
          id: string
          is_active: boolean
          litter_group_id: string | null
          litter_id: string | null
          name: string
          organization_id: string
          slug: string
          species: string
          success_message: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          breed?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          form_type?: string
          id?: string
          is_active?: boolean
          litter_group_id?: string | null
          litter_id?: string | null
          name: string
          organization_id: string
          slug: string
          species?: string
          success_message?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          breed?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          form_type?: string
          id?: string
          is_active?: boolean
          litter_group_id?: string | null
          litter_id?: string | null
          name?: string
          organization_id?: string
          slug?: string
          species?: string
          success_message?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_forms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_forms_litter_group_organization_fk"
            columns: ["organization_id", "litter_group_id"]
            isOneToOne: false
            referencedRelation: "litter_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "public_forms_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "public_forms_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "public_forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_forms_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          adoption_completed_at: string | null
          adoption_planned_at: string | null
          animal_assigned_at: string | null
          animal_assignment_locked: boolean
          animal_id: string | null
          application_id: string | null
          breed: string
          choice_meeting_at: string | null
          choice_meeting_mode: string
          contact_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          financial_resolution: string
          financial_resolution_notes: string | null
          id: string
          internal_comment: string | null
          litter_group_id: string | null
          litter_id: string | null
          organization_id: string
          pre_reservation_deadline: string | null
          price_cents: number | null
          rank_active: number | null
          rank_assigned_at: string | null
          rank_expires_at: string | null
          rank_initial: number | null
          rank_priority_override: boolean
          rank_priority_reason: string | null
          reservation_confirmed_at: string | null
          reserved_sex_preference: string
          species: string
          status: string
          updated_at: string
          updated_by: string | null
          withdrawal_reason: string | null
          withdrawn_at: string | null
        }
        Insert: {
          adoption_completed_at?: string | null
          adoption_planned_at?: string | null
          animal_assigned_at?: string | null
          animal_assignment_locked?: boolean
          animal_id?: string | null
          application_id?: string | null
          breed?: string
          choice_meeting_at?: string | null
          choice_meeting_mode?: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          financial_resolution?: string
          financial_resolution_notes?: string | null
          id?: string
          internal_comment?: string | null
          litter_group_id?: string | null
          litter_id?: string | null
          organization_id: string
          pre_reservation_deadline?: string | null
          price_cents?: number | null
          rank_active?: number | null
          rank_assigned_at?: string | null
          rank_expires_at?: string | null
          rank_initial?: number | null
          rank_priority_override?: boolean
          rank_priority_reason?: string | null
          reservation_confirmed_at?: string | null
          reserved_sex_preference?: string
          species?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
        }
        Update: {
          adoption_completed_at?: string | null
          adoption_planned_at?: string | null
          animal_assigned_at?: string | null
          animal_assignment_locked?: boolean
          animal_id?: string | null
          application_id?: string | null
          breed?: string
          choice_meeting_at?: string | null
          choice_meeting_mode?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          financial_resolution?: string
          financial_resolution_notes?: string | null
          id?: string
          internal_comment?: string | null
          litter_group_id?: string | null
          litter_id?: string | null
          organization_id?: string
          pre_reservation_deadline?: string | null
          price_cents?: number | null
          rank_active?: number | null
          rank_assigned_at?: string | null
          rank_expires_at?: string | null
          rank_initial?: number | null
          rank_priority_override?: boolean
          rank_priority_reason?: string | null
          reservation_confirmed_at?: string | null
          reserved_sex_preference?: string
          species?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_animal_organization_fk"
            columns: ["organization_id", "animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "application_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_litter_group_organization_fk"
            columns: ["organization_id", "litter_group_id"]
            isOneToOne: false
            referencedRelation: "litter_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      application_overview: {
        Row: {
          active_rank: number | null
          breed: string | null
          contact_display_name: string | null
          contact_email: string | null
          contact_id: string | null
          contact_phone: string | null
          created_at: string | null
          desired_sex_preference: string | null
          has_started_adopter_journey: boolean | null
          id: string | null
          initial_rank: number | null
          organization_id: string | null
          project_description: string | null
          public_form_id: string | null
          public_form_name: string | null
          public_form_slug: string | null
          review_status: string | null
          reviewed_at: string | null
          species: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "applications_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_overview: {
        Row: {
          active_roles: string[] | null
          application_count: number | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string | null
          last_interaction_at: string | null
          organization_id: string | null
          phone: string | null
          reservation_count: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      litter_overview: {
        Row: {
          actual_birth_date: string | null
          alive_count: number | null
          animal_count: number | null
          born_female_count: number | null
          born_male_count: number | null
          born_total_count: number | null
          breed: string | null
          created_at: string | null
          expected_birth_date: string | null
          expected_puppy_count: number | null
          father_call_name: string | null
          father_display_name: string | null
          father_id: string | null
          father_official_name: string | null
          id: string | null
          litter_group_id: string | null
          litter_group_name: string | null
          mother_call_name: string | null
          mother_display_name: string | null
          mother_id: string | null
          mother_official_name: string | null
          name: string | null
          organization_id: string | null
          reservation_count: number | null
          species: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "litters_father_organization_fk"
            columns: ["organization_id", "father_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "litters_litter_group_organization_fk"
            columns: ["organization_id", "litter_group_id"]
            isOneToOne: false
            referencedRelation: "litter_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "litters_mother_organization_fk"
            columns: ["organization_id", "mother_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "litters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_form_public_view: {
        Row: {
          breed: string | null
          description: string | null
          slug: string | null
          species: string | null
          title: string | null
        }
        Relationships: []
      }
      reservation_overview: {
        Row: {
          adoption_completed_at: string | null
          adoption_planned_at: string | null
          animal_birth_order: number | null
          animal_call_name: string | null
          animal_collar_color_current: string | null
          animal_collar_color_initial: string | null
          animal_display_name: string | null
          animal_father_call_name: string | null
          animal_id: string | null
          animal_litter_id: string | null
          animal_mother_call_name: string | null
          animal_official_name: string | null
          animal_species: string | null
          application_id: string | null
          contact_display_name: string | null
          contact_id: string | null
          created_at: string | null
          currency: string | null
          id: string | null
          litter_group_id: string | null
          litter_group_name: string | null
          litter_id: string | null
          litter_name: string | null
          organization_id: string | null
          paid_cents: number | null
          price_cents: number | null
          rank_active: number | null
          rank_initial: number | null
          refunded_cents: number | null
          reserved_sex_preference: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservations_animal_organization_fk"
            columns: ["organization_id", "animal_id"]
            isOneToOne: false
            referencedRelation: "animals"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "application_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_application_organization_fk"
            columns: ["organization_id", "application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contact_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_contact_organization_fk"
            columns: ["organization_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_litter_group_organization_fk"
            columns: ["organization_id", "litter_group_id"]
            isOneToOne: false
            referencedRelation: "litter_groups"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litter_overview"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_litter_organization_fk"
            columns: ["organization_id", "litter_id"]
            isOneToOne: false
            referencedRelation: "litters"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      archive_document_signed_return: {
        Args: {
          p_document_id: string
          p_file_path: string
          p_file_sha256: string
          p_file_size_bytes: number
          p_mime_type: string
          p_organization_id: string
          p_signed_return_id: string
        }
        Returns: {
          outcome: string
          signed_return_id: string
        }[]
      }
      archive_suspect_form_submission_without_application: {
        Args: { p_form_submission_id: string; p_internal_comment?: string }
        Returns: {
          form_submission_id: string
        }[]
      }
      build_contact_display_name: {
        Args: {
          fallback?: string
          family_or_structure_name: string
          first_name: string
          last_name: string
        }
        Returns: string
      }
      create_document_template_draft: {
        Args: {
          p_family_id: string
          p_template_content?: string
          p_template_format?: string
        }
        Returns: string
      }
      create_organization_with_owner: {
        Args: { p_name: string; p_slug: string }
        Returns: string
      }
      create_pre_reservation_request_for_application: {
        Args: {
          p_application_id: string
          p_target_litter_group_id?: string
          p_target_litter_id?: string
        }
        Returns: {
          application_id: string
          outcome: string
          payment_created: boolean
          payment_id: string
          reason: string
          reservation_created: boolean
          reservation_id: string
        }[]
      }
      has_organization_role: {
        Args: { allowed_roles: string[]; org_id: string }
        Returns: boolean
      }
      is_member_of: { Args: { org_id: string }; Returns: boolean }
      mark_pre_reservation_payment_paid: {
        Args: {
          p_paid_at?: string
          p_payment_id: string
          p_payment_method?: string
        }
        Returns: {
          candidate_role_deactivated: boolean
          contact_id: string
          outcome: string
          payment_id: string
          pre_reservation_holder_activated: boolean
          reason: string
          reservation_id: string
          reservation_updated: boolean
        }[]
      }
      publish_document_template_version: {
        Args: { p_template_id: string }
        Returns: string
      }
      resolve_suspect_form_submission_existing_contact: {
        Args: { p_contact_id: string; p_form_submission_id: string }
        Returns: {
          application_id: string
          contact_id: string
        }[]
      }
      resolve_suspect_form_submission_new_contact: {
        Args: { p_form_submission_id: string }
        Returns: {
          application_id: string
          contact_id: string
        }[]
      }
      shares_organization_with: {
        Args: { other_profile_id: string }
        Returns: boolean
      }
      store_document_pdf_version: {
        Args: {
          p_animal_id?: string | null
          p_application_id?: string | null
          p_contact_id?: string | null
          p_document_id: string
          p_document_type: string
          p_file_path: string
          p_file_sha256: string
          p_file_size_bytes: number
          p_generated_at?: string | null
          p_generated_from_template?: boolean
          p_generation_data?: Json
          p_litter_group_id?: string | null
          p_litter_id?: string | null
          p_organization_id: string
          p_payment_id?: string | null
          p_replaces_document_id: string | null
          p_reservation_id?: string | null
          p_signature_required?: boolean
          p_source_template_version?: number | null
          p_template_id?: string | null
          p_title: string
          p_version: number
        }
        Returns: {
          document_id: string
          outcome: string
        }[]
      }
      submit_public_application: {
        Args: {
          p_address_line1?: string
          p_address_line2?: string
          p_city?: string
          p_consent_contact?: boolean
          p_consent_data_processing?: boolean
          p_country?: string
          p_desired_sex_preference?: string
          p_email?: string
          p_family_or_structure_name?: string
          p_first_name?: string
          p_form_slug: string
          p_ip_address?: unknown
          p_last_name?: string
          p_organization_slug: string
          p_phone?: string
          p_postal_code?: string
          p_project_description?: string
          p_raw_data?: Json
          p_source_channel?: string
          p_user_agent?: string
        }
        Returns: {
          public_submission_reference: string
          status: string
        }[]
      }
      use_credit: {
        Args: {
          p_amount_used_cents: number
          p_credit_id: string
          p_notes?: string
          p_organization_id: string
          p_target_payment_id?: string
          p_target_reservation_id?: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
