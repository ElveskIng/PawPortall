// app/auth/confirm/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export default function ConfirmPage() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const search = useSearchParams();

  const next = decodeURIComponent(search.get("next") || "/dashboard");
  const code = search.get("code");
  const errParam = search.get("error");
  const errDesc = search.get("error_description");

  const [msg, setMsg] = useState<string | null>(null);

  // Helper: go to next and make sure server components revalidate
  const go = () => {
    router.replace(next);
    // Important so the dashboard fetches with the new cookies/session
    router.refresh();                // ← this line forces a re-fetch
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) If Supabase returned an explicit error in the URL, show it and bail.
      if (errParam) {
        setMsg(errDesc || "Email link is invalid or has expired.");
        return;
      }

      // 2) If we already have a session, go immediately.
      {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!cancelled && session) {
          go();
          return;
        }
      }

      // 3) If the link contains a one-time code, exchange it for a session.
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMsg(error.message || "Verification failed.");
          return;
        }
        if (!cancelled) {
          go();
          return;
        }
      }
    })();

    // 4) Also listen for the moment the session is created by the provider.
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_evt: AuthChangeEvent, session: Session | null) => {
        if (!cancelled && session) {
          go();
        }
      }
    );

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, next, code, errParam, errDesc]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="card w-full max-w-xl p-8 text-center">
        <h1 className="text-2xl font-semibold mb-2">Email verification</h1>
        <p className="text-sm text-slate-600">
          {msg ?? "Checking status..."}
        </p>
      </div>
    </div>
  );
}
