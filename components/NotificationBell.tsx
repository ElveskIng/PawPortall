"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CheckCircle2, XCircle, UserPlus2, PawPrint, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import NotificationCard from "@/components/NotificationCard";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/* ───────────── Types ───────────── */
type NotifRow = {
  id: string;
  user_id: string;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  href?: string | null;
  data?: Record<string, any> | null;
  pet_id?: string | null;
  application_id?: string | null;
  read_at?: string | null;
  created_at: string;
};

type PetLite = { id: string; name: string | null };

/* ───────────── Helpers ───────────── */
function extractTargets(n: NotifRow) {
  const d = (n.data ?? {}) as any;

  const petId =
    n.pet_id ||
    d.pet_id ||
    d.petId ||
    d.pet_uuid ||
    d.petUUID ||
    d?.pet?.id ||
    d?.pet?.uuid ||
    null;

  const petSlug = d.pet_slug || d?.pet?.slug || d.slug || null;

  const petHref =
    d.pet_href ||
    (petId ? `/pets/${petId}` : null) ||
    (petSlug ? `/pets/${petSlug}` : null) ||
    n.href ||
    null;

  const appsHref =
    d.review_href ||
    d.applications_href ||
    (petId ? `/pets/${petId}/applications` : null) ||
    (petSlug ? `/pets/${petSlug}/applications` : null) ||
    null;

  return { petId, petSlug, petHref, appsHref };
}

const fmtFull = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

const tnorm = (t?: string | null) => (t ?? "").trim().toLowerCase();
const toneOf = (t?: string | null): "rose" | "green" | "indigo" | "gray" => {
  const tt = tnorm(t);
  if (tt.includes("rejected") || tt.includes("removed")) return "rose";
  if (tt.includes("approved")) return "green";
  if (tt.includes("created")) return "indigo";
  return "gray";
};

/* ───────────── Component ───────────── */
export default function NotificationBell() {
  const supabase = getSupabaseBrowserClient();
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number>(0);
  const [list, setList] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  const [petMap, setPetMap] = useState<Record<string, PetLite>>({});

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const uidRef = useRef<string | null>(null);
  const skipNextPathRefresh = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const newestTsRef = useRef<string | null>(null);

  useEffect(() => {
    newestTsRef.current = list[0]?.created_at ?? null;
  }, [list]);

  const unreadIds = useMemo(
    () => list.filter((n) => !n.read_at).map((n) => n.id),
    [list]
  );

  const derive = (n: NotifRow) => {
    const tt = tnorm(n.type);
    const pet = (n.pet_id && petMap[n.pet_id]) || null;
    const d = (n.data ?? {}) as any;

    const petName =
      d.pet_name ||
      d.petName ||
      d.name ||
      d.title ||
      d?.pet?.name ||
      d?.pet?.title ||
      pet?.name ||
      "your pet";

    if (tt === "pet_removed" || (tt.includes("pet") && tt.includes("removed"))) {
      return {
        title: "Your pet was removed by an admin",
        body: petName
          ? `The listing “${petName}” was removed.`
          : "Your pet listing was removed.",
        navHref: "/my/pets",
      };
    }

    const title =
      tt.includes("application.rejected")
        ? `Your application for ${petName} was rejected`
        : tt.includes("application.approved")
        ? `Your application for ${petName} was approved 🎉`
        : tt.includes("application.created")
        ? `New adoption application for ${petName}`
        : n.title || n.type || "Notification";

    const body =
      n.body ??
      (tt.includes("application.rejected")
        ? "The owner rejected your adoption request."
        : tt.includes("application.approved")
        ? "The owner approved your adoption request."
        : tt.includes("application.created")
        ? "Someone applied for your pet."
        : "");

    const { petHref, appsHref } = extractTargets(n);
    const isCreated =
      tt.includes("application.created") ||
      tt.endsWith(".created") ||
      tt.includes("created");
    const navHref = isCreated
      ? appsHref || petHref || "/notifications"
      : petHref || "/notifications";
    return { title, body, navHref };
  };

  const refreshCount = async (userId: string) => {
    const { count: c } = await supabase
      .from("notifications")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .is("read_at", null);
    setCount(c ?? 0);
  };

  const fetchPetsFor = async (rows: NotifRow[]) => {
    const ids = Array.from(
      new Set(rows.map((r) => r.pet_id).filter(Boolean) as string[])
    );
    if (ids.length === 0) return;
    const { data } = await (supabase.from("pets") as any)
      .select("id,name")
      .in("id", ids);
    const pets = (data ?? []) as PetLite[];
    setPetMap((prev) =>
      Object.assign({}, prev, ...pets.map((p) => ({ [p.id]: p })))
    );
  };

  const loadFirstPage = async (userId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) {
      setList([]);
      setHasMore(false);
    } else {
      const rows = (data ?? []) as NotifRow[];
      setList(rows);
      setHasMore(rows.length === 12);
      await fetchPetsFor(rows);
    }
    setLoading(false);
  };

  const loadMore = async () => {
    if (!uid || !list.length) return;
    setLoadingMore(true);
    const last = list[list.length - 1]?.created_at;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", uid)
      .lt("created_at", last)
      .order("created_at", { ascending: false })
      .limit(12);
    if (!error) {
      const rows = (data ?? []) as NotifRow[];
      setList((prev) => [...prev, ...rows]);
      setHasMore(rows.length === 12);
      await fetchPetsFor(rows);
    }
    setLoadingMore(false);
  };

  // ✅ cast table to any para wag na magreklamo si TS
  const markReadAndSync = async (id: string) => {
    setList((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n
      )
    );
    setCount((c) => Math.max(0, c - 1));
    await (supabase.from("notifications") as any)
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    if (uidRef.current) await refreshCount(uidRef.current);
  };

  // ✅ same cast
  const markAllRead = async () => {
    if (!uid) return;
    setList((prev) =>
      prev.map((n) =>
        n.read_at ? n : { ...n, read_at: new Date().toISOString() }
      )
    );
    setCount(0);
    await (supabase.from("notifications") as any)
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", uid)
      .is("read_at", null);
    await refreshCount(uid);
  };

  // ✅ same cast
  const dismiss = async (id: string) => {
    setList((prev) => prev.filter((n) => n.id !== id));
    await (supabase.from("notifications") as any).delete().eq("id", id);
    if (uid) await refreshCount(uid);
  };

  /* ───────────── Effects ───────────── */
  useEffect(() => {
    const setup = async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id ?? null;
      setUid(userId);
      uidRef.current = userId;

      // clear any prior poll/channel
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      if (chanRef.current) {
        try {
          supabase.removeChannel(chanRef.current);
        } catch {}
        chanRef.current = null;
      }

      if (!userId) {
        setCount(0);
        setList([]);
        setHasMore(false);
        setPetMap({});
        return;
      }

      await Promise.all([refreshCount(userId), loadFirstPage(userId)]);

      // Realtime (scoped to current user)
      chanRef.current = supabase
        .channel(`notif-dd-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload: RealtimePostgresChangesPayload<NotifRow>) => {
            const row = payload.new as NotifRow;
            setList((prev) =>
              prev.some((p) => p.id === row.id) ? prev : [row, ...prev]
            );
            void refreshCount(userId);
            if (row?.pet_id && !petMap[row.pet_id]) {
              void (async () => {
                const { data: pets } = await (supabase.from("pets") as any)
                  .select("id,name")
                  .eq("id", row.pet_id)
                  .limit(1);
                const p = (pets ?? [])[0] as PetLite | undefined;
                if (p) setPetMap((prev) => ({ ...prev, [p.id]: p }));
              })();
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload: RealtimePostgresChangesPayload<NotifRow>) => {
            const row = payload.new as NotifRow;
            setList((prev) => {
              const idx = prev.findIndex((p) => p.id === row.id);
              if (idx === -1) return [row, ...prev];
              const copy = [...prev];
              copy[idx] = { ...copy[idx], ...row };
              return copy;
            });
            void refreshCount(userId);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload: RealtimePostgresChangesPayload<NotifRow>) => {
            const old = payload.old as NotifRow;
            setList((prev) => prev.filter((p) => p.id !== old.id));
            void refreshCount(userId);
          }
        )
        .subscribe();

      // Fallback tiny poll
      pollTimerRef.current = window.setInterval(async () => {
        if (!uidRef.current) return;
        const newest = newestTsRef.current;
        let q = supabase
          .from("notifications")
          .select("*")
          .eq("user_id", uidRef.current)
          .order("created_at", { ascending: false })
          .limit(6);

        if (newest) q = q.gt("created_at", newest);

        const { data: fresh } = await q;
        if (fresh && fresh.length) {
          const rows = fresh as NotifRow[];
          setList((prev) => {
            const unseen = rows.filter((r) => !prev.some((p) => p.id === r.id));
            if (unseen.length === 0) return prev;
            return [...unseen, ...prev];
          });
          await refreshCount(uidRef.current);
          await fetchPetsFor(rows);
        }
      }, 4000);
    };

    void setup();

    const { data: authSub } = supabase.auth.onAuthStateChange(() => {
      void setup();
    });

    const onClickOutside = (evt: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(evt.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      if (chanRef.current) supabase.removeChannel(chanRef.current);
      authSub.subscription.unsubscribe();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // keep badge in sync after navigation
  useEffect(() => {
    if (!uid) return;
    if (skipNextPathRefresh.current) {
      skipNextPathRefresh.current = false;
      return;
    }
    void refreshCount(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, uid]);

  const Sectioned = useMemo(() => {
    const groups: Record<string, NotifRow[]> = {};
    for (const n of list) {
      const key = new Date(n.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      (groups[key] ||= []).push(n);
    }
    return Object.entries(groups);
  }, [list]);

  const go = async (href?: string | null, idToMark?: string) => {
    if (!href) return;
    try {
      if (idToMark) {
        skipNextPathRefresh.current = true;
        await markReadAndSync(idToMark);
      }
    } finally {
      setOpen(false);
      router.push(href);
      setTimeout(() => (skipNextPathRefresh.current = false), 800);
    }
  };

  // Prefetch when open
  useEffect(() => {
    if (!open) return;
    const hrefs = list
      .slice(0, 6)
      .map((n) => derive(n).navHref)
      .filter(Boolean) as string[];
    hrefs.forEach((h) => router.prefetch(h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list.length]);

  /* ───────────── Render ───────────── */
  return (
    <div ref={wrapRef} className="relative">
      {/* Bell */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex items-center justify-center rounded-xl border bg-white p-2 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        title={count > 0 ? `Notifications (${count} unread)` : "Notifications"}
        aria-label={count > 0 ? `Notifications (${count} unread)` : "Notifications"}
        aria-expanded={open}
      >
        <Bell className={`h-5 w-5 ${count > 0 ? "text-rose-600" : "text-gray-700"}`} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 min-w-[1.1rem] rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white shadow">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[36rem] overflow-hidden rounded-2xl border bg-white/95 shadow-2xl backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-semibold">Notifications</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{unreadIds.length} unread</span>
              <button
                onClick={() => markAllRead()}
                className="rounded-md border px-2 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Mark all read
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[32rem] overflow-auto p-3">
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-20 animate-pulse rounded-2xl border bg-gray-50" />
                ))}
              </div>
            ) : list.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-500">
                No notifications yet.
              </div>
            ) : (
              <div className="space-y-3">
                {Sectioned.map(([dateLabel, items]) => (
                  <div key={dateLabel} className="space-y-2">
                    <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      {dateLabel}
                    </div>

                    {items.map((n) => {
                      const tt = tnorm(n.type);
                      const { title, body, navHref } = derive(n);
                      const tone = toneOf(n.type);
                      const icon =
                        tt.includes("rejected") || tt.includes("removed") ? (
                          <XCircle className="h-4 w-4" />
                        ) : tt.includes("approved") ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : tt.includes("created") ? (
                          <UserPlus2 className="h-4 w-4" />
                        ) : (
                          <PawPrint className="h-4 w-4" />
                        );
                      const dateStr = fmtFull(n.created_at);

                      return (
                        <NotificationCard
                          key={n.id}
                          title={title}
                          body={body}
                          datetime={dateStr}
                          unread={!n.read_at}
                          icon={icon}
                          tone={tone}
                          imgSrc={undefined}
                          onCardClick={() => go(navHref, n.id)}
                          onDismiss={() => dismiss(n.id)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t px-4 py-2">
            <button
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="text-sm text-indigo-600 hover:underline"
            >
              View all
            </button>
            {hasMore ? (
              <button
                onClick={loadMore}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition hover:bg-gray-50"
              >
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                Load more
              </button>
            ) : (
              <span className="text-xs text-gray-400">End of list</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
