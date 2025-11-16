// components/chat/ChatRoom.tsx
"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

const PENDING_KEY = "pp_pending_reads";
const ACTIVE_CONVO_KEY = "pp_active_conversation";
const EVT_MARK = "pp:mark-read";
const EVT_REFRESH = "pp:refresh-drawer";
const BC_NAME = "pp-events";

export default function ChatRoom({
  conversationId,
  currentUserId,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
}) {
  const supabase = getSupabaseBrowserClient();
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [confirmChoice, setConfirmChoice] =
    useState<"everyone" | "me">("everyone");
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);

  function setPendingSeen() {
    try {
      const p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "{}") as
        | Record<string, 1>
        | {};
      if (!(p as any)[conversationId]) {
        (p as any)[conversationId] = 1 as const;
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(p));
      }
    } catch {}
  }
  function notifyDrawerMarkRead() {
    try {
      window.dispatchEvent(
        new CustomEvent(EVT_MARK, { detail: { conversationId } })
      );
    } catch {}
    try {
      if ("BroadcastChannel" in window) {
        const bc = new BroadcastChannel(BC_NAME);
        bc.postMessage({ type: "mark-read", conversation_id: conversationId });
        bc.close();
      }
    } catch {}
  }
  function notifyDrawerRefresh() {
    try {
      window.dispatchEvent(new Event(EVT_REFRESH));
    } catch {}
    try {
      if ("BroadcastChannel" in window) {
        const bc = new BroadcastChannel(BC_NAME);
        bc.postMessage({ type: "refresh" });
        bc.close();
      }
    } catch {}
  }
  function postMarkReadKeepAlive() {
    const body = JSON.stringify({ conversation_id: conversationId });
    try {
      if ("sendBeacon" in navigator) {
        navigator.sendBeacon(
          "/api/chat/mark-read",
          new Blob([body], { type: "application/json" })
        );
      } else {
        fetch("/api/chat/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  }
  function markReadNow() {
    setPendingSeen();
    notifyDrawerMarkRead();
    postMarkReadKeepAlive();
    notifyDrawerRefresh();
  }

  const pushUnique = (m: Message) =>
    setMessages((prev) => {
      if (!m?.id) return prev;
      if (prev.some((x) => x.id === m.id)) return prev;
      const next = [...prev, m].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
      return next;
    });

  const lastTs = useMemo(
    () => (messages.length ? messages[messages.length - 1].created_at : null),
    [messages]
  );

  useEffect(() => {
    try {
      sessionStorage.setItem(ACTIVE_CONVO_KEY, conversationId);
    } catch {}
    markReadNow();
    return () => {
      try {
        const v = sessionStorage.getItem(ACTIVE_CONVO_KEY);
        if (v === conversationId) sessionStorage.removeItem(ACTIVE_CONVO_KEY);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "messages",
          event: "INSERT",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          pushUnique(payload.new as Message);
          markReadNow();
        }
      )
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "messages",
          event: "DELETE",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => {
          const id = payload.old?.id as string | undefined;
          if (id)
            setMessages((prev) => prev.filter((m) => m.id !== id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, supabase]);

  useEffect(() => {
    const bc = supabase.channel(`bc:chat:${conversationId}`, {
      config: { broadcast: { self: false }, presence: { key: currentUserId } },
    });

    bc.on("broadcast", { event: "new-message" }, (p) => {
      const m = p.payload as Message;
      if (m?.conversation_id === conversationId) {
        pushUnique(m);
        markReadNow();
      }
    });

    bc.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await bc.track({ online: true });
        } catch {}
      }
    });

    return () => {
      supabase.removeChannel(bc);
    };
  }, [conversationId, currentUserId, supabase]);

  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const q = supabase
          .from("messages")
          .select("id, conversation_id, sender_id, body, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });
        const { data } = lastTs ? await q.gt("created_at", lastTs) : await q;
        (data || []).forEach((m) => pushUnique(m as Message));
        if ((data || []).length) markReadNow();
      } catch {}
    }
    const id = setInterval(() => {
      if (!stop) poll();
    }, 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [conversationId, lastTs, supabase]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    markReadNow();
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onFocus = () => {
      markReadNow();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") markReadNow();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let stop = false;
    async function fetchSeen() {
      try {
        const { data } = await supabase
          .from("conversation_reads")
          .select("last_read_at, user_id")
          .eq("conversation_id", conversationId)
          .neq("user_id", currentUserId)
          .maybeSingle();
        setOtherLastReadAt((data as any)?.last_read_at ?? null);
      } catch {}
    }
    fetchSeen();
    const id = setInterval(() => !stop && fetchSeen(), 3000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [conversationId, currentUserId, supabase]);

  const lastMine = useMemo(
    () =>
      [...messages].reverse().find((m) => m.sender_id === currentUserId) ||
      null,
    [messages, currentUserId]
  );
  const seen =
    lastMine && otherLastReadAt
      ? new Date(otherLastReadAt).getTime() >=
        new Date(lastMine.created_at).getTime()
      : false;

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");

    const res = await fetch("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversation_id: conversationId, body }),
    });

    if (!res.ok) {
      try {
        const j = await res.json();
        alert("Failed to send: " + (j.error || res.statusText));
      } catch {
        alert("Failed to send: " + res.statusText);
      }
      return;
    }

    const j = (await res.json()) as { ok: boolean; message?: Message };
    if (j?.message) {
      pushUnique(j.message);
      markReadNow();
      try {
        await supabase
          .channel(`bc:chat:${conversationId}`)
          .send({
            type: "broadcast",
            event: "new-message",
            payload: j.message,
          });
      } catch {}
    }
  }

  async function unsendForEveryone(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) {
      alert(error.message);
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      setMessages((data as any) ?? []);
    }
  }
  async function unsendForMe(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    try {
      await supabase
        .from("message_hides")
        .upsert({ message_id: id, user_id: currentUserId } as any);
    } catch {}
  }
  function openConfirm(id: string) {
    setMenuFor(null);
    setConfirmFor(id);
    setConfirmChoice("everyone");
  }
  async function confirmUnsend() {
    const id = confirmFor!;
    setConfirmFor(null);
    if (confirmChoice === "everyone") await unsendForEveryone(id);
    else await unsendForMe(id);
  }

  return (
    <div className="relative flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-indigo-50 via-white to-emerald-50">
      {/* Big, subtle paw watermark */}
      <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center">
        <div className="select-none text-[160px] leading-none opacity-[0.06]">
          🐾
        </div>
      </div>

      {/* Messages list */}
      <div
        ref={listRef}
        className="relative z-10 flex-1 space-y-2 overflow-y-auto p-4"
      >
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`relative max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow ${
                  mine
                    ? "ml-auto bg-indigo-600 text-white shadow-indigo-200"
                    : "bg-white/80 text-gray-900 ring-1 ring-gray-200 backdrop-blur"
                }`}
              >
                {mine && (
                  <div className="absolute left-[-36px] top-1/2 z-10 -translate-y-1/2">
                    <button
                      onClick={() =>
                        setMenuFor(menuFor === m.id ? null : m.id)
                      }
                      className="grid h-7 w-7 place-items-center rounded-full bg-black/85 text-white shadow hover:bg-black"
                      title="More"
                    >
                      <span className="text-[16px] leading-none">⋯</span>
                    </button>
                    {menuFor === m.id && (
                      <div className="absolute left-full ml-2 mt-2 w-44 rounded-lg bg-neutral-900 py-1 text-sm text-neutral-100 shadow-2xl ring-1 ring-black/60">
                        <button
                          onClick={() => openConfirm(m.id)}
                          className="block w-full px-3 py-2 text-left hover:bg-neutral-800"
                        >
                          Unsend
                        </button>
                        <button
                          onClick={() => setMenuFor(null)}
                          className="block w-full px-3 py-2 text-left text-neutral-300 hover:bg-neutral-800"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                <div
                  className={`mt-1 text-[10px] ${
                    mine ? "text-indigo-100/80" : "text-gray-500/80"
                  }`}
                >
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}

        {lastMine && seen ? (
          <div className="mt-1 flex justify-end pr-2">
            <span className="rounded-full bg-white/70 px-2 py-[2px] text-[11px] text-gray-600 ring-1 ring-gray-200 backdrop-blur">
              Seen
            </span>
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <form
        onSubmit={onSend}
        className="relative z-10 flex items-center gap-2 border-t border-gray-200 bg-white/80 p-3 backdrop-blur"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a message…"
          className="flex-1 rounded-xl border border-gray-300 bg-white/90 px-3 py-2 text-sm outline-none ring-0 transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
        />
        <button
          type="submit"
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700"
        >
          Send
        </button>
      </form>

      {/* Confirm modal (unchanged) */}
      {confirmFor && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-neutral-900 text-neutral-100 shadow-2xl ring-1 ring-black/60">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <div className="text-base font-semibold">
                Who do you want to unsend this message for?
              </div>
              <button
                onClick={() => setConfirmFor(null)}
                className="rounded p-1 text-neutral-300 hover:bg-white/5 hover:text-white"
                title="Close"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1 px-4 py-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                <input
                  type="radio"
                  name="unsend"
                  className="mt-1"
                  checked={confirmChoice === "everyone"}
                  onChange={() => setConfirmChoice("everyone")}
                />
                <div>
                  <div className="text-sm font-medium">Unsend for everyone</div>
                  <div className="text-xs text-neutral-400">
                    This will remove the message for everyone in the chat.
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                <input
                  type="radio"
                  name="unsend"
                  className="mt-1"
                  checked={confirmChoice === "me"}
                  onChange={() => setConfirmChoice("me")}
                />
                <div>
                  <div className="text-sm font-medium">Unsend for you</div>
                  <div className="text-xs text-neutral-400">
                    This will remove the message on your device only.
                  </div>
                </div>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-white/5 px-4 py-3">
              <button
                onClick={() => setConfirmFor(null)}
                className="rounded-md px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={confirmUnsend}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
