// app/notifications/AutoReadNotifications.tsx
"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export default function AutoReadNotifications() {
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // mark all unread as read
      await (supabase as any)
        .from("notifications")
        .update({ read_at: new Date().toISOString() } as any)
        .is("read_at", null)
        .eq("user_id", user.id);
      // NotificationBell listens to updates and will recompute automatically.
    })();
  }, []); // walang dep para di mag-loop

  return null;
}
