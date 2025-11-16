"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

/**
 * Live updates for payment_proofs.
 * - Subscribes to Supabase Realtime (INSERT/UPDATE/DELETE)
 * - NO polling (relies on realtime only)
 * - Refreshes when tab regains focus
 */
export default function PaymentProofsRealtime() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();
  const qs = useSearchParams();
  
  const lastRefresh = useRef(0);
  const REFRESH_COOLDOWN = 1000; // 1 second cooldown

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const triggerRefresh = () => {
      const now = Date.now();
      if (now - lastRefresh.current < REFRESH_COOLDOWN) {
        console.log('⏭️ Skipping refresh - too soon');
        return;
      }
      
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        lastRefresh.current = Date.now();
        router.refresh();
      }, 200);
    };

    // Realtime only - NO POLLING!
    const channel = supabase
      .channel("pp-payment-proofs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_proofs" },
        () => {
          console.log('📊 Payment proof changed - refreshing');
          triggerRefresh();
        }
      )
      .subscribe();

    // Refresh when user focuses the tab
    const onFocus = () => triggerRefresh();
    const onVis = () => {
      if (document.visibilityState === "visible") triggerRefresh();
    };
    
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [supabase, router, qs?.toString()]);

  return null;
}