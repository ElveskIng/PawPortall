"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { LogOut } from "lucide-react";

type ProfileFlags = {
  is_suspended?: boolean | null;
  suspended_until?: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysLeft(untilIso?: string | null) {
  if (!untilIso) return 0;
  const now = Date.now();
  const until = new Date(untilIso).getTime();
  const diff = Math.ceil((until - now) / MS_PER_DAY);
  return diff > 0 ? diff : 0;
}

export default function SuspensionGate() {
  const supabase = getSupabaseBrowserClient();
  const [blocking, setBlocking] = useState(false);
  const [left, setLeft] = useState(0);
  const [until, setUntil] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const u = auth?.user;
      if (!u) {
        setBlocking(false);
        setLeft(0);
        setUntil(null);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("is_suspended, suspended_until")
        .eq("id", u.id)
        .single<ProfileFlags>();

      if (error) {
        setBlocking(false);
        setLeft(0);
        setUntil(null);
        return;
      }

      const active =
        !!data?.is_suspended &&
        !!data?.suspended_until &&
        new Date(data.suspended_until).getTime() > Date.now();

      setBlocking(active);
      setUntil(active ? data!.suspended_until! : null);
      setLeft(active ? daysLeft(data!.suspended_until!) : 0);
    } finally {
      setChecking(false);
    }
  }, [supabase]);

  useEffect(() => {
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => sub.subscription.unsubscribe();
  }, [supabase, check]);

  if (checking || !blocking) return null;

  async function signOut() {
    await supabase.auth.signOut();
    // optional: hard reload to ensure cleared UI
    window.location.href = "/sign-in";
  }

  // Full-screen blocking overlay
  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0c1016] shadow-2xl overflow-hidden border border-black/10 dark:border-white/10">
        <div className="px-5 py-3 bg-gradient-to-r from-rose-600 via-fuchsia-600 to-purple-600 text-white">
          <div className="text-lg font-semibold">Account suspended</div>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-gray-700 dark:text-gray-100">
            Your account is currently <span className="font-semibold text-rose-600">suspended</span>.
          </p>

          <div className="rounded-xl border border-rose-200/80 bg-rose-50 px-4 py-3 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {left > 0 ? (
              <div>
                Suspension will end in <span className="font-semibold">{left} day{left > 1 ? "s" : ""}</span>
                {until && (
                  <>
                    {" "}(
                    <span className="font-mono">
                      {new Date(until).toLocaleString()}
                    </span>
                    )
                  </>
                )}.
              </div>
            ) : (
              <div>
                Suspension until{" "}
                <span className="font-mono">
                  {until ? new Date(until).toLocaleString() : "—"}
                </span>
                .
              </div>
            )}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300">
            If you think this is a mistake, please contact support.
          </p>

          <div className="pt-2 flex justify-end gap-2">
            <button
              onClick={signOut}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 text-white px-4 py-2 hover:bg-black"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Prevent any pointer events to the app below */}
      <style jsx>{`
        :global(body) { overflow: hidden; }
      `}</style>
    </div>
  );
}
