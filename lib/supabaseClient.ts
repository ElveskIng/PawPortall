"use client";

import { createBrowserClient } from "@supabase/ssr";

// Singleton to prevent multiple client instances
declare global {
  // eslint-disable-next-line no-var
  var __supabase_browser__: ReturnType<typeof createBrowserClient> | undefined;
}

/**
 * Returns a singleton Supabase browser client.
 * DO NOT use this function to track API requests.
 * Only call trackRequest() in your actual data-fetching functions.
 */
export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  if (!globalThis.__supabase_browser__) {
    console.log('🆕 Creating NEW Supabase browser client');
    globalThis.__supabase_browser__ = createBrowserClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } else {
    console.log('♻️ Reusing EXISTING Supabase browser client');
  }

  return globalThis.__supabase_browser__;
}