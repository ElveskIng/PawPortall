// components/ReportUserButton.tsx
"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { Flag, Loader2, X } from "lucide-react";

export default function ReportUserButton({
  reportedUserId,
}: {
  reportedUserId: string;
}) {
  const supabase = getSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Spam or misleading");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submitReport() {
    setSaving(true);
    setMsg(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMsg("Please sign in to report.");
        setSaving(false);
        return;
      }

      // ✅ FIXED: gawing array insert + cast to any
      const { error } = await supabase
        .from("user_reports")
        .insert(
          [
            {
              reported_user_id: reportedUserId,
              reporter_user_id: user.id,
              reason,
              notes: notes || null,
            },
          ] as any
        );

      if (error) {
        setMsg("We couldn’t send your report right now.");
      } else {
        setMsg("Thanks, your report was submitted.");
        setOpen(false);
        setReason("Spam or misleading");
        setNotes("");
        setTimeout(() => setMsg(null), 3500);
      }
    } catch {
      setMsg("We couldn’t send your report right now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-white/90 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white shadow"
        title="Report user"
      >
        <Flag className="h-4 w-4" />
        Report user
      </button>

      {msg && (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-md bg-amber-50 px-4 py-2 text-amber-800 shadow">
          {msg}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 px-5 py-3 text-white">
              <div className="font-semibold">Report this user</div>
              <button onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-5 w-5 opacity-90" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="text-sm text-gray-600">Reason</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none ring-indigo-500 focus:ring-2"
                >
                  <option>Spam or misleading</option>
                  <option>Harassment or hate</option>
                  <option>Fraud or scam</option>
                  <option>Posting inappropriate content</option>
                  <option>Other</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">
                  Notes (optional)
                </label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none ring-indigo-500 focus:ring-2"
                  placeholder="Add more details to help us understand the issue…"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitReport}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? "Sending…" : "Submit report"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
