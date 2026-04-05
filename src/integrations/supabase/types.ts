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
          block_id: string | null
          created_at: string
          estimate_id: string
          estimated_amount: number
          id: string
          is_gross: boolean
          kostengruppe_code: string
          notes: string | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          estimate_id: string
          estimated_amount?: number
          id?: string
          is_gross?: boolean
          kostengruppe_code: string
          notes?: string | null
        }
        Update: {
          block_id?: string | null
          created_at?: string
          estimate_id?: string
          estimated_amount?: number
          id?: string
          is_gross?: boolean
          kostengruppe_code?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "architect_estimate_items_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "estimate_blocks"
            referencedColumns: ["id"]
          },
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
          is_active: boolean
          notes: string | null
          parent_id: string | null
          processed: boolean
          uploaded_at: string
          version_id: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          household_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          parent_id?: string | null
          processed?: boolean
          uploaded_at?: string
          version_id?: string | null
          version_number?: number
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          household_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          parent_id?: string | null
          processed?: boolean
          uploaded_at?: string
          version_id?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "architect_estimates_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "architect_estimates_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "architect_estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "architect_estimates_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "estimate_versions"
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
            foreignKeyName: "construction_journal_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
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
          invoice_id: string | null
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
          invoice_id?: string | null
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
          invoice_id?: string | null
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
            foreignKeyName: "documents_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_blocks: {
        Row: {
          block_type: string
          created_at: string
          file_name: string | null
          file_path: string | null
          id: string
          label: string
          notes: string | null
          processed: boolean
          sort_order: number
          source_block_id: string | null
          version_id: string
        }
        Insert: {
          block_type?: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          label: string
          notes?: string | null
          processed?: boolean
          sort_order?: number
          source_block_id?: string | null
          version_id: string
        }
        Update: {
          block_type?: string
          created_at?: string
          file_name?: string | null
          file_path?: string | null
          id?: string
          label?: string
          notes?: string | null
          processed?: boolean
          sort_order?: number
          source_block_id?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estimate_blocks_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "estimate_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      estimate_versions: {
        Row: {
          created_at: string
          household_id: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          version_number?: number
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          version_number?: number
        }
        Relationships: []
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
          {
            foreignKeyName: "household_invitations_invited_by_profile_id_fkey"
            columns: ["invited_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
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
      invoice_allocations: {
        Row: {
          amount: number
          created_at: string | null
          estimate_item_id: string | null
          id: string
          invoice_id: string
          kostengruppe_code: string
          notes: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          estimate_item_id?: string | null
          id?: string
          invoice_id: string
          kostengruppe_code: string
          notes?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          estimate_item_id?: string | null
          id?: string
          invoice_id?: string
          kostengruppe_code?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_allocations_estimate_item_id_fkey"
            columns: ["estimate_item_id"]
            isOneToOne: false
            referencedRelation: "architect_estimate_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          profile_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date: string
          profile_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_splits: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          invoice_id: string
          percentage: number | null
          profile_id: string
          split_type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          invoice_id: string
          percentage?: number | null
          profile_id: string
          split_type?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          invoice_id?: string
          percentage?: number | null
          profile_id?: string
          split_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_splits_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_splits_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_splits_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
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
          is_gross: boolean
          is_paid: boolean
          kostengruppe_code: string | null
          net_amount: number | null
          paid_by_profile_id: string | null
          payment_date: string | null
          status: string
          tax_amount: number | null
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
          is_gross?: boolean
          is_paid?: boolean
          kostengruppe_code?: string | null
          net_amount?: number | null
          paid_by_profile_id?: string | null
          payment_date?: string | null
          status?: string
          tax_amount?: number | null
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
          is_gross?: boolean
          is_paid?: boolean
          kostengruppe_code?: string | null
          net_amount?: number | null
          paid_by_profile_id?: string | null
          payment_date?: string | null
          status?: string
          tax_amount?: number | null
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
            foreignKeyName: "invoices_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
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
          {
            foreignKeyName: "invoices_paid_by_profile_id_fkey"
            columns: ["paid_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_items: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          is_gross: boolean
          kostengruppe_code: string
          offer_id: string
        }
        Insert: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_gross?: boolean
          kostengruppe_code: string
          offer_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_gross?: boolean
          kostengruppe_code?: string
          offer_id?: string
        }
        Relationships: []
      }
      offers: {
        Row: {
          company_name: string
          contractor_id: string | null
          created_at: string | null
          created_by_profile_id: string | null
          document_id: string | null
          household_id: string
          id: string
          is_gross: boolean
          notes: string | null
          offer_date: string | null
          title: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          company_name: string
          contractor_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          document_id?: string | null
          household_id: string
          id?: string
          is_gross?: boolean
          notes?: string | null
          offer_date?: string | null
          title: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          company_name?: string
          contractor_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          document_id?: string | null
          household_id?: string
          id?: string
          is_gross?: boolean
          notes?: string | null
          offer_date?: string | null
          title?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: []
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
      profiles_safe: {
        Row: {
          created_at: string | null
          household_id: string | null
          iban: string | null
          id: string | null
          name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          household_id?: string | null
          iban?: never
          id?: string | null
          name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          household_id?: string | null
          iban?: never
          id?: string | null
          name?: string | null
          updated_at?: string | null
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
