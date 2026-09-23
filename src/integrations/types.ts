/**
 * Supabase database types — GENERATED, THEN HAND-CURATED. Read before regenerating.
 *
 * This file starts from the Supabase type generator's output (the MCP
 * `generate_typescript_types` tool, or `supabase gen types typescript`) and
 * then has hand curation applied on top. A plain regeneration SILENTLY DELETES
 * that curation, and some of it is security enforcement, not decoration. So:
 *
 *   NEXT REGENERATION MUST RE-APPLY EVERY ITEM BELOW. Diff the old file against
 *   the new output, carry each item across, then run `npx tsc --noEmit`.
 *
 * Curation to re-apply (search for each):
 *   1. user_profiles Insert/Update OMIT six billing columns — selected_plan,
 *      trial_start_date, referral_code, bonus_trial_days, bonus_premium_days,
 *      access_until. The client's grant on them is revoked; omitting them turns
 *      a runtime 42501 into a compile error.
 *   2. referrals, subscriptions, subscription_charges, refund_requests and
 *      webhook_events have `Insert: never` / `Update: never`. Every write goes
 *      through definer functions or the service role; this makes a client
 *      write a compile error.
 *   3. Literal unions mirroring CHECK constraints the generator cannot see:
 *      NotificationType / NotificationStatus (notification_logs), referral
 *      status, subscription provider / tier / status, charge tier, refund status.
 *   4. user_profiles.meal_names narrowed from Json to string[].
 *   5. Every doc comment on a column or table: they record triggers, CHECKs,
 *      grants and units that the generated output does not.
 *
 * Nullability is taken from the generator, deliberately: it is the database's
 * truth, and code must cope with it (e.g. food_logs.date may be NULL).
 *
 * The generator also cannot see triggers, so a column a trigger fills can look
 * required on Insert — referral_code is one, and item 1 already removes it.
 *
 * This file is excluded from prettier (.prettierignore) so a regeneration
 * diffs cleanly against the generator's own formatting.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/** Mirrors the notification_type_known CHECK on public.notification_logs. */
export type NotificationType = "morning_motivation" | "custom_reminder"

/** Mirrors the notification_status_known CHECK on public.notification_logs. */
export type NotificationStatus =
  | "pending"
  | "delivered"
  | "snoozed"
  | "dismissed"
  | "opened"
  | "archived"

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          id: string
          metric: string
          sort_order: number
          threshold: number
          xp: number
        }
        Insert: {
          id: string
          metric: string
          sort_order?: number
          threshold: number
          xp: number
        }
        Update: {
          id?: string
          metric?: string
          sort_order?: number
          threshold?: number
          xp?: number
        }
        Relationships: []
      }
      ai_flagged: {
        Row: {
          canonical_key: string
          choavldf: number
          edited_at: string
          enerc: number
          fatce: number
          fibtg: number
          id: string
          protcnt: number
          user_id: string
        }
        Insert: {
          canonical_key: string
          choavldf: number
          edited_at?: string
          enerc: number
          fatce: number
          fibtg: number
          id?: string
          protcnt: number
          user_id: string
        }
        Update: {
          canonical_key?: string
          choavldf?: number
          edited_at?: string
          enerc?: number
          fatce?: number
          fibtg?: number
          id?: string
          protcnt?: number
          user_id?: string
        }
        Relationships: []
      }
      ai_unverified: {
        Row: {
          aliases: string[]
          basis: string
          canonical_key: string
          choavldf: number
          created_at: string
          enerc: number
          engine: string
          fatce: number
          fibtg: number
          food_class: string
          food_name: string
          id: string
          model: string
          piece_g: number | null
          protcnt: number
          search_key: string
          user_hash: string | null
        }
        Insert: {
          aliases?: string[]
          basis: string
          canonical_key: string
          choavldf: number
          created_at?: string
          enerc: number
          engine: string
          fatce: number
          fibtg: number
          food_class: string
          food_name: string
          id?: string
          model: string
          piece_g?: number | null
          protcnt: number
          search_key: string
          user_hash?: string | null
        }
        Update: {
          aliases?: string[]
          basis?: string
          canonical_key?: string
          choavldf?: number
          created_at?: string
          enerc?: number
          engine?: string
          fatce?: number
          fibtg?: number
          food_class?: string
          food_name?: string
          id?: string
          model?: string
          piece_g?: number | null
          protcnt?: number
          search_key?: string
          user_hash?: string | null
        }
        Relationships: []
      }
      ai_verified: {
        Row: {
          alias_keys: string[]
          aliases: string[]
          basis: string
          canonical_key: string
          choavldf: number
          enerc: number
          fatce: number
          fibtg: number
          food_class: string
          food_name: string
          models: string[]
          piece_g: number | null
          protcnt: number
          search_key: string
          verified_at: string
        }
        Insert: {
          alias_keys?: string[]
          aliases?: string[]
          basis: string
          canonical_key: string
          choavldf: number
          enerc: number
          fatce: number
          fibtg: number
          food_class: string
          food_name: string
          models?: string[]
          piece_g?: number | null
          protcnt: number
          search_key: string
          verified_at?: string
        }
        Update: {
          alias_keys?: string[]
          aliases?: string[]
          basis?: string
          canonical_key?: string
          choavldf?: number
          enerc?: number
          fatce?: number
          fibtg?: number
          food_class?: string
          food_name?: string
          models?: string[]
          piece_g?: number | null
          protcnt?: number
          search_key?: string
          verified_at?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          created_at: string
          id: string
          measured_at: string
          // Storage key -> centimetres, e.g. { "biceps_left": 35.5 }. Keys come
          // from fieldKey() in src/lib/measurements.ts; the column is sparse, so
          // readers must tolerate any key being absent.
          measurements: Json
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at?: string
          measurements?: Json
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string
          measurements?: Json
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cheers: {
        Row: {
          created_at: string
          date: string
          from_user: string
          id: string
          to_user: string
        }
        Insert: {
          created_at?: string
          date?: string
          from_user: string
          id?: string
          to_user: string
        }
        Update: {
          created_at?: string
          date?: string
          from_user?: string
          id?: string
          to_user?: string
        }
        Relationships: []
      }
      custom_reminders: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          /** Notification title. 1-20 chars, enforced by a CHECK. */
          label: string
          /** Notification body. Null means the client generates one from the label. */
          note: string | null
          /** Local wall-clock time, "HH:MM:SS". Interpreted in user_profiles.timezone. */
          remind_at: string
          /** Display order in settings. Not a scheduling concern. */
          sort_order: number
          user_id: string
        }
        // A BEFORE INSERT trigger caps this at 10 rows per user (spec §9.1), so
        // an insert past the limit fails at runtime with check_violation however
        // it is typed here.
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          note?: string | null
          remind_at: string
          sort_order?: number
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          note?: string | null
          remind_at?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: []
      }
      food_logs: {
        Row: {
          calories: number | null
          carbs_g: number | null
          date: string | null
          fat_g: number | null
          fiber_g: number
          food_name: string
          id: string
          logged_at: string | null
          meal_type: string
          protein_g: number | null
          quantity_g: number
          /** Unit the user typed in; grams stay the basis in quantity_g. */
          unit: string
          /** The number they typed, in `unit`. Null on pre-unit rows. */
          unit_quantity: number | null
          user_id: string
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          date?: string | null
          fat_g?: number | null
          fiber_g?: number
          food_name: string
          id?: string
          logged_at?: string | null
          meal_type: string
          protein_g?: number | null
          quantity_g: number
          unit?: string
          unit_quantity?: number | null
          user_id: string
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          date?: string | null
          fat_g?: number | null
          fiber_g?: number
          food_name?: string
          id?: string
          logged_at?: string | null
          meal_type?: string
          protein_g?: number | null
          quantity_g?: number
          unit?: string
          unit_quantity?: number | null
          user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      gym_links: {
        Row: {
          created_at: string
          gift_spent_at: string | null
          /** The partner's display name: a gym's, a clinic's, or a creator's. */
          gym_name: string
          partner_code: string
          partner_type: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gift_spent_at?: string | null
          gym_name: string
          partner_code: string
          partner_type?: string
          source: string
          user_id: string
        }
        Update: {
          created_at?: string
          gift_spent_at?: string | null
          gym_name?: string
          partner_code?: string
          partner_type?: string
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      /**
       * The gym a member joined from their profile. Separate from gym_links,
       * which records the code used at signup and never changes — a member
       * can be credited to a creator and belong to a gym at the same time.
       */
      gym_memberships: {
        Row: {
          created_at: string
          gym_name: string
          partner_code: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gym_name: string
          partner_code: string
          user_id: string
        }
        Update: {
          created_at?: string
          gym_name?: string
          partner_code?: string
          user_id?: string
        }
        Relationships: []
      }
      manual_grants: {
        Row: {
          clawback_at: string | null
          created_at: string
          days: number
          effective_at: string
          /** Telegram chat id, or 'dashboard'. */
          granted_by: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          clawback_at?: string | null
          created_at?: string
          days: number
          effective_at?: string
          granted_by: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          clawback_at?: string | null
          created_at?: string
          days?: number
          effective_at?: string
          granted_by?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          current_scheduled_at: string
          id: string
          last_action_at: string | null
          max_snooze_allowed: number
          original_scheduled_at: string
          /** The integer id handed to the OS scheduler. Null once it has fired. */
          os_notification_id: number | null
          quiet_hours_override: boolean
          /** Set for custom_reminder rows only. */
          reminder_id: string | null
          snooze_count: number
          status: NotificationStatus
          type: NotificationType
          updated_at: string
          user_id: string
        }
        Insert: {
          current_scheduled_at: string
          id?: string
          last_action_at?: string | null
          max_snooze_allowed?: number
          original_scheduled_at: string
          os_notification_id?: number | null
          quiet_hours_override?: boolean
          reminder_id?: string | null
          snooze_count?: number
          status?: NotificationStatus
          type: NotificationType
          updated_at?: string
          user_id: string
        }
        Update: {
          current_scheduled_at?: string
          id?: string
          last_action_at?: string | null
          max_snooze_allowed?: number
          original_scheduled_at?: string
          os_notification_id?: number | null
          quiet_hours_override?: boolean
          reminder_id?: string | null
          snooze_count?: number
          status?: NotificationStatus
          type?: NotificationType
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "custom_reminders"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_agent_threads: {
        Row: {
          /** Telegram chat id. Negative for groups, hence a bigint. */
          chat_id: number
          /** Array of {role, content}, oldest first. Trimmed by the agent. */
          messages: Json
          turn_count: number
          updated_at: string
        }
        Insert: {
          chat_id: number
          messages?: Json
          turn_count?: number
          updated_at?: string
        }
        Update: {
          chat_id?: number
          messages?: Json
          turn_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      ops_audit_log: {
        Row: {
          action: string
          actor: string
          at: string
          detail: Json
          id: string
          target_user: string | null
        }
        Insert: {
          action: string
          actor: string
          at?: string
          detail?: Json
          id?: string
          target_user?: string | null
        }
        Update: {
          action?: string
          actor?: string
          at?: string
          detail?: Json
          id?: string
          target_user?: string | null
        }
        Relationships: []
      }
      ops_pending_actions: {
        Row: {
          action: string
          args: Json
          chat_id: number
          code: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          requested_by: number
          summary: string
        }
        Insert: {
          action: string
          args?: Json
          chat_id: number
          code: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          requested_by: number
          summary: string
        }
        Update: {
          action?: string
          args?: Json
          chat_id?: number
          code?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          requested_by?: number
          summary?: string
        }
        Relationships: []
      }
      referrals: {
        // Read-only from the client: RLS grants SELECT only, and every write
        // goes through the claim_referral / qualify_referral definer functions.
        Row: {
          code_used: string
          created_at: string
          id: string
          qualified_at: string | null
          referee_id: string
          referrer_id: string
          status: "pending" | "trial" | "subscribed"
          subscribed_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      // ── Billing ──────────────────────────────────────────────────────────
      //
      // All four billing tables (refund_requests, subscription_charges,
      // subscriptions, webhook_events) are read-only from the client, and three
      // of them are only readable at all. RLS grants SELECT on the owner's own
      // rows and there is deliberately no write policy: every write goes through
      // the register_subscription / handle_razorpay_event / request_refund
      // definer functions. `Insert: never` and `Update: never` make that a
      // compile error rather than a runtime 42501.
      refund_requests: {
        Row: {
          charge_id: string
          created_at: string
          id: string
          reason: string
          resolved_at: string | null
          status: "open" | "approved" | "rejected" | "processed"
          user_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "refund_requests_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "subscription_charges"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_meals: {
        Row: {
          calories: number
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          id: string
          ingredients: Json | null
          name: string
          protein_g: number
          user_id: string
        }
        Insert: {
          calories: number
          carbs_g: number
          created_at?: string
          fat_g: number
          fiber_g?: number
          id?: string
          ingredients?: Json | null
          name: string
          protein_g: number
          user_id: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          ingredients?: Json | null
          name?: string
          protein_g?: number
          user_id?: string
        }
        Relationships: []
      }
      subscription_charges: {
        Row: {
          amount_paise: number
          base_paise: number
          charged_at: string
          created_at: string
          id: string
          period_days: number
          provider: string
          provider_payment_id: string
          refunded_at: string | null
          seq: number
          subscription_id: string
          tier: "monthly" | "quarterly" | "yearly"
          user_id: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "subscription_charges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: string
          provider: "razorpay" | "google_play" | "apple"
          provider_subscription_id: string
          status: 
            | "created"
            | "authenticated"
            | "active"
            | "pending"
            | "halted"
            | "cancelled"
            | "completed"
            | "expired"
          tier: "monthly" | "quarterly" | "yearly"
          updated_at: string
          user_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          awarded_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          awarded_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          awarded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          allow_snooze: boolean
          /** Master switch for the custom reminder section. */
          custom_enabled: boolean
          max_snooze_cycles: number
          morning_enabled: boolean
          /** Local wall-clock time, "HH:MM:SS". */
          morning_time: string
          /** Never applies to morning motivation — see the migration. */
          quiet_from: string
          quiet_hours_on: boolean
          quiet_to: string
          /** Seconds. Constrained to a subset of [600, 1800, 3600]. */
          snooze_intervals: number[]
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_snooze?: boolean
          custom_enabled?: boolean
          max_snooze_cycles?: number
          morning_enabled?: boolean
          morning_time?: string
          quiet_from?: string
          quiet_hours_on?: boolean
          quiet_to?: string
          snooze_intervals?: number[]
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_snooze?: boolean
          custom_enabled?: boolean
          max_snooze_cycles?: number
          morning_enabled?: boolean
          morning_time?: string
          quiet_from?: string
          quiet_hours_on?: boolean
          quiet_to?: string
          snooze_intervals?: number[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          access_until: string | null
          activity_level: string | null
          age: number | null
          bmi: number | null
          bmr: number | null
          bonus_premium_days: number
          bonus_trial_days: number
          carbs_target_g: number | null
          created_at: string
          current_streak: number | null
          daily_calorie_target: number | null
          fat_target_g: number | null
          fiber_target_g: number | null
          full_name: string | null
          gender: string | null
          goal: string | null
          goal_weight_kg: number | null
          gym_attribution_ended_at: string | null
          has_seen_benefits_features_page: boolean
          has_seen_refer_intro: boolean
          height_cm: number | null
          id: string
          longest_streak: number | null
          meal_frequency: number | null
          meal_names: string[]
          motivation_seed: number
          protein_target_g: number | null
          referral_code: string
          selected_plan: string | null
          supplements_used: string | null
          tdee: number | null
          timezone: string
          trial_start_date: string | null
          username: string | null
          water_cup_ml: number | null
          water_goal_ml: number | null
          weight_kg: number | null
          whatsapp_no: string | null
        }
        // Insert and Update deliberately omit selected_plan, trial_start_date,
        // referral_code, bonus_trial_days, bonus_premium_days and access_until.
        // 20260901120000_billing_lockdown.sql revoked the client's grant on all
        // six, so a write to any of them fails with 42501 at runtime. Leaving
        // them out means it fails at compile time instead.
        Insert: {
          activity_level?: string | null
          age?: number | null
          bmi?: number | null
          bmr?: number | null
          carbs_target_g?: number | null
          created_at?: string
          current_streak?: number | null
          daily_calorie_target?: number | null
          fat_target_g?: number | null
          fiber_target_g?: number | null
          full_name?: string | null
          gender?: string | null
          goal?: string | null
          goal_weight_kg?: number | null
          gym_attribution_ended_at?: string | null
          has_seen_benefits_features_page?: boolean
          has_seen_refer_intro?: boolean
          height_cm?: number | null
          id: string
          longest_streak?: number | null
          meal_frequency?: number | null
          meal_names?: string[]
          motivation_seed?: number
          protein_target_g?: number | null
          supplements_used?: string | null
          tdee?: number | null
          timezone?: string
          username?: string | null
          water_cup_ml?: number | null
          water_goal_ml?: number | null
          weight_kg?: number | null
          whatsapp_no?: string | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          bmi?: number | null
          bmr?: number | null
          carbs_target_g?: number | null
          created_at?: string
          current_streak?: number | null
          daily_calorie_target?: number | null
          fat_target_g?: number | null
          fiber_target_g?: number | null
          full_name?: string | null
          gender?: string | null
          goal?: string | null
          goal_weight_kg?: number | null
          gym_attribution_ended_at?: string | null
          has_seen_benefits_features_page?: boolean
          has_seen_refer_intro?: boolean
          height_cm?: number | null
          id?: string
          longest_streak?: number | null
          meal_frequency?: number | null
          meal_names?: string[]
          motivation_seed?: number
          protein_target_g?: number | null
          supplements_used?: string | null
          tdee?: number | null
          timezone?: string
          username?: string | null
          water_cup_ml?: number | null
          water_goal_ml?: number | null
          weight_kg?: number | null
          whatsapp_no?: string | null
        }
        Relationships: []
      }
      water_logs: {
        Row: {
          amount_ml: number
          date: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_ml?: number
          date?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_ml?: number
          date?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      // Service-role only. RLS denies every client in both directions and the
      // table privileges are revoked; it is typed here purely so the admin
      // client can reference it.
      webhook_events: {
        Row: {
          event_id: string
          event_type: string
          id: string
          provider: string
          received_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      weight_entries: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string | null
          photo_url: string | null
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          photo_url?: string | null
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          photo_url?: string | null
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      workout_logs: {
        Row: {
          calc_method: string
          calories_burned: number
          confidence: string
          date: string
          duration_min: number
          exercises_done: Json
          id: string
          logged_at: string
          user_id: string
          workout_name: string
        }
        Insert: {
          calc_method?: string
          calories_burned?: number
          confidence?: string
          date?: string
          duration_min?: number
          exercises_done?: Json
          id?: string
          logged_at?: string
          user_id: string
          workout_name: string
        }
        Update: {
          calc_method?: string
          calories_burned?: number
          confidence?: string
          date?: string
          duration_min?: number
          exercises_done?: Json
          id?: string
          logged_at?: string
          user_id?: string
          workout_name?: string
        }
        Relationships: []
      }
      workout_plans: {
        Row: {
          created_at: string
          custom_plan_day_anchor: string
          custom_plan_day_idx: number
          goal: string
          id: string
          plan_json: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_plan_day_anchor?: string
          custom_plan_day_idx?: number
          goal: string
          id?: string
          plan_json: Json
          user_id: string
        }
        Update: {
          created_at?: string
          custom_plan_day_anchor?: string
          custom_plan_day_idx?: number
          goal?: string
          id?: string
          plan_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      workout_profile: {
        Row: {
          bench_reps: number | null
          bench_weight_kg: number | null
          cardio_activities: string[]
          completed_at: string
          deadlift_reps: number | null
          deadlift_weight_kg: number | null
          distance_unit: string
          fitness_goal: string
          fitness_level: string
          muscles_per_workout: string
          orig_distance_unit: string
          orig_weight_unit: string
          preferred_training_plan: string
          preferred_workout_time_min: number
          squat_reps: number | null
          squat_weight_kg: number | null
          training_days_per_week: number
          updated_at: string
          user_id: string
          weight_unit: string
        }
        Insert: {
          bench_reps?: number | null
          bench_weight_kg?: number | null
          cardio_activities?: string[]
          completed_at?: string
          deadlift_reps?: number | null
          deadlift_weight_kg?: number | null
          distance_unit?: string
          fitness_goal: string
          fitness_level: string
          muscles_per_workout?: string
          orig_distance_unit?: string
          orig_weight_unit?: string
          preferred_training_plan: string
          preferred_workout_time_min: number
          squat_reps?: number | null
          squat_weight_kg?: number | null
          training_days_per_week: number
          updated_at?: string
          user_id: string
          weight_unit?: string
        }
        Update: {
          bench_reps?: number | null
          bench_weight_kg?: number | null
          cardio_activities?: string[]
          completed_at?: string
          deadlift_reps?: number | null
          deadlift_weight_kg?: number | null
          distance_unit?: string
          fitness_goal?: string
          fitness_level?: string
          muscles_per_workout?: string
          orig_distance_unit?: string
          orig_weight_unit?: string
          preferred_training_plan?: string
          preferred_workout_time_min?: number
          squat_reps?: number | null
          squat_weight_kg?: number | null
          training_days_per_week?: number
          updated_at?: string
          user_id?: string
          weight_unit?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_verified_similar: {
        Args: { min_sim: number; q: string }
        Returns: {
          basis: string
          canonical_key: string
          choavldf: number
          enerc: number
          fatce: number
          fibtg: number
          food_class: string
          food_name: string
          piece_g: number
          protcnt: number
          search_key: string
          sim: number
        }[]
      }
      award_achievement: { Args: { p_id: string }; Returns: undefined }
      claim_referral: { Args: { code: string }; Returns: boolean }
      generate_referral_code: { Args: { full_name: string }; Returns: string }
      get_billing_summary: { Args: never; Returns: Json }
      get_friend_requests: {
        Args: never
        Returns: {
          created_at: string
          current_streak: number
          direction: string
          friendship_id: string
          full_name: string
          mutual_count: number
          user_id: string
          username: string
        }[]
      }
      get_friends: {
        Args: never
        Returns: {
          active_today: boolean
          cheered_today: boolean
          current_streak: number
          full_name: string
          id: string
          last_activity: string
          last_activity_at: string
          username: string
          workouts_this_week: number
        }[]
      }
      get_leaderboard_stats: {
        Args: { start_date: string }
        Returns: {
          avg_calories: number
          current_streak: number
          full_name: string
          overall_score: number
          total_exercise_min: number
          total_water: number
          user_id: string
          workouts_count: number
        }[]
      }
      get_referral_summary: {
        Args: never
        Returns: {
          qualified_at: string
          referee_name: string
          status: string
          subscribed_at: string
        }[]
      }
      get_referrer_name: { Args: { code: string }; Returns: string }
      handle_razorpay_event: {
        Args: {
          p_amount_paise?: number
          p_base_paise?: number
          p_event_id: string
          p_event_type: string
          p_payment_id?: string
          p_period_days?: number
          p_provider?: string
          p_refunded?: boolean
          p_status?: string
          p_subscription_id: string
        }
        Returns: Json
      }
      join_gym: {
        Args: { p_code: string; p_gym_name: string; p_user_id: string }
        Returns: Json
      }
      leave_gym: { Args: { p_user_id: string }; Returns: Json }
      link_gym: {
        Args: {
          p_code: string
          p_gym_name: string
          p_partner_type?: string
          p_user_id: string
        }
        Returns: Json
      }
      log_body_measurements: {
        Args: { entries: Json; entry_note?: string; on_date?: string }
        Returns: undefined
      }
      measurements_valid: { Args: { m: Json }; Returns: boolean }
      ops_audit_recent: { Args: { limit_n?: number }; Returns: Json }
      ops_diagnose_access: { Args: { user_ref: string }; Returns: Json }
      ops_engagement: { Args: { period_days?: number }; Returns: Json }
      ops_funnel: { Args: never; Returns: Json }
      ops_grant_access: {
        Args: {
          actor: string
          grant_days: number
          reason: string
          user_ref: string
        }
        Returns: Json
      }
      ops_growth_daily: { Args: { days?: number }; Returns: Json }
      ops_list_users: {
        Args: { limit_n?: number; sort_by?: string }
        Returns: Json
      }
      ops_notifications: { Args: { period_days?: number }; Returns: Json }
      ops_recent_activity: { Args: { hours?: number }; Returns: Json }
      ops_reset_notifications: {
        Args: { actor: string; user_ref: string }
        Returns: Json
      }
      ops_resolve_user: { Args: { user_ref: string }; Returns: string }
      ops_revenue: { Args: { period_days?: number }; Returns: Json }
      ops_revoke_grant: {
        Args: { actor: string; grant_id: string }
        Returns: Json
      }
      ops_search_users: { Args: { q: string }; Returns: Json }
      ops_system_health: { Args: never; Returns: Json }
      ops_user_detail: { Args: { user_ref: string }; Returns: Json }
      ops_users_overview: { Args: { period_days?: number }; Returns: Json }
      premium_grants: {
        Args: { target: string }
        Returns: {
          clawback_at: string
          days: number
          effective_at: string
        }[]
      }
      recompute_access: { Args: { target: string }; Returns: undefined }
      recompute_bonus_trial_days: {
        Args: { target: string }
        Returns: undefined
      }
      referral_code_prefix: { Args: { full_name: string }; Returns: string }
      register_subscription: {
        Args: { p_provider_subscription_id: string; p_tier: string }
        Returns: string
      }
      request_refund: {
        Args: { p_charge_id: string; p_reason: string }
        Returns: string
      }
      resolve_friend_code: {
        Args: { code: string }
        Returns: {
          full_name: string
          result: string
          username: string
        }[]
      }
      search_users: {
        Args: { q?: string }
        Returns: {
          current_streak: number
          full_name: string
          id: string
          status: string
          username: string
        }[]
      }
      start_trial: { Args: { plan: string }; Returns: undefined }
      sync_achievements: {
        Args: never
        Returns: {
          achievement_id: string
          xp: number
        }[]
      }
      unlink_gym: { Args: { p_user_id: string }; Returns: Json }
      user_achievement_metrics: {
        Args: { p_user: string }
        Returns: {
          early_logs: number
          food_count: number
          food_streak: number
          hydrated_days: number
          photo_count: number
          saved_meals: number
          weight_count: number
          workout_count: number
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
