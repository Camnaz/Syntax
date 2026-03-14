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
          created_at: string | null
          id: string
          monthly_verifications_limit: number
          monthly_verifications_used: number
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_cycle_start?: string | null
          created_at?: string | null
          id?: string
          monthly_verifications_limit?: number
          monthly_verifications_used?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_cycle_start?: string | null
          created_at?: string | null
          id?: string
          monthly_verifications_limit?: number
          monthly_verifications_used?: number
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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

