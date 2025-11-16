"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function SupabaseListener() {
  const supabase = getSupabaseBrowserClient();
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // revalidate server components that depend on auth
      router.refresh();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase, router]);

  return null;
}
