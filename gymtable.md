# Gym Partner Portal Implementation Code

This document stores the implementation details and code for the Gym Partner Portal that were reverted from the active codebase.

## 1. Database Migration: `20260807_gym_partner.sql`

```sql
-- ═══════════════════════════════════════════════════════════
-- Gym Partner Portal — Tables, RLS, and RPC
-- ═══════════════════════════════════════════════════════════

-- ── 1. Gyms table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gyms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  city        text,
  logo_url    text,
  invite_code text NOT NULL UNIQUE,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.gyms ENABLE ROW LEVEL SECURITY;

-- Owner can do everything with their own gym
CREATE POLICY "Owners manage own gym"
  ON public.gyms FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Anyone can look up a gym by invite code (for joining)
CREATE POLICY "Anyone can lookup gyms"
  ON public.gyms FOR SELECT
  USING (true);

-- ── 2. Gym Memberships table ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.gym_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  phone           text,
  email           text,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  duration_months int  NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'active',
  created_at      timestamptz DEFAULT now(),
  UNIQUE(gym_id, user_id)
);

CREATE INDEX gym_memberships_gym_id_idx ON public.gym_memberships(gym_id);
CREATE INDEX gym_memberships_user_id_idx ON public.gym_memberships(user_id);
CREATE INDEX gym_memberships_end_date_idx ON public.gym_memberships(end_date);

ALTER TABLE public.gym_memberships ENABLE ROW LEVEL SECURITY;

-- Members can insert their own membership (joining a gym)
CREATE POLICY "Members can join gym"
  ON public.gym_memberships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Members can view their own membership
CREATE POLICY "Members view own membership"
  ON public.gym_memberships FOR SELECT
  USING (auth.uid() = user_id);

-- Gym owners can view members of their gym
CREATE POLICY "Gym owners view their members"
  ON public.gym_memberships FOR SELECT
  USING (
    gym_id IN (SELECT id FROM public.gyms WHERE owner_id = auth.uid())
  );

-- Gym owners can update memberships (renew, extend)
CREATE POLICY "Gym owners update memberships"
  ON public.gym_memberships FOR UPDATE
  USING (
    gym_id IN (SELECT id FROM public.gyms WHERE owner_id = auth.uid())
  );

-- Gym owners can remove members
CREATE POLICY "Gym owners delete memberships"
  ON public.gym_memberships FOR DELETE
  USING (
    gym_id IN (SELECT id FROM public.gyms WHERE owner_id = auth.uid())
  );

-- ── 3. Add gym_id to user_profiles ─────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS gym_id uuid REFERENCES public.gyms(id);

-- ── 4. RPC: Get gym members with activity data ─────────────
-- SECURITY DEFINER so gym owner can read member profiles
-- (user_profiles RLS normally blocks cross-user reads)
CREATE OR REPLACE FUNCTION get_gym_members(p_gym_id uuid)
RETURNS TABLE (
  membership_id   uuid,
  user_id         uuid,
  full_name       text,
  phone           text,
  email           text,
  start_date      date,
  end_date        date,
  duration_months int,
  status          text,
  created_at      timestamptz,
  current_streak  int,
  last_active     date,
  weight_kg       float
) AS $$
BEGIN
  -- Verify caller owns this gym
  IF NOT EXISTS (
    SELECT 1 FROM public.gyms WHERE id = p_gym_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: you do not own this gym';
  END IF;

  RETURN QUERY
  SELECT
    gm.id            AS membership_id,
    gm.user_id,
    gm.full_name,
    gm.phone,
    gm.email,
    gm.start_date,
    gm.end_date,
    gm.duration_months,
    gm.status,
    gm.created_at,
    COALESCE(up.current_streak, 0)::int AS current_streak,
    (
      SELECT MAX(wl.date)::date
      FROM public.workout_logs wl
      WHERE wl.user_id = gm.user_id
    ) AS last_active,
    up.weight_kg::float
  FROM public.gym_memberships gm
  LEFT JOIN public.user_profiles up ON up.id = gm.user_id
  WHERE gm.gym_id = p_gym_id
    AND gm.status != 'removed'
  ORDER BY
    CASE WHEN gm.end_date < CURRENT_DATE THEN 0 ELSE 1 END,
    gm.end_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 2. React UI Code for `gym-partner.tsx`

This route handles the dual-role interface. Members can enroll into a gym by providing a code. Gym owners can register their gym and then manage members. 

*Due to length, this is a structural summary of the file logic that was removed.*

```tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
// ... extensive lucide-react icons and shadcn/ui component imports ...
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import { todayLocal } from "@/lib/dates";

export const Route = createFileRoute("/gym-partner")({
  component: GymPartner,
});

/* 
  Interfaces: 
  - Gym (id, owner_id, name, city, invite_code)
  - GymMember (membership_id, user_id, full_name, start_date, end_date, etc.)
*/

function GymPartner() {
  // Main controller component
  // Checks if user is already a gym owner.
  // If owner -> renders <OwnerDashboard />
  // Else -> renders <MemberEnrollment />
}

function MemberEnrollment() {
  // Handles multi-step form:
  // 1. Enter Gym Code
  // 2. Gym Details Verification
  // 3. User Enrollment Form (name, phone, duration)
  // 4. Success Screen
  //
  // Also contains a hidden dialog to register a new gym (for owners)
}

function OwnerDashboard() {
  // Tabs: Dashboard | Settings
  // Dashboard shows statistics (total, active, expiring, expired)
  // List of members with search & filter.
  // Renders member cards on mobile and a robust table on desktop.
  // Handles member renewals (date extension) and removal.
}

function GymSettings() {
  // Owner settings view
  // Shows gym details, invite code with a copy/regenerate button.
  // Contains QR Code generator that the owner can download and print.
}
```

## 3. Other Modifications Reverted

- `types.ts` was modified to include the `gyms` and `gym_memberships` table types for Supabase, and added `gym_id` onto the `user_profiles` schema.
- `profile.tsx` had a `MENU_ITEMS` addition to navigate to the new `gym-partner` route via a "Join your gym" button.
- `routeTree.gen.ts` was regenerated to support the new `/gym-partner` route.
