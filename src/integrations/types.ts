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
          quantity_g: number;
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
          quantity_g: number;
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
          quantity_g?: number;
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
          selected_plan: string | null;
          tdee: number | null;
          trial_start_date: string | null;
          weight_kg: number | null;
          goal_weight_kg: number | null;
        };
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
          selected_plan?: string | null;
          tdee?: number | null;
          trial_start_date?: string | null;
          weight_kg?: number | null;
          goal_weight_kg?: number | null;
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
          selected_plan?: string | null;
          tdee?: number | null;
          trial_start_date?: string | null;
          weight_kg?: number | null;
          goal_weight_kg?: number | null;
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
