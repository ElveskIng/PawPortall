// components/chat/MessagesDrawer.tsx
"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Convo = {
  id: string;
  pet: { id: string; name: string | null; photo_url: string | null };
  lastMessage?: string | null;
  unread: number;
};

const PENDING_KEY = "pp_pending_reads";            // convoId -> 1 (forces unread=0)
const ACTIVE_CONVO_KEY = "pp_active_conversation"; // current opened chat
const EVT_MARK = "pp:mark-read";
const EVT_REFRESH = "pp:refresh-drawer";
const BC_NAME = "pp-events";

const loadPending = (): Record<string, 1> => {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) || "{}"); } catch { return {}; }
};
const savePending = (p: Record<string, 1>) => {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch {}
};
const getActiveConvo = (): string | null => {
  try { return sessionStorage.getItem(ACTIVE_CONVO_KEY); } catch { return null; }
};

export default function MessagesDrawer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [convos, setConvos] = React.useState<Convo[]>([]);
  const [pending, setPending] = React.useState<Record<string, 1>>({});
  const [meId, setMeId] = React.useState<string | null>(null);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data?.user?.id ?? null));
  }, [supabase]);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Convo[];

      const active = getActiveConvo();
      const flags = { ...loadPending() };
      let mutated = false;

      const merged = data.map((c) => {
        const serverUnread = c.unread || 0;
        if (flags[c.id]) {
          if (serverUnread > 0) {
            if (active === c.id) {
              markReadKeepAlive(c.id);
              return { ...c, unread: 0 };
            }
            delete flags[c.id];
            mutated = true;
            return c;
          }
          return { ...c, unread: 0 };
        }
        return c;
      });

      if (mutated) { savePending(flags); setPending(flags); } else { setPending(flags); }
      setConvos(merged);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  // 🔥 KEY FIX: zero the convo indicated by the URL (?conversation=...)
  React.useEffect(() => {
    const idFromUrl = searchParams?.get("conversation");
    if (!idFromUrl) return;

    try { sessionStorage.setItem(ACTIVE_CONVO_KEY, idFromUrl); } catch {}
    const next = { ...loadPending(), [idFromUrl]: 1 as const };
    savePending(next); setPending(next);
    setConvos(prev => prev.map(c => c.id === idFromUrl ? { ...c, unread: 0 } : c));
  }, [searchParams]);

  React.useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    const onVis = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(refresh, 8000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(id);
    };
  }, [refresh]);

  React.useEffect(() => { if (open) refresh(); }, [open, refresh]);

  // Realtime message inserts / read changes → adjust badges
  React.useEffect(() => {
    const ch = supabase
      .channel("pp:drawer")
      .on(
        "postgres_changes",
        { schema: "public", table: "messages", event: "INSERT" },
        (payload: any) => {
          const convId = payload?.new?.conversation_id as string | undefined;
          const senderId = payload?.new?.sender_id as string | undefined;
          if (!convId) return;

          const active = getActiveConvo();
          const isOutgoing = !!meId && senderId === meId;
          const isIncoming = !!meId && senderId !== meId;

          if (isOutgoing) {
            if (active === convId) {
              const p = { ...loadPending(), [convId]: 1 as const };
              savePending(p); setPending(p);
              markReadKeepAlive(convId);
            }
            return;
          }
          if (isIncoming) {
            if (active === convId) {
              const p = { ...loadPending(), [convId]: 1 as const };
              savePending(p); setPending(p);
              markReadKeepAlive(convId);
            } else {
              const p = { ...loadPending() };
              if (p[convId]) { delete p[convId]; savePending(p); setPending(p); }
            }
          }
          refresh();
        }
      )
      .on(
        "postgres_changes",
        { schema: "public", table: "conversation_reads", event: "INSERT" },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { schema: "public", table: "conversation_reads", event: "UPDATE" },
        () => refresh()
      )
      .subscribe();

    return () => (supabase as any).removeChannel?.(ch);
  }, [supabase, meId, refresh]);

  // Same-tab event + BroadcastChannel
  React.useEffect(() => {
    function zeroUnread(convId: string) {
      setConvos(prev => prev.map(c => (c.id === convId ? { ...c, unread: 0 } : c)));
      const next = { ...loadPending(), [convId]: 1 as const };
      savePending(next);
      setPending(next);
    }

    function onMarkRead(e: Event) {
      const convId = (e as CustomEvent)?.detail?.conversationId as string | undefined;
      if (convId) zeroUnread(String(convId));
    }
    function onForceRefresh() { refresh(); }

    window.addEventListener(EVT_MARK, onMarkRead as any);
    window.addEventListener(EVT_REFRESH, onForceRefresh);

    let bc: BroadcastChannel | null = null;
    try {
      if ("BroadcastChannel" in window) {
        bc = new BroadcastChannel(BC_NAME);
        bc.onmessage = (msg) => {
          const d = msg?.data;
          if (d?.type === "mark-read" && d?.conversation_id) zeroUnread(String(d.conversation_id));
          else if (d?.type === "refresh") refresh();
        };
      }
    } catch {}

    return () => {
      window.removeEventListener(EVT_MARK, onMarkRead as any);
      window.removeEventListener(EVT_REFRESH, onForceRefresh);
      try { bc?.close(); } catch {}
    };
  }, [refresh]);

  const totalUnread = React.useMemo(
    () => convos.reduce((sum, c) => sum + (pending[c.id] ? 0 : (c.unread || 0)), 0),
    [convos, pending]
  );

  function markReadKeepAlive(conversation_id: string) {
    const body = JSON.stringify({ conversation_id });
    try {
      if ("sendBeacon" in navigator) {
        navigator.sendBeacon("/api/chat/mark-read", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/chat/mark-read", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch {}
  }

  function openConversation(c: Convo) {
    try { sessionStorage.setItem(ACTIVE_CONVO_KEY, c.id); } catch {}
    const flags = { ...loadPending(), [c.id]: 1 as const };
    savePending(flags); setPending(flags);
    setConvos(prev => prev.map(x => flags[x.id] ? { ...x, unread: 0 } : x));
    markReadKeepAlive(c.id);
    router.push(`/pets/${c.pet.id}/chat?conversation=${c.id}`);
  }

  const Avatar = ({ src, alt }: { src: string | null; alt: string }) => (
    <div className="h-8 w-8 overflow-hidden rounded-full bg-gray-200 ring-1 ring-gray-300">
      {src ? <img src={src} alt={alt} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-gray-400">🐾</div>}
    </div>
  );

  return (
    <>
      <button
        aria-label="Open messages"
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-[90] flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-2 text-white shadow-lg hover:translate-y-[-1px] hover:shadow-xl"
      >
        <span>Messages</span>
        {totalUnread > 0 && (
          <span className="ml-1 rounded-full bg-red-500 px-2 py-[2px] text-xs font-bold">{totalUnread}</span>
        )}
      </button>

      <div
        className={[
          "fixed bottom-24 right-6 z-[90] w-80 max-w-[92vw] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl transition-all",
          open ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm font-medium">Messages</div>
          <button aria-label="Close" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100">✕</button>
        </div>

        <div className="max-h-[360px] overflow-auto">
          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-500">Loading…</div>
          ) : convos.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-500">No conversations</div>
          ) : (
            <ul className="divide-y">
              {convos.map((c) => (
                <li key={c.id}>
                  <a
                    href={`/pets/${c.pet.id}/chat?conversation=${c.id}`}
                    onClick={(e) => { e.preventDefault(); setOpen(false); openConversation(c); }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <Avatar src={c.pet.photo_url} alt={c.pet.name ?? "Pet"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="truncate text-sm font-medium capitalize">{c.pet.name ?? "Pet"}</div>
                        {(!pending[c.id] && c.unread > 0) && (
                          <span className="ml-2 shrink-0 rounded-full bg-indigo-600 px-2 py-[2px] text-xs font-semibold text-white">{c.unread}</span>
                        )}
                      </div>
                      <div className="truncate text-xs text-gray-500">{c.lastMessage ?? "No message"}</div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
