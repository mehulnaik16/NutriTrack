import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Moon,
  Sun,
  Droplets,
  Sunset,
  TreePine,
  ChevronRight,
  ArrowLeft,
  User,
  ListOrdered,
  Palette,
  Tag,
  Settings,
  MessageCircle,
  Info,
  Gift,
  Instagram,
  Linkedin,
  Facebook,
  Twitter,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/client";
import {
  calcBMI,
  calcBMR,
  calcCalorieTarget,
  calcMacros,
  calcTDEE,
} from "@/lib/nutrition";

export const Route = createFileRoute("/profile")({ component: Profile });

type Page =
  | "menu"
  | "details"
  | "theme"
  | "transactions"
  | "pricing"
  | "settings"
  | "help"
  | "about"
  | "refer";

/* ─── menu items ─── */
const MENU_ITEMS: {
  id: Page;
  icon: React.ReactNode;
  label: string;
}[] = [
  { id: "details",      icon: <User className="h-7 w-7 md:h-[26px] md:w-[26px]" />,          label: "Profile details" },
  { id: "transactions", icon: <ListOrdered className="h-7 w-7 md:h-[26px] md:w-[26px]" />,   label: "Transactions" },
  { id: "theme",        icon: <Palette className="h-7 w-7 md:h-[26px] md:w-[26px]" />,       label: "Theme" },
  { id: "pricing",      icon: <Tag className="h-7 w-7 md:h-[26px] md:w-[26px]" />,           label: "Pricing" },
  { id: "settings",     icon: <Settings className="h-7 w-7 md:h-[26px] md:w-[26px]" />,      label: "Settings" },
  { id: "help",         icon: <MessageCircle className="h-7 w-7 md:h-[26px] md:w-[26px]" />, label: "Help & support" },
  { id: "about",        icon: <Info className="h-7 w-7 md:h-[26px] md:w-[26px]" />,          label: "About us" },
  { id: "refer",        icon: <Gift className="h-7 w-7 md:h-[26px] md:w-[26px]" />,          label: "Refer & save more" },
];

/* ─── coming-soon pages ─── */
const COMING_SOON_PAGES: Partial<Record<Page, { icon: React.ReactNode; title: string }>> = {
  transactions: { icon: <ListOrdered className="h-16 w-16" />, title: "Transactions" },
  pricing:      { icon: <Tag className="h-16 w-16" />,          title: "Pricing" },
  settings:     { icon: <Settings className="h-16 w-16" />,     title: "Settings" },
  help:         { icon: <MessageCircle className="h-16 w-16" />,title: "Help & support" },
  about:        { icon: <Info className="h-16 w-16" />,         title: "About us" },
  refer:        { icon: <Gift className="h-16 w-16" />,         title: "Refer & save more" },
};

/* ═══════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════ */
function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page>("menu");
  const [profile, setProfile] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [goal, setGoal] = useState("");
  const [activity, setActivity] = useState("");
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<string>("light");

  useEffect(() => {
    setTheme(localStorage.getItem("theme") || "light");
  }, []);

  const changeTheme = (newTheme: string) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    document.documentElement.classList.remove(
      "dark",
      "theme-ocean",
      "theme-sunset",
      "theme-forest"
    );
    if (newTheme !== "light") {
      document.documentElement.classList.add(newTheme);
    }
  };

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data);
        if (data?.weight_kg) setWeight(String(data.weight_kg));
        if (data?.height_cm) setHeight(String(data.height_cm));
        if (data?.full_name) setName(data.full_name);
        if (data?.age) setAge(String(data.age));
        if (data?.gender) setGender(data.gender);
        if (data?.goal) setGoal(data.goal);
        if (data?.activity_level) setActivity(data.activity_level);
      });
  }, [user]);

  const updateProfile = async () => {
    if (!user || !profile) return;
    const w = +weight || 0;
    const h = +height || 0;
    const a = +age || 0;

    if (!w || w <= 0 || !h || h <= 0 || !a || a <= 0) {
      toast.error("Height, weight, and age must be greater than 0");
      return;
    }

    setSaving(true);
    const bmi = calcBMI(w, h);
    const bmr = calcBMR(w, h, a, gender || profile.gender);
    const tdee = calcTDEE(bmr, activity || profile.activity_level);
    const target = calcCalorieTarget(tdee, goal || profile.goal);
    const m = calcMacros(target);
    const { error } = await supabase
      .from("user_profiles")
      .update({
        full_name: name,
        height_cm: h,
        weight_kg: w,
        age: a,
        gender: gender || profile.gender,
        goal: goal || profile.goal,
        activity_level: activity || profile.activity_level,
        bmi,
        bmr,
        tdee,
        daily_calorie_target: target,
        protein_target_g: m.protein,
        carbs_target_g: m.carbs,
        fat_target_g: m.fat,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile updated");
    setProfile({
      ...profile,
      full_name: name,
      height_cm: h,
      weight_kg: w,
      age: a,
      gender: gender || profile.gender,
      goal: goal || profile.goal,
      activity_level: activity || profile.activity_level,
      bmi,
      bmr,
      tdee,
      daily_calorie_target: target,
      protein_target_g: m.protein,
      carbs_target_g: m.carbs,
      fat_target_g: m.fat,
    });
    setIsEditing(false);
  };

  if (!user || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    );
  }

  /* ─── COMING SOON PAGE ─── */
  if (page !== "menu" && page !== "details" && page !== "theme") {
    const cs = COMING_SOON_PAGES[page]!;
    return <ComingSoonPage title={cs.title} icon={cs.icon} onBack={() => setPage("menu")} />;
  }

  /* ─── THEME PAGE ─── */
  if (page === "theme") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <SubHeader title="Theme" onBack={() => setPage("menu")} />
        <main className="mx-auto max-w-lg px-4 py-8">
          <p className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Appearance
          </p>
          <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
            {[
              { id: "light",        label: "Light",  icon: <Sun className="h-5 w-5" /> },
              { id: "dark",         label: "Dark",   icon: <Moon className="h-5 w-5" /> },
              { id: "theme-ocean",  label: "Ocean",  icon: <Droplets className="h-5 w-5 text-[#00C2CB]" /> },
              { id: "theme-sunset", label: "Sunset", icon: <Sunset className="h-5 w-5 text-orange-400" /> },
              { id: "theme-forest", label: "Forest", icon: <TreePine className="h-5 w-5 text-green-500" /> },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => changeTheme(t.id)}
                className="flex w-full items-center justify-between px-5 py-4 hover:bg-muted/40 transition-colors"
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  {t.icon} {t.label}
                </span>
                <span
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    theme === t.id
                      ? "border-accent bg-accent"
                      : "border-border bg-transparent"
                  }`}
                >
                  {theme === t.id && (
                    <span className="h-2 w-2 rounded-full bg-accent-foreground" />
                  )}
                </span>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  /* ─── PROFILE DETAILS PAGE ─── */
  if (page === "details") {
    return (
      <div className="min-h-screen bg-background pb-24">
        <SubHeader
          title="Profile details"
          onBack={() => { setIsEditing(false); setPage("menu"); }}
          action={
            !isEditing ? (
              <Button
                size="sm"
                onClick={() => setIsEditing(true)}
                className="h-8 rounded-xl bg-foreground text-background text-xs font-semibold px-4 hover:opacity-90"
              >
                Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={updateProfile} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            )
          }
        />
        <main className="mx-auto max-w-lg px-4 py-6 space-y-6">
          {/* Account */}
          <section>
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Account
            </p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              {isEditing ? (
                <div className="p-4 flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
                </div>
              ) : (
                <InfoRow label="Name" value={profile.full_name} />
              )}
              <InfoRow label="Email" value={user.email ?? ""} />
              <InfoRow label="User ID" value={user.id} mono />
              <InfoRow label="Plan" value={profile.selected_plan ?? "—"} />
              <InfoRow label="Trial started" value={profile.trial_start_date ?? "—"} />
            </div>
          </section>

          {/* Metrics */}
          <section>
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Metrics
            </p>
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
              {isEditing ? (
                <>
                  <div className="p-4 grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Age</Label>
                      <Input type="number" value={age} onChange={(e) => setAge(e.target.value)} className="h-9" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Gender</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Gender" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Height (cm)</Label>
                      <Input type="number" value={height} onChange={(e) => setHeight(e.target.value)} className="h-9" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-muted-foreground">Weight (kg)</Label>
                      <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-9" />
                    </div>
                    <div className="flex flex-col gap-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Activity Level</Label>
                      <Select value={activity} onValueChange={setActivity}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Activity level" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Sedentary">Sedentary</SelectItem>
                          <SelectItem value="Lightly Active">Lightly Active</SelectItem>
                          <SelectItem value="Moderately Active">Moderately Active</SelectItem>
                          <SelectItem value="Very Active">Very Active</SelectItem>
                          <SelectItem value="Super Active">Super Active</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1 col-span-2">
                      <Label className="text-xs text-muted-foreground">Goal</Label>
                      <Select value={goal} onValueChange={setGoal}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Your goal" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Lose Weight">Lose Weight</SelectItem>
                          <SelectItem value="Maintain Weight">Maintain Weight</SelectItem>
                          <SelectItem value="Gain Muscle">Gain Muscle</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="Age" value={String(profile.age)} />
                    <InfoCell label="Gender" value={profile.gender} />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="Height" value={`${profile.height_cm} cm`} />
                    <InfoCell label="Weight" value={`${profile.weight_kg} kg`} />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="BMI" value={String(profile.bmi)} />
                    <InfoCell label="BMR" value={`${profile.bmr} kcal`} />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="TDEE" value={`${profile.tdee} kcal`} />
                    <InfoCell label="Daily Target" value={`${profile.daily_calorie_target} kcal`} />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <InfoCell label="Activity" value={profile.activity_level} />
                    <InfoCell label="Goal" value={profile.goal} />
                  </div>
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  /* ─── MENU PAGE ─── */
  const firstName = profile.full_name?.split(" ")[0] ?? "User";
  const phone = user.phone ?? user.user_metadata?.phone ?? "";

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Top bar */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur px-5 py-5 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-full flex-shrink-0"
          onClick={() => navigate({ to: "/dashboard" })}
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight truncate">{firstName}</h1>
          {phone && <p className="text-sm sm:text-base text-muted-foreground mt-0.5 truncate">{phone}</p>}
        </div>
      </div>

      <main className="mx-auto max-w-lg px-4 py-6">
        {/* 2-column grid */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 hover:border-accent/60 hover:bg-muted/40 transition-all text-left min-h-[96px] sm:min-h-[104px]"
            >
              <span className="text-foreground/70 group-hover:text-accent transition-colors mb-4 inline-block">
                {item.icon}
              </span>
              <div className="flex items-center justify-between w-full gap-2">
                <span className="text-[16px] sm:text-[18px] font-semibold leading-tight line-clamp-2">{item.label}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground/50 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>

        {/* Social icons */}
        <div className="mt-8 flex items-center justify-center gap-6">
          {[
            { icon: <Instagram className="h-5 w-5" />, label: "Instagram" },
            { icon: <Linkedin className="h-5 w-5" />,  label: "LinkedIn" },
            { icon: <Facebook className="h-5 w-5" />,  label: "Facebook" },
            { icon: <Twitter className="h-5 w-5" />,   label: "Twitter" },
          ].map((s) => (
            <button
              key={s.label}
              aria-label={s.label}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-accent hover:text-accent transition-all"
            >
              {s.icon}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Sub-components
══════════════════════════════════════════════════════ */

function SubHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-right max-w-[55%] truncate ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col px-4 py-3">
      <span className="text-xs text-muted-foreground mb-0.5">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function ComingSoonPage({
  title,
  icon,
  onBack,
}: {
  title: string;
  icon: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-background flex flex-col pb-24">
      <SubHeader title={title} onBack={onBack} />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
        {/* animated icon ring */}
        <div className="relative flex items-center justify-center">
          <span className="absolute h-36 w-36 rounded-full border border-accent/20 animate-ping opacity-30" />
          <span className="absolute h-28 w-28 rounded-full border border-accent/30" />
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-accent">
            {icon}
          </span>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Coming Soon</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
            We're working on this feature. Stay tuned for updates!
          </p>
        </div>

        {/* clock badge */}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" /> Under development
        </span>
      </div>
    </div>
  );
}
