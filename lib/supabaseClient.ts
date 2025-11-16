"use client";

import { createBrowserClient } from "@supabase/ssr";

// Keep a single instance in dev/HMR to avoid re-creating clients
declare global {
  // eslint-disable-next-line no-var
  var __supabase_browser__: ReturnType<typeof createBrowserClient> | undefined;
}

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Supabase: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  if (!globalThis.__supabase_browser__) {
    globalThis.__supabase_browser__ = createBrowserClient(url, anon, {
      auth: {
        // ✅ make sure session stays after refresh
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return globalThis.__supabase_browser__;
}
