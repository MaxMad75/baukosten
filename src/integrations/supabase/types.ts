export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      architect_estimate_items: {
        Row: {
          created_at: string
          estimate_id: string
          estimated_amount: number
          id: string
          kostengruppe_code: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          estimate_id: string
          estimated_amount?: number
          id?: string
          kostengruppe_code: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          estimate_id?: string
          estimated_amount?: number
          id?: string
          kostengruppe_code?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "architect_estimate_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "architect_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      architect_estimates: {
        Row: {
          created_at: string
          file_name: string | null
          file_path: string | null
          household_id: string
          id: string
          processed: boolean
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          household_id: string
          id?: string
          processed?: boolean
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          household_id?: string
          id?: string
          processed?: boolean
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "architect_estimates_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_journal: {
        Row: {
          category: string | null
          contractor_id: string | null
          created_at: string | null
          created_by_profile_id: string | null
          description: string
          entry_date: string
          household_id: string
          id: string
          photos: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          contractor_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          description: string
          entry_date: string
          household_id: string
          id?: string
          photos?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          contractor_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          description?: string
          entry_date?: string
          household_id?: string
          id?: string
          photos?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construction_journal_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_journal_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_journal_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          company_name: string
          contact_person: string | null
          created_at: string | null
          email: string | null
          household_id: string
          id: string
          notes: string | null
          phone: string | null
          rating: number | null
          trade: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          company_name: string
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          household_id: string
          id?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          trade?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          company_name?: string
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          household_id?: string
          id?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          trade?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractors_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      din276_kostengruppen: {
        Row: {
          code: string
          created_at: string
          id: string
          level: number
          name: string
          parent_code: string | null
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          level?: number
          name: string
          parent_code?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          level?: number
          name?: string
          parent_code?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          ai_analyzed: boolean
          ai_summary: string | null
          contractor_id: string | null
          created_at: string | null
          created_by_profile_id: string | null
          description: string | null
          document_type: string | null
          file_hash: string | null
          file_name: string
          file_path: string
          file_size: number | null
          household_id: string
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_analyzed?: boolean
          ai_summary?: string | null
          contractor_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          description?: string | null
          document_type?: string | null
          file_hash?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          household_id: string
          id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_analyzed?: boolean
          ai_summary?: string | null
          contractor_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          description?: string | null
          document_type?: string | null
          file_hash?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          household_id?: string
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          household_id: string
          id: string
          invited_by_profile_id: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          household_id: string
          id?: string
          invited_by_profile_id: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          household_id?: string
          id?: string
          invited_by_profile_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invitations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          ai_extracted: boolean
          amount: number
          company_name: string
          created_at: string
          created_by_profile_id: string | null
          description: string | null
          file_name: string | null
          file_path: string | null
          household_id: string
          id: string
          invoice_date: string
          invoice_number: string | null
          is_paid: boolean
          kostengruppe_code: string | null
          paid_by_profile_id: string | null
          payment_date: string | null
          updated_at: string
        }
        Insert: {
          ai_extracted?: boolean
          amount: number
          company_name: string
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          household_id: string
          id?: string
          invoice_date: string
          invoice_number?: string | null
          is_paid?: boolean
          kostengruppe_code?: string | null
          paid_by_profile_id?: string | null
          payment_date?: string | null
          updated_at?: string
        }
        Update: {
          ai_extracted?: boolean
          amount?: number
          company_name?: string
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          file_name?: string | null
          file_path?: string | null
          household_id?: string
          id?: string
          invoice_date?: string
          invoice_number?: string | null
          is_paid?: boolean
          kostengruppe_code?: string | null
          paid_by_profile_id?: string | null
          payment_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_paid_by_profile_id_fkey"
            columns: ["paid_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          household_id: string
          iban: string | null
          id: string
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          household_id: string
          iban?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          household_id?: string
          iban?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_household_id: { Args: never; Returns: string }
      is_household_member: {
        Args: { check_household_id: string }
        Returns: boolean
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
  public: {
    Enums: {},
  },
} as const
