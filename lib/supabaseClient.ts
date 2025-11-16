"use client";

import { createBrowserClient } from "@supabase/ssr";
import { trackRequest } from "./requestMonitor";

declare global {
  // eslint-disable-next-line no-var
  var __supabase_browser__: ReturnType<typeof createBrowserClient> | undefined;
  var __supabase_call_count__: number | undefined;
  var __supabase_stack_traces__: Map<string, number> | undefined;
}

export function getSupabaseBrowserClient() {
  trackRequest();
  
  // Track call count
  if (typeof globalThis.__supabase_call_count__ === 'undefined') {
    globalThis.__supabase_call_count__ = 0;
    globalThis.__supabase_stack_traces__ = new Map();
  }
  globalThis.__supabase_call_count__++;

  // Capture stack trace to see WHO is calling this
  const stack = new Error().stack || '';
  const caller = stack.split('\n')[2]?.trim() || 'unknown';
  const count = globalThis.__supabase_stack_traces__!.get(caller) || 0;
  globalThis.__supabase_stack_traces__!.set(caller, count + 1);

  // Log top offenders every 100 calls
  if (globalThis.__supabase_call_count__ % 100 === 0) {
    console.error(`🚨 getSupabaseBrowserClient called ${globalThis.__supabase_call_count__} times!`);
    console.table(
      Array.from(globalThis.__supabase_stack_traces__!.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([caller, count]) => ({ caller, count }))
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (!globalThis.__supabase_browser__) {
    globalThis.__supabase_browser__ = createBrowserClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return globalThis.__supabase_browser__;
}