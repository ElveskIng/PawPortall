// components/AuthHydrator.tsx
"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Props = {
  serverUserId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

export default function AuthHydrator({
  serverUserId,
  accessToken,
  refreshToken,
}: Props) {
  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      // user na nakikita ng browser ngayon
      const {
        data: { user: clientUser },
      } = await supabase.auth.getUser();

      const clientUserId = clientUser?.id ?? null;

      // CASE 1: wala sa server pero meron sa browser → i-logout browser
      if (!serverUserId && clientUserId) {
        if (!cancelled) {
          await supabase.auth.signOut();
        }
        return;
      }

      // CASE 2: may user sa server, pero iba yung nasa browser → gamitin natin yung session ng server
      if (
        serverUserId &&
        serverUserId !== clientUserId &&
        accessToken /* siguraduhin may token */
      ) {
        if (!cancelled) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? "",
          });
        }
      }
      // CASE 3: pareho → wala tayong gagawin
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [supabase, serverUserId, accessToken, refreshToken]);

  return null;
}
