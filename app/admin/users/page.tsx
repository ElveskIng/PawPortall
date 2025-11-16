/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DataTable } from "@/components/admin/DataTable";

type UserRow = {
  id: string;
  full_name?: string;
  email?: string;
  role?: string;
  is_verified?: unknown;
  is_suspended?: unknown;
  suspended_until?: string | null;
  created_at?: string;

  reports_count?: number;
  approved_pets_count?: number;
  adopted_pets_count?: number;

  id_image_url?: string | null;
};

function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <div className="rounded-xl bg-black/85 text-white px-4 py-2 shadow-lg">
        <div className="flex items-center gap-3">
          <span>{message}</span>
          <button
            onClick={onClose}
            className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function toStrictBool(v: unknown) {
  if (v === true) return true;
  if (v === 1) return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "1" || s === "true") return true;
  }
  return false;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function pageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set<number>([1, 2, total - 1, total, current - 1, current, current + 1]);
  const sorted = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "...")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      out.push(sorted[i]);
      continue;
    }
    const prev = sorted[i - 1],
      cur = sorted[i];
    if (cur - prev === 1) out.push(cur);
    else out.push("...", cur);
  }
  return out;
}

function formatJoined(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;

  const pretty = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - d.getTime()) / 1000));
  const mins = Math.floor(diffSec / 60);
  const hours = Math.floor(diffSec / 3600);
  const days = Math.floor(diffSec / 86400);

  let rel = "";
  if (diffSec < 60) rel = "just now";
  else if (mins < 60) rel = `${mins} min${mins === 1 ? "" : "s"} ago`;
  else if (hours < 24) rel = `${hours} hr${hours === 1 ? "" : "s"} ago`;
  else if (days < 30) rel = `${days} day${days === 1 ? "" : "s"} ago`;

  return rel ? `${pretty} · ${rel}` : pretty;
}

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [suspendDays, setSuspendDays] = useState<number>(7);
  const [toast, setToast] = useState<string | null>(null);

  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // For ID image preview modal
  const [idPreviewUrl, setIdPreviewUrl] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected]
  );

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (role !== "all") qs.set("role", role);
      if (q) qs.set("q", q);
      const res = await fetch(`/api/admin/users?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json();

      const itemsRaw: UserRow[] = (data.items ?? []).filter(
        (u: UserRow) => (u.role || "").toLowerCase() !== "admin"
      );

      const items: UserRow[] = itemsRaw.map((u) => ({
        ...u,
        is_verified: toStrictBool(u.is_verified),
        is_suspended: toStrictBool(u.is_suspended),
        reports_count: 0,
        approved_pets_count: 0,
        adopted_pets_count: 0,
      }));

      setRows(items);
      setSelected({});
      setPage(1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [role]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    setPage((p) => clamp(p, 1, totalPages));
  }, [rows.length, pageSize]);

  async function callBulk(
    body: { action: "verify" | "unverify" | "suspend" | "unsuspend"; userIds: string[]; days?: number },
    successMessage: string
  ) {
    if (body.userIds.length === 0) return;

    const res = await fetch("/api/admin/users/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setToast(err?.error || "Failed to perform action.");
      return;
    }

    setToast(successMessage);
    await load();
  }

  const onVerify = () =>
    callBulk({ action: "verify", userIds: selectedIds }, "Users verified successfully.");
  const onUnverify = () =>
    callBulk({ action: "unverify", userIds: selectedIds }, "Users unverified.");
  const onSuspend = () =>
    callBulk(
      { action: "suspend", userIds: selectedIds, days: suspendDays },
      `Users suspended for ${suspendDays} day(s).`
    );
  const onUnsuspend = () =>
    callBulk({ action: "unsuspend", userIds: selectedIds }, "Users unsuspended.");

  const columns = useMemo(
    () => [
      {
        key: "select",
        header: (
          <input
            type="checkbox"
            onChange={(e) => {
              const val = e.target.checked;
              const next: Record<string, boolean> = {};
              rows.forEach((r) => (next[r.id] = val));
              setSelected(next);
            }}
            checked={rows.length > 0 && rows.every((r) => !!selected[r.id])}
          />
        ),
        render: (r: UserRow) => (
          <input
            type="checkbox"
            checked={!!selected[r.id]}
            onChange={(e) => {
              const checked = e.target.checked;
              setSelected((p) => ({ ...p, [r.id]: checked }));
            }}
          />
        ),
      },
      {
        key: "id",
        header: "User ID",
        render: (r: UserRow) => <span className="text-xs text-slate-500">{r.id}</span>,
      },
      {
        key: "full_name",
        header: "Name",
        render: (r: UserRow) => (
          <div className="flex items-center gap-2">
            <Link href={`/users/${r.id}`} className="text-indigo-700 hover:underline">
              {r.full_name || "Unnamed"}
            </Link>
            {r.is_verified === true && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                verified
              </span>
            )}
            {r.is_suspended === true && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                suspended
              </span>
            )}
          </div>
        ),
      },
      { key: "email", header: "Email" },
      { key: "role", header: "Role" },
      {
        key: "reports_count",
        header: "Reports",
        render: (r: UserRow) => <span className="text-sm">{r.reports_count ?? 0}</span>,
      },
      {
        key: "adopted_pets_count",
        header: "Adopted",
        render: (r: UserRow) => <span className="text-sm">{r.adopted_pets_count ?? 0}</span>,
      },
      {
        key: "created_at",
        header: "Joined",
        render: (r: UserRow) => (
          <span className="text-sm text-slate-700">{formatJoined(r.created_at)}</span>
        ),
      },
      {
        key: "id_image",
        header: "ID",
        render: (r: UserRow) => {
          const url = (r.id_image_url || "").trim();

          if (!url) {
            return (
              <span className="text-[11px] italic text-slate-400">
                No ID uploaded
              </span>
            );
          }

          return (
            <button
              type="button"
              onClick={() => setIdPreviewUrl(url)}
              className="group h-16 w-28 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 shadow-sm overflow-hidden transition"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="ID image"
                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
              />
            </button>
          );
        },
      },
    ],
    [rows, selected]
  );

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = clamp(page, 1, totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const viewRows = rows.slice(start, end);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">User Management</h2>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
        >
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white dark:bg-slate-800"
          >
            <option value="all">All Roles</option>
            <option value="owner">Owners</option>
            <option value="shelter">Shelters</option>
            <option value="adopter">Adopters</option>
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name/email…"
            className="px-3 py-2 rounded-lg border border-slate-300 bg-white dark:bg-slate-800"
          />

          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Search
          </button>
        </form>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              Showing{" "}
              <span className="font-semibold text-slate-800">{total === 0 ? 0 : start + 1}</span>{" "}
              – <span className="font-semibold text-slate-800">{end}</span>
            </div>
            <div />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 shadow-sm">
            <DataTable columns={columns as any} rows={viewRows} />
          </div>

          <div className="flex justify-end">
            <Pager
              currentPage={currentPage}
              totalPages={totalPages}
              onPage={(p) => setPage(clamp(p, 1, totalPages))}
              pageSize={pageSize}
              onPageSize={(s) => setPageSize(clamp(s, 1, 100))}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-sm text-slate-700">{selectedIds.length} selected</span>

            <button
              disabled={selectedIds.length === 0}
              onClick={onVerify}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Verify
            </button>

            <button
              disabled={selectedIds.length === 0}
              onClick={onUnverify}
              className="px-3 py-2 rounded-lg bg-slate-500 text-white hover:bg-slate-600 disabled:opacity-50"
            >
              Unverify
            </button>

            <div className="flex items-center gap-2">
              <button
                disabled={selectedIds.length === 0}
                onClick={onSuspend}
                className="px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Suspend
              </button>
              <label className="text-sm text-slate-600">Days</label>
              <input
                type="number"
                min={1}
                value={suspendDays}
                onChange={(e) => setSuspendDays(Math.max(1, Number(e.target.value) || 7))}
                className="w-16 rounded-lg border border-slate-300 px-2 py-1"
              />
            </div>

            <button
              disabled={selectedIds.length === 0}
              onClick={onUnsuspend}
              className="px-3 py-2 rounded-lg bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Unsuspend
            </button>
          </div>
        </>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />

      {/* BIG ID PREVIEW MODAL */}
      {idPreviewUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-4xl">
            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setIdPreviewUrl(null)}
                className="absolute right-4 top-3 text-sm text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
              <div className="bg-slate-100 flex items-center justify-center max-h-[80vh]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={idPreviewUrl}
                  alt="User ID"
                  className="max-h-[80vh] w-auto object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pager({
  currentPage,
  totalPages,
  onPage,
  pageSize,
  onPageSize,
}: {
  currentPage: number;
  totalPages: number;
  onPage: (p: number) => void;
  pageSize: number;
  onPageSize: (s: number) => void;
}) {
  const nums = pageNumbers(currentPage, totalPages);
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onPage(currentPage - 1)}
        disabled={currentPage === 1}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-slate-50"
      >
        Prev
      </button>

      {nums.map((n, i) =>
        n === "..." ? (
          <span key={`el-${i}`} className="px-1 text-slate-400 select-none">
            …
          </span>
        ) : (
          <button
            key={n}
            onClick={() => onPage(n)}
            aria-current={n === currentPage ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              n === currentPage
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            {n}
          </button>
        )
      )}

      <button
        onClick={() => onPage(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-slate-50"
      >
        Next
      </button>

      <div className="ml-2 flex items-center gap-1 text-sm">
        <span className="text-slate-600">/ page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="ml-1 rounded-md border border-slate-200 bg-white px-2 py-1"
        >
          {[5, 10, 20, 50].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
