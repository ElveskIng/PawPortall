// app/admin/printable-income/PrintableIncomeClient.tsx
"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";

type PaymentRow = {
  id: string;
  created_at: string;
  amount: number;
  reference: string | null;
  user_id: string | null;
  status: string | null;
  user_email: string; // fallback
  user_name?: string | null; // from profiles
};

export default function PrintableIncomeClient({
  initialRows,
  errorMsg,
}: {
  initialRows: PaymentRow[];
  errorMsg?: string;
}) {
  const [rows, setRows] = useState<PaymentRow[]>(initialRows);
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // fixed timestamp para sa report header
  const generatedAtIso = useMemo(() => new Date().toISOString(), []);

  /* ───────── Filter by date range ───────── */
  const filteredRows = useMemo(() => {
    if (!startDate && !endDate) return rows; // walang filter

    return rows.filter((r) => {
      const d = new Date(r.created_at);
      if (Number.isNaN(d.getTime())) return false;

      if (startDate) {
        const s = new Date(startDate);
        s.setHours(0, 0, 0, 0);
        if (d < s) return false;
      }

      if (endDate) {
        const e = new Date(endDate);
        e.setHours(23, 59, 59, 999);
        if (d > e) return false;
      }

      return true;
    });
  }, [rows, startDate, endDate]);

  /* ───────── Totals ───────── */
  const totals = useMemo(() => {
    let amount = 0;
    let credits = 0;
    for (const r of filteredRows) {
      const amt = Number(r.amount || 0);
      amount += amt;
      // sample credits formula lang, same as before
      credits += Math.min(Math.max(0, Math.floor(amt / 20)), 5);
    }
    return { amount, credits, count: filteredRows.length };
  }, [filteredRows]);

  /* ───────── Formatting helpers ───────── */
  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("en-PH", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatPrintDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleString("en-PH", {
      year: "numeric",
      month: "long",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const periodLabel = useMemo(() => {
    const hasStart = !!startDate;
    const hasEnd = !!endDate;

    const fmt = (value: string) =>
      new Date(value).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });

    if (!hasStart && !hasEnd) return "All records";
    if (hasStart && hasEnd) return `${fmt(startDate)} – ${fmt(endDate)}`;
    if (hasStart) return `From ${fmt(startDate)}`;
    return `Up to ${fmt(endDate!)}`;
  }, [startDate, endDate]);

  /* ───────── Actions ───────── */
  function handlePrint() {
    window.print();
  }

  function handleReload() {
    setLoading(true);
    setRows(initialRows);
    setStartDate("");
    setEndDate("");
    setTimeout(() => setLoading(false), 150);
  }

  return (
    <div className="p-8 space-y-6">
      {/* PRINT CSS */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-report,
          .printable-report * {
            visibility: visible;
          }
          .printable-report {
            position: absolute;
            inset: 0;
            margin: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* HEADER (screen only) */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 no-print">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            PawPortal — Ethical Pet Adoption Bridge
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            PawPortal Income Report
          </h1>
          <p className="text-sm text-gray-500">
            Approved Payments Summary ({periodLabel})
          </p>
        </div>

        {/* START / END DATE CONTROLS */}
        <div className="flex flex-col sm:flex-row gap-3 md:items-center">
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex flex-col text-xs font-medium text-gray-600">
              <span className="mb-1">Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="flex flex-col text-xs font-medium text-gray-600">
              <span className="mb-1">End date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded-md px-3 py-1.5 text-sm bg-white"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
            className="text-xs sm:text-sm px-3 py-1.5 border rounded-md hover:bg-gray-100"
          >
            Clear range
          </button>
        </div>
      </div>

      {/* PRINTABLE CARD */}
      <div className="printable-report bg-white rounded-xl shadow-sm border px-8 py-6">
        <header className="border-b pb-4 mb-4">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                PawPortal Income Report
              </h2>
              <p className="text-xs text-gray-500">
                Approved payments summary ({periodLabel})
              </p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>Generated by: PawPortal Admin</p>
              <p>Date: {formatPrintDate(generatedAtIso)}</p>
            </div>
          </div>
        </header>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="border rounded-lg p-4 text-center bg-gray-50/40">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Total Approved Amount
            </p>
            <p className="text-2xl font-semibold mt-1">
              ₱
              {totals.amount.toLocaleString("en-PH", {
                minimumFractionDigits: 2,
              })}
            </p>
          </div>
          <div className="border rounded-lg p-4 text-center bg-gray-50/40">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Approved Payments
            </p>
            <p className="text-2xl font-semibold mt-1">{totals.count}</p>
          </div>
          <div className="border rounded-lg p-4 text-center bg-gray-50/40">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Total Credits
            </p>
            <p className="text-2xl font-semibold mt-1">{totals.credits}</p>
          </div>
        </div>

        {errorMsg ? (
          <p className="text-sm text-red-600 mb-4">
            Error loading payments: {errorMsg}
          </p>
        ) : null}

        {/* TABLE */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">
                  Date &amp; Time
                </th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">
                  User
                </th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">
                  Email / ID
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-700">
                  Amount (₱)
                </th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">
                  Reference
                </th>
                <th className="px-3 py-2 text-left font-semibold text-gray-700">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-4 text-center text-gray-500 text-sm"
                  >
                    Loading…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-4 text-center text-gray-500 text-sm"
                  >
                    No approved payments found for this range.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.user_name || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.user_email}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.amount.toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.reference || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.status || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-gray-400 mt-6">
          Prepared via PawPortal Admin • {formatPrintDate(generatedAtIso)}
        </p>

        {/* BUTTONS (screen only) */}
        <div className="flex justify-end gap-2 mt-6 no-print">
          <button
            onClick={handleReload}
            className="flex items-center gap-1 px-4 py-2 text-sm border rounded-md hover:bg-gray-100"
          >
            <RefreshCw className="w-4 h-4" />
            Reload
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1 px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-black/90"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
