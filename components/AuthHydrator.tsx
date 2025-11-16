"use client";

import { useEffect, useMemo, useRef } from "react";
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
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const syncedRef = useRef(false); // ✅ Prevent multiple syncs

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      if (syncedRef.current) {
        console.log('⏭️ AuthHydrator: Already synced, skipping');
        return;
      }

      console.log('🔄 AuthHydrator: Starting sync...', {
        serverUserId,
        hasAccessToken: !!accessToken,
      });

      // Get current browser session
      const {
        data: { session: clientSession },
      } = await supabase.auth.getSession();

      const clientUserId = clientSession?.user?.id ?? null;

      console.log('🔍 AuthHydrator: Current state', {
        clientUserId,
        serverUserId,
        match: clientUserId === serverUserId,
      });

      // CASE 1: No user on server but exists in browser → sign out
      if (!serverUserId && clientUserId) {
        console.log('🚪 AuthHydrator: Signing out (no server user)');
        if (!cancelled) {
          await supabase.auth.signOut();
          syncedRef.current = true;
        }
        return;
      }

      // CASE 2: Server user exists but different from browser → set server session
      if (
        serverUserId &&
        serverUserId !== clientUserId &&
        accessToken &&
        refreshToken
      ) {
        console.log('🔐 AuthHydrator: Setting server session');
        if (!cancelled) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('❌ AuthHydrator: Failed to set session', error);
          } else {
            console.log('✅ AuthHydrator: Session set successfully');
            syncedRef.current = true;
          }
        }
        return;
      }

      // CASE 3: Match or no action needed
      console.log('✅ AuthHydrator: No sync needed');
      syncedRef.current = true;
    };

    void sync();

    return () => {
      cancelled = true;
    };
  }, [supabase, serverUserId, accessToken, refreshToken]);

  return null;
}