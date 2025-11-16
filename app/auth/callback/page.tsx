// app/auth/callback/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

/**
 * Handles both:
 * - Magic/PKCE:   ?code=...
 * - Email verify: ?type=signup&token_hash=...
 * After success, it notifies the opener tab via:
 *   1) window.opener.postMessage
 *   2) BroadcastChannel('pawportal-auth')
 *   3) localStorage('pawportal:confirmed')
 * then tries to window.close(), or redirects as fallback.
 */
export default function AuthCallback() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const search = useSearchParams();

  const next = search.get("next") || "/dashboard";
  const type = search.get("type");
  const token_hash = search.get("token_hash");
  const code = search.get("code");

  const [msg, setMsg] = useState("Finalizing sign-in…");

  useEffect(() => {
    async function run() {
      try {
        if (code) {
          // OAuth / magic link (PKCE)
          await supabase.auth.exchangeCodeForSession(code);
        } else if (type === "signup" && token_hash) {
          // Email confirm
          const { error } = await supabase.auth.verifyOtp({ type: "signup", token_hash });
          if (error) throw error;
        }

        // 1) Notify opener tab (best UX if email link opened a new tab)
        try {
          if (window.opener && window.opener !== window) {
            window.opener.postMessage({ type: "pawportal-confirmed", ts: Date.now() }, window.location.origin);
          }
        } catch {}

        // 2) BroadcastChannel (works even if opener is gone)
        try {
          const bc = new BroadcastChannel("pawportal-auth");
          bc.postMessage({ type: "pawportal-confirmed", ts: Date.now() });
          bc.close();
        } catch {}

        // 3) localStorage (classic fallback)
        try {
          localStorage.setItem("pawportal:confirmed", String(Date.now()));
        } catch {}

        setMsg("Confirmed! You can close this tab.");
        // Try to close this tab (allowed when opened by a user click)
        window.close?.();

        // Fallback redirect if the tab didn't close
        setTimeout(() => router.replace(next), 600);
      } catch (err: any) {
        setMsg(err?.message || "There was a problem completing the sign-in.");
      }
    }
    run();
  }, [supabase, router, next, type, token_hash, code]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl bg-white/90 p-6 shadow ring-1 ring-black/5 text-center">
        <h1 className="text-xl font-semibold">PawPortal</h1>
        <p className="mt-2 text-sm text-zinc-700">{msg}</p>
      </div>
    </main>
  );
}
