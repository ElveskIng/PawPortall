"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { Loader2, Mail } from "lucide-react";

type Props = {
  defaultEmail?: string | null;
  onDone?: () => void;
};

export default function ResetPasswordDialog({ defaultEmail, onDone }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function sendLink() {
    setSending(true);
    setMsg(null);
    setErr(null);
    try {
      if (!email) {
        setErr("Please enter an email.");
        return;
      }
      const redirectTo = `${window.location.origin}/auth/callback?redirect=/profile`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setMsg("Reset link sent. Check your inbox.");
      if (onDone) onDone();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to send reset link.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/70"
        onClick={() => setOpen(true)}
      >
        <Mail className="w-4 h-4" />
        <span>Reset password</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 p-5 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">Send reset link</h3>
            <input
              className="w-full rounded-md border px-3 py-2 bg-transparent"
              type="email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {msg && <p className="mt-2 text-sm text-green-600">{msg}</p>}
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <div className="mt-4 flex gap-2 justify-end">
              <button
                className="px-3 py-2 rounded-md border"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
              <button
                className="px-3 py-2 rounded-md bg-primary text-white disabled:opacity-50 inline-flex items-center gap-2"
                onClick={sendLink}
                disabled={sending}
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                Send link
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
