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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      billing_escrow: {
        Row: {
          created_at: string | null
          id: string
          locked_credits: number
          portfolio_id: string | null
          resolved_at: string | null
          status: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          locked_credits: number
          portfolio_id?: string | null
          resolved_at?: string | null
          status: string
          task_id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          locked_credits?: number
          portfolio_id?: string | null
          resolved_at?: string | null
          status?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_escrow_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          projection_data: Json | null
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          projection_data?: Json | null
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          projection_data?: Json | null
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loop_metrics_daily: {
        Row: {
          avg_llm_cost_per_verification: number | null
          avg_loops_to_settle: number | null
          created_at: string | null
          first_pass_rate: number | null
          id: string
          metric_date: string
          prompt_variant_id: string | null
          settled_count: number
          terminated_count: number
          topic_rejected_count: number
          total_verifications: number
        }
        Insert: {
          avg_llm_cost_per_verification?: number | null
          avg_loops_to_settle?: number | null
          created_at?: string | null
          first_pass_rate?: number | null
          id?: string
          metric_date?: string
          prompt_variant_id?: string | null
          settled_count?: number
          terminated_count?: number
          topic_rejected_count?: number
          total_verifications?: number
        }
        Update: {
          avg_llm_cost_per_verification?: number | null
          avg_loops_to_settle?: number | null
          created_at?: string | null
          first_pass_rate?: number | null
          id?: string
          metric_date?: string
          prompt_variant_id?: string | null
          settled_count?: number
          terminated_count?: number
          topic_rejected_count?: number
          total_verifications?: number
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          available_cash: number
          created_at: string | null
          id: string
          max_drawdown_limit: number
          max_loop_attempts: number
          max_position_size: number
          min_confidence_score: number
          min_sharpe_ratio: number
          name: string
          total_capital: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          available_cash?: number
          created_at?: string | null
          id?: string
          max_drawdown_limit?: number
          max_loop_attempts?: number
          max_position_size?: number
          min_confidence_score?: number
          min_sharpe_ratio?: number
          name?: string
          total_capital?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          available_cash?: number
          created_at?: string | null
          id?: string
          max_drawdown_limit?: number
          max_loop_attempts?: number
          max_position_size?: number
          min_confidence_score?: number
          min_sharpe_ratio?: number
          name?: string
          total_capital?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          average_purchase_price: number | null
          created_at: string
          dollar_amount: number | null
          id: string
          portfolio_id: string
          shares: number | null
          ticker: string
          updated_at: string
        }
        Insert: {
          average_purchase_price?: number | null
          created_at?: string
          dollar_amount?: number | null
          id?: string
          portfolio_id: string
          shares?: number | null
          ticker: string
          updated_at?: string
        }
        Update: {
          average_purchase_price?: number | null
          created_at?: string
          dollar_amount?: number | null
          id?: string
          portfolio_id?: string
          shares?: number | null
          ticker?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      query_log: {
        Row: {
          cost_credits: number
          created_at: string
          id: number
          latency_ms: number | null
          model_used: string
          query_tier: string
          rust_valid: boolean
          tokens_used: number
          user_id: string
          was_free: boolean
        }
        Insert: {
          cost_credits?: number
          created_at?: string
          id?: number
          latency_ms?: number | null
          model_used: string
          query_tier: string
          rust_valid?: boolean
          tokens_used?: number
          user_id: string
          was_free?: boolean
        }
        Update: {
          cost_credits?: number
          created_at?: string
          id?: number
          latency_ms?: number | null
          model_used?: string
          query_tier?: string
          rust_valid?: boolean
          tokens_used?: number
          user_id?: string
          was_free?: boolean
        }
        Relationships: []
      }
      research_log: {
        Row: {
          created_at: string
          drawdown: number | null
          id: number
          latency_ms: number | null
          model_used: string
          query_text: string
          response_summary: string | null
          score: number | null
          sharpe: number | null
          signal_type: string
          tier: string
          tokens_used: number
          user_id: string
        }
        Insert: {
          created_at?: string
          drawdown?: number | null
          id?: number
          latency_ms?: number | null
          model_used?: string
          query_text?: string
          response_summary?: string | null
          score?: number | null
          sharpe?: number | null
          signal_type?: string
          tier?: string
          tokens_used?: number
          user_id: string
        }
        Update: {
          created_at?: string
          drawdown?: number | null
          id?: number
          latency_ms?: number | null
          model_used?: string
          query_text?: string
          response_summary?: string | null
          score?: number | null
          sharpe?: number | null
          signal_type?: string
          tier?: string
          tokens_used?: number
          user_id?: string
        }
        Relationships: []
      }
      stock_memories: {
        Row: {
          created_at: string
          fact: string
          id: string
          source: string | null
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fact: string
          id?: string
          source?: string | null
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fact?: string
          id?: string
          source?: string | null
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_constraints: {
        Row: {
          constraint_key: string
          constraint_val: Json
          id: number
          updated_at: string
        }
        Insert: {
          constraint_key: string
          constraint_val?: Json
          id?: number
          updated_at?: string
        }
        Update: {
          constraint_key?: string
          constraint_val?: Json
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      trajectory_logs: {
        Row: {
          created_at: string | null
          id: string
          inquiry_text: string
          llm_cost_usd: number
          olea_fee_usd: number
          outcome: string
          portfolio_id: string
          provider_used: string | null
          topic_classification_json: Json | null
          user_id: string
          verification_loops_required: number
          verified_allocation_json: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inquiry_text: string
          llm_cost_usd?: number
          olea_fee_usd?: number
          outcome: string
          portfolio_id: string
          provider_used?: string | null
          topic_classification_json?: Json | null
          user_id: string
          verification_loops_required: number
          verified_allocation_json?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inquiry_text?: string
          llm_cost_usd?: number
          olea_fee_usd?: number
          outcome?: string
          portfolio_id?: string
          provider_used?: string | null
          topic_classification_json?: Json | null
          user_id?: string
          verification_loops_required?: number
          verified_allocation_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "trajectory_logs_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      user_subscriptions: {
        Row: {
          billing_cycle_start: string | null
          cost_limit_cents: number
          created_at: string | null
          credit_balance: number
          credits_updated_at: string | null
          free_queries_used: number
          id: string
          last_cost_reset: string | null
          last_verification_reset: string | null
          last_weekly_reset: string | null
          last_yearly_reset: string | null
          monthly_cost_cents: number
          monthly_verifications_limit: number
          monthly_verifications_used: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string | null
          user_id: string
          verification_count: number
          weekly_verifications_limit: number
          weekly_verifications_used: number
          yearly_verifications_limit: number
          yearly_verifications_used: number
        }
        Insert: {
          billing_cycle_start?: string | null
          cost_limit_cents?: number
          created_at?: string | null
          credit_balance?: number
          credits_updated_at?: string | null
          free_queries_used?: number
          id?: string
          last_cost_reset?: string | null
          last_verification_reset?: string | null
          last_weekly_reset?: string | null
          last_yearly_reset?: string | null
          monthly_cost_cents?: number
          monthly_verifications_limit?: number
          monthly_verifications_used?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string | null
          user_id: string
          verification_count?: number
          weekly_verifications_limit?: number
          weekly_verifications_used?: number
          yearly_verifications_limit?: number
          yearly_verifications_used?: number
        }
        Update: {
          billing_cycle_start?: string | null
          cost_limit_cents?: number
          created_at?: string | null
          credit_balance?: number
          credits_updated_at?: string | null
          free_queries_used?: number
          id?: string
          last_cost_reset?: string | null
          last_verification_reset?: string | null
          last_weekly_reset?: string | null
          last_yearly_reset?: string | null
          monthly_cost_cents?: number
          monthly_verifications_limit?: number
          monthly_verifications_used?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string | null
          user_id?: string
          verification_count?: number
          weekly_verifications_limit?: number
          weekly_verifications_used?: number
          yearly_verifications_limit?: number
          yearly_verifications_used?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_verification_cost: {
        Args: { p_cost_cents: number; p_user_id: string }
        Returns: undefined
      }
      check_cost_ceiling: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          current_cost_cents: number
          limit_cents: number
          warning_level: string
        }[]
      }
      get_global_research_health: { Args: never; Returns: Json }
      increment_verification_usage: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          current_count: number
          max_count: number
          period: string
        }[]
      }
      log_research: {
        Args: {
          p_drawdown?: number
          p_latency_ms?: number
          p_model?: string
          p_query_text: string
          p_response?: string
          p_score?: number
          p_sharpe?: number
          p_signal_type?: string
          p_tier?: string
          p_tokens?: number
          p_user_id: string
        }
        Returns: undefined
      }
      upgrade_system_constraints: { Args: never; Returns: Json }
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
