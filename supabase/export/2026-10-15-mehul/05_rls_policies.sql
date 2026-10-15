-- Part 5: row level security (on for all 36 public tables; none forced) and
-- every policy on public.* and storage.objects, copied verbatim from the live
-- project. Unqualified table names in policy bodies resolve through this
-- search_path, as they did when the policies were created.

SET search_path = public, extensions;

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_flagged ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_plan_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_unverified ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_verified ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cheers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gym_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photo_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.power_log_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_profile ENABLE ROW LEVEL SECURITY;

-- Tables with RLS on and no policy are service_role only, on purpose:
-- ai_flagged, ai_unverified, ai_verified, gym_memberships, manual_grants,
-- ops_agent_threads, ops_audit_log, ops_pending_actions.

-- public
CREATE POLICY "achievements readable" ON public.achievements AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY ai_plan_generations_select_own ON public.ai_plan_generations AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "users manage own body measurements" ON public.body_measurements AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY cheers_insert ON public.cheers AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = from_user) AND (EXISTS ( SELECT 1
   FROM friendships f
  WHERE ((f.status = 'accepted'::text) AND (((f.requester_id = cheers.from_user) AND (f.addressee_id = cheers.to_user)) OR ((f.requester_id = cheers.to_user) AND (f.addressee_id = cheers.from_user))))))));
CREATE POLICY cheers_select ON public.cheers AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = from_user) OR (auth.uid() = to_user)));
CREATE POLICY "users manage own custom reminders" ON public.custom_reminders AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY data_exports_select_own ON public.data_exports AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users can delete own food logs" ON public.food_logs AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own food logs" ON public.food_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update own food logs" ON public.food_logs AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view own food logs" ON public.food_logs AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY friendships_delete ON public.friendships AS PERMISSIVE FOR DELETE TO public USING (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));
CREATE POLICY friendships_insert ON public.friendships AS PERMISSIVE FOR INSERT TO public WITH CHECK (((auth.uid() = requester_id) AND (status = 'pending'::text)));
CREATE POLICY friendships_select ON public.friendships AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));
CREATE POLICY friendships_update ON public.friendships AS PERMISSIVE FOR UPDATE TO public USING (((auth.uid() = addressee_id) AND (status = 'pending'::text))) WITH CHECK (((auth.uid() = addressee_id) AND (status = ANY (ARRAY['accepted'::text, 'blocked'::text]))));
CREATE POLICY "Users read own gym link" ON public.gym_links AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY health_logs_user_all ON public.health_logs AS PERMISSIVE FOR ALL TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users manage own notification logs" ON public.notification_logs AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY photo_downloads_select_own ON public.photo_downloads AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY power_log_uses_select_own ON public.power_log_uses AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users read own referrals" ON public.referrals AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() = referrer_id) OR (auth.uid() = referee_id)));
CREATE POLICY "Users read own refund requests" ON public.refund_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "users manage own saved meals" ON public.saved_meals AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users manage own step logs" ON public.step_logs AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users read own charges" ON public.subscription_charges AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "Users read own subscriptions" ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "own achievements select" ON public.user_achievements AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "users manage own notification preferences" ON public.user_notification_preferences AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can insert own profile" ON public.user_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "Users can update own profile" ON public.user_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = id)) WITH CHECK ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "Users can view own profile" ON public.user_profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = id));
CREATE POLICY "users manage own water logs" ON public.water_logs AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "No client access to webhook events" ON public.webhook_events AS PERMISSIVE FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "users manage own weight entries" ON public.weight_entries AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "users manage own workout logs" ON public.workout_logs AS PERMISSIVE FOR ALL TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
CREATE POLICY "users manage own workout plans" ON public.workout_plans AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users manage own workout profile" ON public.workout_profile AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

-- storage.objects (bucket weight-photos; the bucket itself is in 07_storage.sql)
CREATE POLICY "Users delete own photos" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'weight-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users read own weight photos" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'weight-photos'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
CREATE POLICY "Users update own photos" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'weight-photos'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]))) WITH CHECK (((bucket_id = 'weight-photos'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.access_until > now()))))));
CREATE POLICY "Users upload own photos" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'weight-photos'::text) AND ((( SELECT auth.uid() AS uid))::text = (storage.foldername(name))[1]) AND (EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = ( SELECT auth.uid() AS uid)) AND (user_profiles.access_until > now()))))));
