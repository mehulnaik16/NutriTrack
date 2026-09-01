export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      body_measurements: {
        Row: {
          created_at: string;
          id: string;
          measured_at: string;
          // Storage key -> centimetres, e.g. { "biceps_left": 35.5 }. Keys come
          // from fieldKey() in src/lib/measurements.ts; the column is sparse, so
          // readers must tolerate any key being absent.
          measurements: Json;
          note: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          measured_at?: string;
          measurements?: Json;
          note?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          measured_at?: string;
          measurements?: Json;
          note?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      food_logs: {
        Row: {
          calories: number;
          carbs_g: number;
          date: string;
          fat_g: number;
          food_name: string;
          id: string;
          logged_at: string;
          meal_type: string;
          protein_g: number;
          fiber_g: number;
          quantity_g: number;
          /** Unit the user typed in; grams stay the basis in quantity_g. */
          unit: string;
          /** The number they typed, in `unit`. Null on pre-unit rows. */
          unit_quantity: number | null;
          user_id: string;
        };
        Insert: {
          calories?: number;
          carbs_g?: number;
          date?: string;
          fat_g?: number;
          food_name: string;
          id?: string;
          logged_at?: string;
          meal_type: string;
          protein_g?: number;
          fiber_g?: number;
          quantity_g: number;
          unit?: string;
          unit_quantity?: number | null;
          user_id: string;
        };
        Update: {
          calories?: number;
          carbs_g?: number;
          date?: string;
          fat_g?: number;
          food_name?: string;
          id?: string;
          logged_at?: string;
          meal_type?: string;
          protein_g?: number;
          fiber_g?: number;
          quantity_g?: number;
          unit?: string;
          unit_quantity?: number | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          activity_level: string | null;
          age: number | null;
          bmi: number | null;
          bmr: number | null;
          carbs_target_g: number | null;
          created_at: string;
          daily_calorie_target: number | null;
          fat_target_g: number | null;
          full_name: string | null;
          gender: string | null;
          goal: string | null;
          height_cm: number | null;
          id: string;
          protein_target_g: number | null;
          fiber_target_g: number | null;
          selected_plan: string | null;
          tdee: number | null;
          trial_start_date: string | null;
          weight_kg: number | null;
          goal_weight_kg: number | null;
          username: string | null;
          referral_code: string;
          bonus_trial_days: number;
          bonus_premium_days: number;
          access_until: string | null;
          has_seen_benefits_features_page: boolean;
          has_seen_refer_intro: boolean;
          meal_names: string[];
          water_goal_ml: number | null;
          water_cup_ml: number | null;
        };
        // Insert and Update deliberately omit selected_plan, trial_start_date,
        // referral_code, bonus_trial_days, bonus_premium_days and access_until.
        // 20260901120000_billing_lockdown.sql revoked the client's grant on all
        // six, so a write to any of them fails with 42501 at runtime. Leaving
        // them out means it fails at compile time instead.
        Insert: {
          activity_level?: string | null;
          age?: number | null;
          bmi?: number | null;
          bmr?: number | null;
          carbs_target_g?: number | null;
          created_at?: string;
          daily_calorie_target?: number | null;
          fat_target_g?: number | null;
          full_name?: string | null;
          gender?: string | null;
          goal?: string | null;
          height_cm?: number | null;
          id: string;
          protein_target_g?: number | null;
          fiber_target_g?: number | null;
          tdee?: number | null;
          weight_kg?: number | null;
          goal_weight_kg?: number | null;
          username?: string | null;
          has_seen_benefits_features_page?: boolean;
          has_seen_refer_intro?: boolean;
          meal_names?: string[];
          water_goal_ml?: number | null;
          water_cup_ml?: number | null;
        };
        Update: {
          activity_level?: string | null;
          age?: number | null;
          bmi?: number | null;
          bmr?: number | null;
          carbs_target_g?: number | null;
          created_at?: string;
          daily_calorie_target?: number | null;
          fat_target_g?: number | null;
          full_name?: string | null;
          gender?: string | null;
          goal?: string | null;
          height_cm?: number | null;
          id?: string;
          protein_target_g?: number | null;
          fiber_target_g?: number | null;
          tdee?: number | null;
          weight_kg?: number | null;
          goal_weight_kg?: number | null;
          username?: string | null;
          has_seen_benefits_features_page?: boolean;
          has_seen_refer_intro?: boolean;
          meal_names?: string[];
          water_goal_ml?: number | null;
          water_cup_ml?: number | null;
        };
        Relationships: [];
      };
      water_logs: {
        Row: {
          amount_ml: number;
          date: string;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_ml?: number;
          date?: string;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_ml?: number;
          date?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      weight_entries: {
        Row: {
          created_at: string;
          date: string;
          id: string;
          note: string | null;
          photo_url: string | null;
          user_id: string;
          weight_kg: number;
        };
        Insert: {
          created_at?: string;
          date?: string;
          id?: string;
          note?: string | null;
          photo_url?: string | null;
          user_id: string;
          weight_kg: number;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: string;
          note?: string | null;
          photo_url?: string | null;
          user_id?: string;
          weight_kg?: number;
        };
        Relationships: [];
      };
      workout_logs: {
        Row: {
          calories_burned: number;
          date: string;
          duration_min: number;
          exercises_done: Json;
          id: string;
          logged_at: string;
          user_id: string;
          workout_name: string;
        };
        Insert: {
          calories_burned?: number;
          date?: string;
          duration_min?: number;
          exercises_done?: Json;
          id?: string;
          logged_at?: string;
          user_id: string;
          workout_name: string;
        };
        Update: {
          calories_burned?: number;
          date?: string;
          duration_min?: number;
          exercises_done?: Json;
          id?: string;
          logged_at?: string;
          user_id?: string;
          workout_name?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: string;
          created_at: string;
          responded_at: string | null;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: string;
          created_at?: string;
          responded_at?: string | null;
        };
        Update: {
          id?: string;
          requester_id?: string;
          addressee_id?: string;
          status?: string;
          created_at?: string;
          responded_at?: string | null;
        };
        Relationships: [];
      };
      cheers: {
        Row: {
          id: string;
          from_user: string;
          to_user: string;
          date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_user: string;
          to_user: string;
          date?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          from_user?: string;
          to_user?: string;
          date?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      workout_plans: {
        Row: {
          created_at: string;
          goal: string;
          id: string;
          plan_json: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          goal: string;
          id?: string;
          plan_json: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          goal?: string;
          id?: string;
          plan_json?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      saved_meals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          ingredients: Json | null;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          ingredients?: Json | null;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          fiber_g: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          ingredients?: Json | null;
          calories?: number;
          protein_g?: number;
          carbs_g?: number;
          fat_g?: number;
          fiber_g?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      referrals: {
        // Read-only from the client: RLS grants SELECT only, and every write
        // goes through the claim_referral / qualify_referral definer functions.
        Row: {
          id: string;
          referrer_id: string;
          referee_id: string;
          code_used: string;
          status: "pending" | "trial" | "subscribed";
          created_at: string;
          qualified_at: string | null;
          subscribed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // ── Billing ──────────────────────────────────────────────────────────
      //
      // All four are read-only from the client, and three of them are only
      // readable at all. RLS grants SELECT on the owner's own rows and there is
      // deliberately no write policy: every write goes through the
      // register_subscription / handle_razorpay_event / request_refund definer
      // functions. `Insert: never` and `Update: never` make that a compile
      // error rather than a runtime 42501.
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          provider: "razorpay" | "google_play" | "apple";
          provider_subscription_id: string;
          tier: "monthly" | "quarterly" | "yearly";
          status:
            | "created"
            | "authenticated"
            | "active"
            | "pending"
            | "halted"
            | "cancelled"
            | "completed"
            | "expired";
          created_at: string;
          updated_at: string;
          cancelled_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      subscription_charges: {
        Row: {
          id: string;
          subscription_id: string;
          user_id: string;
          provider_payment_id: string;
          amount_paise: number;
          tier: "monthly" | "quarterly" | "yearly";
          period_days: number;
          charged_at: string;
          refunded_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      refund_requests: {
        Row: {
          id: string;
          charge_id: string;
          user_id: string;
          reason: string;
          status: "open" | "approved" | "rejected" | "processed";
          created_at: string;
          resolved_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Service-role only. RLS denies every client in both directions and the
      // table privileges are revoked; it is typed here purely so the admin
      // client can reference it.
      webhook_events: {
        Row: {
          id: string;
          provider: string;
          event_id: string;
          event_type: string;
          received_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
