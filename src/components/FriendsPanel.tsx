import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import Webcam from "react-webcam";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { renderSVG } from "uqr";
import {
  Users,
  UserPlus,
  Search,
  QrCode,
  ScanLine,
  Check,
  X,
  Flame,
  Hand,
  Loader2,
  Clock,
  Gift,
} from "lucide-react";
import { supabase } from "@/integrations/client";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/** QR payload namespace — stops wifi/URL/product codes being read as friend codes. */
const QR_PREFIX = "dombelz:u/";

interface Friend {
  id: string;
  full_name: string | null;
  username: string | null;
  current_streak: number;
  workouts_this_week: number;
  last_activity: string | null;
  last_activity_at: string | null;
  active_today: boolean;
  cheered_today: boolean;
}

interface Request {
  friendship_id: string;
  user_id: string;
  full_name: string | null;
  username: string | null;
  current_streak: number;
  direction: "incoming" | "outgoing";
  mutual_count: number;
}

interface Found {
  id: string;
  full_name: string | null;
  username: string | null;
  current_streak: number;
  status: "none" | "sent" | "incoming" | "friends";
}

const initial = (n: string | null) => (n?.trim()?.[0] ?? "?").toUpperCase();
const rpc = (fn: string, args?: Record<string, unknown>) => (supabase.rpc as any)(fn, args);

/** Avatar with an "active today" dot. Ring intensity tracks weekly consistency. */
function Avatar({ name, active, ring }: { name: string | null; active?: boolean; ring?: number }) {
  const strength =
    ring === undefined ? "border-border" : ring >= 5 ? "border-accent" : ring >= 2 ? "border-accent/50" : "border-border";
  return (
    <div className="relative shrink-0">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full border-2 bg-muted font-display text-lg font-bold ${strength}`}
      >
        {initial(name)}
      </div>
      {active && (
        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-accent" />
      )}
    </div>
  );
}

export function FriendsPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"FRIENDS" | "REQUESTS" | "DISCOVER">("FRIENDS");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [f, r, me] = await Promise.all([
      rpc("get_friends"),
      rpc("get_friend_requests"),
      supabase.from("user_profiles").select("username, full_name").eq("id", user.id).maybeSingle(),
    ]);
    if (f.error) toast.error(f.error.message);
    setFriends((f.data || []) as Friend[]);
    setRequests((r.data || []) as Request[]);
    setMyUsername((me.data as any)?.username ?? null);
    setMyName((me.data as any)?.full_name ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Search doubles as suggestions: an empty query returns people by streak.
  useEffect(() => {
    if (tab !== "DISCOVER") return;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await rpc("search_users", { q: query });
      setFound((data || []) as Found[]);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, tab]);

  const incoming = useMemo(() => requests.filter((r) => r.direction === "incoming"), [requests]);
  const outgoing = useMemo(() => requests.filter((r) => r.direction === "outgoing"), [requests]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const claimUsername = async () => {
    const name = draftName.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (name.length < 3) return toast.error("At least 3 characters (letters, numbers, underscore).");
    const { error } = await supabase.from("user_profiles").update({ username: name }).eq("id", user!.id);
    // 23505 = unique violation, i.e. somebody already has this handle
    if (error) return toast.error(error.code === "23505" ? "That username is taken." : error.message);
    setMyUsername(name);
    toast.success(`You're @${name}`);
  };

  const cheer = async (f: Friend) => {
    setBusy(f.id);
    const { error } = await supabase.from("cheers").insert({ from_user: user!.id, to_user: f.id });
    setBusy(null);
    if (error) return toast.error(error.code === "23505" ? "Already cheered today." : error.message);
    setFriends((prev) => prev.map((x) => (x.id === f.id ? { ...x, cheered_today: true } : x)));
    toast.success(`Cheered ${f.full_name?.split(" ")[0] ?? "them"}! 👋`);
  };

  const accept = async (r: Request) => {
    setBusy(r.friendship_id);
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", r.friendship_id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`You and ${r.full_name ?? "they"} are now friends`);
    load();
  };

  const remove = async (id: string, msg: string) => {
    setBusy(id);
    const { error } = await supabase.from("friendships").delete().eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(msg);
    load();
  };

  const addFriend = async (u: Found) => {
    setBusy(u.id);
    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: user!.id, addressee_id: u.id, status: "pending" });
    setBusy(null);
    if (error) return toast.error(error.message);
    setFound((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: "sent" } : x)));
    toast.success("Request sent");
    load();
  };

  /** Handles a decoded QR string. Server decides what the scan means. */
  const handleCode = async (raw: string) => {
    const code = raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw;
    const { data, error } = await rpc("resolve_friend_code", { code });
    if (error) return toast.error(error.message);
    const res = data?.[0];
    const who = res?.full_name ?? "them";
    const msg: Record<string, string> = {
      sent: `Request sent to ${who}`,
      accepted: `You and ${who} are now friends!`,
      pending: `Request to ${who} is already pending`,
      already_friends: `You're already friends with ${who}`,
      self: "That's your own code!",
      not_found: "Not a Dombelz friend code",
      unauthenticated: "Please sign in again",
    };
    const kind = res?.result ?? "not_found";
    if (kind === "sent" || kind === "accepted") {
      setScanOpen(false);
      toast.success(msg[kind]);
      load();
    } else {
      toast.error(msg[kind] ?? "Could not read that code");
    }
  };

  // ── QR scanning: same Webcam + zxing decode already used for barcodes ─────
  const camRef = useRef<Webcam>(null);
  useEffect(() => {
    if (!scanOpen) return;
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      const shot = camRef.current?.getScreenshot();
      if (shot) {
        try {
          const res = await reader.decodeFromImageUrl(shot);
          const text = res?.getText();
          if (text && !stopped) {
            stopped = true;
            await handleCode(text);
          }
        } catch {
          /* no code in this frame — expected most of the time */
        }
      }
    };
    const id = setInterval(tick, 700);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [scanOpen]);

  const myQr = useMemo(
    () =>
      myUsername
        ? renderSVG(QR_PREFIX + myUsername, {
            border: 2,
            blackColor: "currentColor",
            whiteColor: "transparent",
          })
        : null,
    [myUsername]
  );

  // ── Pieces ────────────────────────────────────────────────────────────────
  const Empty = ({ icon: Icon, text }: { icon: typeof Users; text: string }) => (
    <div className="rounded-2xl border border-dashed border-border p-12 text-center">
      <Icon className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );

  const Skeleton = () => (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/40" />
      ))}
    </div>
  );

  if (!myUsername && !loading) {
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/5 p-6">
        <h3 className="font-display text-lg font-bold">Claim your @username</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Friends use this to find you, and it's what your QR code points to.
        </p>
        <div className="mt-4 flex gap-2">
          <div className="flex flex-1 items-center rounded-xl border border-border bg-background px-3">
            <span className="text-muted-foreground">@</span>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="your_handle"
              className="w-full bg-transparent py-2.5 outline-none"
            />
          </div>
          <button
            onClick={claimUsername}
            className="rounded-xl bg-accent px-5 text-sm font-bold text-accent-foreground"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Tabs — same pattern as workout.tsx GYM/HOME/CARDIO ── */}
      <div className="flex gap-2 rounded-2xl border border-border/50 bg-muted/40 p-1.5">
        {(["FRIENDS", "REQUESTS", "DISCOVER"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 rounded-xl py-2.5 text-[11px] font-black uppercase tracking-widest transition-all ${
              tab === t
                ? "bg-background text-foreground shadow-sm ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
            {t === "REQUESTS" && incoming.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[9px] text-accent-foreground">
                {incoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Profile header — fixed above all sub-tabs ── */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar name={myName} />
            <div className="min-w-0">
              <p className="truncate font-bold">{myName || "Anonymous"}</p>
              <p className="truncate text-xs text-muted-foreground">@{myUsername}</p>
            </div>
          </div>
          <div className="shrink-0 text-right pr-6">
            <p className="font-bold">
              <span className="text-muted-foreground">Friends: </span>
              <span className="tabular-nums">{friends.length}</span>
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={() => setTab("DISCOVER")}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2.5 text-xs font-bold text-accent-foreground active:scale-95"
          >
            <UserPlus className="h-4 w-4" /> Add Friends
          </button>
          <button
            onClick={() => navigate({ to: "/profile", search: { page: "refer" } })}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-xs font-bold active:scale-95 hover:border-accent/50"
          >
            <Gift className="h-4 w-4" /> Refer a Friend
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : tab === "FRIENDS" ? (
        friends.length === 0 ? (
          <Empty icon={Users} text="No friends yet — scan a QR code or search in Discover." />
        ) : (
          <>
            {friends.map((f) => (
              <div key={f.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex gap-3">
                  <Avatar name={f.full_name} active={f.active_today} ring={f.workouts_this_week} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{f.full_name || "Anonymous"}</p>
                    <p className="truncate text-xs text-muted-foreground">@{f.username}</p>
                    <div className="mt-2 flex gap-6 text-xs">
                      <span>
                        <span className="block text-muted-foreground">Current Streak</span>
                        <span className="font-bold tabular-nums">
                          {f.current_streak} Days <Flame className="inline h-3 w-3 text-accent" />
                        </span>
                      </span>
                      <span>
                        <span className="block text-muted-foreground">This Week</span>
                        <span className="font-bold tabular-nums">{f.workouts_this_week}</span>
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => cheer(f)}
                    disabled={f.cheered_today || busy === f.id}
                    className={`h-fit shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition-all active:scale-95 ${
                      f.cheered_today
                        ? "bg-accent/15 text-accent"
                        : "border border-border bg-muted/50 hover:border-accent/50"
                    }`}
                  >
                    {f.cheered_today ? (
                      <>
                        <Check className="mr-1 inline h-3 w-3" />
                        Cheered
                      </>
                    ) : (
                      <>
                        <Hand className="mr-1 inline h-3 w-3" />
                        Cheer
                      </>
                    )}
                  </button>
                </div>
                {f.last_activity && (
                  <p className="mt-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                    Last Activity: <span className="text-foreground">{f.last_activity}</span>
                    {f.last_activity_at && ` (${f.last_activity_at})`}
                  </p>
                )}
              </div>
            ))}
          </>
        )
      ) : tab === "REQUESTS" ? (
        <>
          {incoming.length === 0 && outgoing.length === 0 ? (
            <Empty icon={Check} text="All clear! No pending requests." />
          ) : null}

          {incoming.map((r) => (
            <div key={r.friendship_id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <Avatar name={r.full_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.full_name || "Anonymous"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  @{r.username}
                  {r.mutual_count > 0 && ` · ${r.mutual_count} mutual`}
                </p>
              </div>
              <button
                onClick={() => accept(r)}
                disabled={busy === r.friendship_id}
                className="rounded-xl bg-accent px-3 py-2 text-xs font-bold text-accent-foreground active:scale-95"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(r.friendship_id, "Request declined")}
                disabled={busy === r.friendship_id}
                className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {outgoing.length > 0 && (
            <div className="rounded-2xl border border-border bg-card">
              <p className="px-4 pt-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Sent
              </p>
              {outgoing.map((r) => (
                <div key={r.friendship_id} className="flex items-center gap-3 border-t border-border/60 p-4 first:border-t-0">
                  <Avatar name={r.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.full_name || "Anonymous"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Clock className="mr-1 inline h-3 w-3" />
                      Pending
                    </p>
                  </div>
                  <button
                    onClick={() => remove(r.friendship_id, "Request cancelled")}
                    disabled={busy === r.friendship_id}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Discover */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or @username"
              className="w-full bg-transparent py-3 text-sm outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setQrOpen(true)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-accent/40 bg-accent/5 p-5 text-accent active:scale-95"
            >
              <QrCode className="h-7 w-7" />
              <span className="text-xs font-bold">My QR Code</span>
            </button>
            <button
              onClick={() => setScanOpen(true)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 active:scale-95"
            >
              <ScanLine className="h-7 w-7" />
              <span className="text-xs font-bold">Scan a Code</span>
            </button>
          </div>

          {searching ? (
            <Skeleton />
          ) : found.length === 0 ? (
            <Empty
              icon={Search}
              text={
                query.trim()
                  ? "No matches found. Try a different name or scan a QR code."
                  : "No suggestions yet — search by name/@username or share your QR code to add friends."
              }
            />
          ) : (
            <>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {query.trim() ? "Results" : "Suggested"}
              </p>
              {found.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
                  <Avatar name={u.full_name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{u.full_name || "Anonymous"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      @{u.username} · {u.current_streak} day streak
                    </p>
                  </div>
                  {u.status === "none" ? (
                    <button
                      onClick={() => addFriend(u)}
                      disabled={busy === u.id}
                      className="flex items-center gap-1 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-accent-foreground active:scale-95"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Add
                    </button>
                  ) : (
                    <span className="rounded-xl bg-muted px-3 py-2 text-xs font-bold capitalize text-muted-foreground">
                      {u.status === "sent" ? "Pending" : u.status}
                    </span>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* ── My QR — rendered from the username, stored nowhere, never changes ── */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">Your Friend Code</DialogTitle>
            <DialogDescription className="sr-only">
              Share this QR code so a friend can scan it and send you a friend request
            </DialogDescription>
          </DialogHeader>
          {myQr && (
            <div
              className="mx-auto w-56 text-foreground [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: myQr }}
            />
          )}
          <p className="text-center font-bold text-accent">@{myUsername}</p>
          <p className="text-center text-xs text-muted-foreground">
            Let a friend scan this. You'll get a request to approve.
          </p>
        </DialogContent>
      </Dialog>

      {/* ── Scanner ── */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan a Friend Code</DialogTitle>
            <DialogDescription className="sr-only">
              Point your camera at a friend's QR code to send them a friend request
            </DialogDescription>
          </DialogHeader>
          <div className="relative flex min-h-[260px] items-center justify-center overflow-hidden rounded-2xl border-2 border-border bg-black">
            <Webcam
              audio={false}
              ref={camRef}
              screenshotFormat="image/jpeg"
              videoConstraints={{ facingMode: "environment" }}
              onUserMediaError={() => {
                toast.error("Camera unavailable — search by username instead.");
                setScanOpen(false);
              }}
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-accent/70" />
            <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-2 text-xs text-white/80">
              <Loader2 className="h-3 w-3 animate-spin" /> Looking for a code…
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
