// app/admin/page.tsx
import KpiCard from "@/components/admin/KpiCard";
import ChartCard from "@/components/admin/ChartCard";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

/* =========================
   Types
   ========================= */
type Kpis = {
  total_pets: number;
  available_pets: number;
  pending_apps: number;
  approval_rate: number; // 0–100
  total_users: number;
};

type WeeklyPointUsers = { week: string; users: number };
type WeeklyPointApproved = { week: string; count: number };
type DailyPoint = { day: string; value: number };

type BreedsBarDatum = { label: string; value: number };

/* =========================
   Constants
   ========================= */
const APPROVED_STATUSES = ["approved", "Approved", "accepted", "completed", "adopted"];
const WEEKS_TO_FETCH = 60;
const TZ = "UTC";
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* =========================
   Helpers
   ========================= */
function getIsoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function mondayOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  return monday;
}

function parseIsoWeekLabel(label: string): Date {
  const [y, w] = label.split("-W").map(Number);
  return mondayOfIsoWeek(y, w);
}

function toMonthLabelFromDate(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthStartEnd(monthStr?: string): { start: Date; end: Date } {
  const now = new Date();
  const [y, m] = (monthStr || toMonthLabelFromDate(now)).split("-").map(Number);
  const start = new Date(Date.UTC(y, (m || 1) - 1, 1));
  const end = new Date(Date.UTC(y, (m || 1), 1));
  return { start, end };
}

function buildDailyLabels(start: Date, end: Date): string[] {
  const labels: string[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    const mm = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getUTCDate()).padStart(2, "0");
    labels.push(`${mm}-${dd}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return labels;
}

function dayOfWeekIndexUTC(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

function weekOptionsForMonth(monthStart: Date, monthEnd: Date): string[] {
  const set = new Set<string>();
  const cur = new Date(monthStart);
  while (cur < monthEnd) {
    set.add(getIsoWeekLabel(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return Array.from(set.values());
}

/** Convert top-breeds data to chart-friendly rows. */
function buildBreedsBarData(raw: any[]): BreedsBarDatum[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === "object" && raw[0] !== null && "breed" in raw[0]) {
    return raw
      .map((r: any) => ({ label: String(r.breed ?? "Unknown"), value: Number(r.count ?? 0) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }
  const counts = new Map<string, number>();
  for (const item of raw) {
    const key = String(item ?? "Unknown");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/* =========================
   Data Fetcher
   ========================= */
async function fetchDashboard(
  period: "weekly" | "monthly",
  selectedMonth?: string,
  selectedWeekLabel?: string
) {
  const supabase = getSupabaseServerClient();

  // Month window & daily labels (for monthly chart)
  const { start: monthStart, end: monthEnd } = monthStartEnd(selectedMonth);
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const monthEndStr = monthEnd.toISOString().slice(0, 10);
  const dailyLabelsMonth = buildDailyLabels(monthStart, monthEnd);

  // 60-week rolling window & oldest Monday
  const { labels: allWeekLabels, oldestMonday } = (() => {
    const todayUTC = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
    );
    const day = todayUTC.getUTCDay() || 7;
    if (day !== 1) todayUTC.setUTCDate(todayUTC.getUTCDate() - (day - 1));
    const labels: string[] = [];
    for (let i = WEEKS_TO_FETCH - 1; i >= 0; i--) {
      const d = new Date(todayUTC);
      d.setUTCDate(todayUTC.getUTCDate() - i * 7);
      labels.push(getIsoWeekLabel(d));
    }
    const oldest = new Date(todayUTC);
    oldest.setUTCDate(todayUTC.getUTCDate() - (WEEKS_TO_FETCH - 1) * 7);
    return { labels, oldestMonday: oldest };
  })();

  // Weekly selection for chosen month
  const weekOptions = weekOptionsForMonth(monthStart, monthEnd);
  const effectiveWeekLabel =
    selectedWeekLabel && weekOptions.includes(selectedWeekLabel)
      ? selectedWeekLabel
      : weekOptions.length > 0
      ? weekOptions[weekOptions.length - 1]
      : getIsoWeekLabel(new Date());

  const weekStartDate = parseIsoWeekLabel(effectiveWeekLabel);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 7);
  const weekStartStr = weekStartDate.toISOString().slice(0, 10);
  const weekEndStr = weekEndDate.toISOString().slice(0, 10);

  const [
    kpiRes,
    weeklyUsersRes, // legacy weekly points
    breedsRpcRes,
    approvedSinceOldestRes,
    dailyUsersMonthRes,
    dailyApprovedMonthRawRes,
    approvedDistinctRes,
    // day-of-week series for selected week
    dailyUsersWeekRes,
    dailyApprovedWeekRawRes,
    // NEW: counts from payment_proofs
    approvedCountRes,
    rejectedCountRes,
  ] = await Promise.all([
    supabase
      .rpc("admin_dashboard_kpis_users", {
        available_keys: ["available", "active", "open", "listed", "live"],
        blocked_pet_keys: [
          "adopted",
          "reserved",
          "archived",
          "unavailable",
          "closed",
          "inactive",
          "hidden",
          "deleted",
        ],
        approved_app_keys: ["approved", "accepted", "completed", "adopted"],
        rejected_app_keys: [
          "rejected",
          "declined",
          "denied",
          "cancelled",
          "canceled",
          "withdrawn",
          "failed",
          "closed",
        ],
      })
      .single(),

    supabase.rpc("admin_chart_weekly_users2", { _weeks: WEEKS_TO_FETCH, _tz: TZ }),
    supabase.rpc("admin_chart_top_breeds2", { _limit: 10 }),

    supabase
      .from("applications")
      .select("created_at,status")
      .in("status", APPROVED_STATUSES)
      .gte("created_at", oldestMonday.toISOString()),

    supabase.rpc("admin_chart_daily_users", { _start: monthStartStr, _end: monthEndStr, _tz: TZ }),

    supabase
      .from("applications")
      .select("created_at,status")
      .in("status", APPROVED_STATUSES)
      .gte("created_at", monthStart.toISOString())
      .lt("created_at", monthEnd.toISOString()),

    supabase.rpc("admin_count_approved_pets_distinct"),

    supabase.rpc("admin_chart_daily_users", { _start: weekStartStr, _end: weekEndStr, _tz: TZ }),

    supabase
      .from("applications")
      .select("created_at,status")
      .in("status", APPROVED_STATUSES)
      .gte("created_at", weekStartDate.toISOString())
      .lt("created_at", weekEndDate.toISOString()),

    // ✅ counts based on payment_proofs (status = approved / rejected)
    supabase
      .from("payment_proofs")
      .select("id", { head: true, count: "exact" })
      .in("status", ["approved"]),
    supabase
      .from("payment_proofs")
      .select("id", { head: true, count: "exact" })
      .in("status", ["rejected"]),
  ]);

  /* ----- KPIs ----- */
  const baseKpis: Kpis =
    (kpiRes.data as Kpis) ?? {
      total_pets: 0,
      available_pets: 0,
      pending_apps: 0,
      approval_rate: 0,
      total_users: 0,
    };

  // Distinct approved pets (all-time)
  const approvedDistinct = Number((approvedDistinctRes as any)?.data) || 0;

  // ✅ Recompute totals to EXCLUDE adopted pets
  const totalPetsExcludingAdopted = Math.max(0, (baseKpis.total_pets || 0) - approvedDistinct);

  // Keep available as non-adopted (safe, consistent)
  const computedAvailable = Math.max(0, totalPetsExcludingAdopted);

  // ✅ Compute approval metrics from payment_proofs
  const approvedApplicationsTotal = (approvedCountRes as any)?.count ?? 0;
  const rejectedApplicationsTotal = (rejectedCountRes as any)?.count ?? 0;
  const totalDecisions = approvedApplicationsTotal + rejectedApplicationsTotal;
  const approvalRateFromProofs =
    totalDecisions === 0 ? 0 : Math.round((approvedApplicationsTotal / totalDecisions) * 100);

  // overwrite KPIs
  const kpis: Kpis = {
    ...baseKpis,
    total_pets: totalPetsExcludingAdopted,
    available_pets: computedAvailable,
    approval_rate: approvalRateFromProofs || baseKpis.approval_rate || 0,
  };

  /* ----- Legacy weekly users (keep last 12 for continuity) ----- */
  const weeklyAllUsers: WeeklyPointUsers[] = Array.isArray(weeklyUsersRes.data)
    ? (weeklyUsersRes.data as WeeklyPointUsers[])
    : [];

  const last12WeekLabels = allWeekLabels.slice(-12);
  const weeklyUsersMap = new Map<string, number>(last12WeekLabels.map((w) => [w, 0]));
  for (const p of weeklyAllUsers) {
    if (weeklyUsersMap.has(p.week)) weeklyUsersMap.set(p.week, p.users);
  }
  const weeklyUsers: WeeklyPointUsers[] = last12WeekLabels.map((w) => ({
    week: w,
    users: weeklyUsersMap.get(w) || 0,
  }));

  /* ----- Legacy weekly approved counts (by ISO week) ----- */
  const approvedWeeklyMap = new Map<string, number>(last12WeekLabels.map((w) => [w, 0]));
  if (!approvedSinceOldestRes.error && Array.isArray(approvedSinceOldestRes.data)) {
    for (const row of approvedSinceOldestRes.data as { created_at: string }[]) {
      const label = getIsoWeekLabel(new Date(row.created_at));
      if (approvedWeeklyMap.has(label)) {
        approvedWeeklyMap.set(label, (approvedWeeklyMap.get(label) || 0) + 1);
      }
    }
  }
  const approvedWeekly: WeeklyPointApproved[] = last12WeekLabels.map((w) => ({
    week: w,
    count: approvedWeeklyMap.get(w) || 0,
  }));

  /* ----- Monthly daily users ----- */
  const dailyUsersMonth: DailyPoint[] = Array.isArray(dailyUsersMonthRes.data)
    ? (dailyUsersMonthRes.data as { day: string; users: number }[]).map((r) => {
        const d = new Date(r.day);
        const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(d.getUTCDate()).padStart(2, "0");
        return { day: `${mm}-${dd}`, value: r.users || 0 };
      })
    : dailyLabelsMonth.map((l) => ({ day: l, value: 0 }));

  /* ----- Monthly daily approved counts ----- */
  const dailyApprovedMonthMap = new Map<string, number>(dailyLabelsMonth.map((l) => [l, 0]));
  if (!dailyApprovedMonthRawRes.error && Array.isArray(dailyApprovedMonthRawRes.data)) {
    for (const row of dailyApprovedMonthRawRes.data as { created_at: string }[]) {
      const d = new Date(row.created_at);
      const label = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate()
      ).padStart(2, "0")}`;
      if (dailyApprovedMonthMap.has(label)) {
        dailyApprovedMonthMap.set(label, (dailyApprovedMonthMap.get(label) || 0) + 1);
      }
    }
  }
  const dailyApprovedMonth: DailyPoint[] = dailyLabelsMonth.map((l) => ({
    day: l,
    value: dailyApprovedMonthMap.get(l) || 0,
  }));

  /* ----- Weekly (Mon–Sun) day-of-week series ----- */
  const dailyUsersWeek = (() => {
    const arr = new Array<number>(7).fill(0);
    if (Array.isArray(dailyUsersWeekRes.data)) {
      for (const r of dailyUsersWeekRes.data as { day: string; users: number }[]) {
        const d = new Date(r.day);
        const idx = dayOfWeekIndexUTC(d);
        arr[idx] = (arr[idx] || 0) + (r.users || 0);
      }
    }
    return DOW_LABELS.map((lab, i) => ({ week: lab, users: arr[i] || 0 }));
  })();

  const dailyApprovedWeek = (() => {
    const arr = new Array<number>(7).fill(0);
    if (!dailyApprovedWeekRawRes.error && Array.isArray(dailyApprovedWeekRawRes.data)) {
      for (const row of dailyApprovedWeekRawRes.data as { created_at: string }[]) {
        const d = new Date(row.created_at);
        const idx = dayOfWeekIndexUTC(d);
        arr[idx] = (arr[idx] || 0) + 1;
      }
    }
    return DOW_LABELS.map((lab, i) => ({ week: lab, count: arr[i] || 0 }));
  })();

  /* ----- Top breeds with fallback ----- */
  let rawBreeds = (breedsRpcRes.data as any[]) ?? [];
  if (!rawBreeds.length) {
    const petsBreedsRes = await supabase.from("pets").select("breed");
    const petBreeds = (petsBreedsRes.data ?? [])
      .map((r: any) => r.breed)
      .filter((b: any) => typeof b === "string" && b.trim().length > 0);
    rawBreeds = petBreeds;
  }

  return {
    kpis,
    weeklyUsers,
    approvedWeekly,
    dailyUsersMonth,
    dailyApprovedMonth,
    weekOptions,
    effectiveWeekLabel,
    dailyUsersWeek,
    dailyApprovedWeek,
    topBreedsRaw: rawBreeds,
    approvedDistinct, // still available if you need it elsewhere
    approvedApplicationsTotal, // ✅ KPI for Approved Applications
  };
}

/* =========================
   Page
   ========================= */
export default async function AdminDashboard({
  searchParams,
}: {
  searchParams?: { period?: string; month?: string; week?: string };
}) {
  const periodParam = (searchParams?.period || "weekly").toLowerCase();
  const period: "weekly" | "monthly" = periodParam === "monthly" ? "monthly" : "weekly";
  const selectedMonth = searchParams?.month;
  const selectedWeek = searchParams?.week;

  const {
    kpis,
    dailyUsersMonth,
    dailyApprovedMonth,
    weekOptions,
    effectiveWeekLabel,
    dailyUsersWeek,
    dailyApprovedWeek,
    topBreedsRaw,
    approvedApplicationsTotal,
  } = await fetchDashboard(period, selectedMonth, selectedWeek);

  // Month dropdown (last 18 months)
  const now = new Date();
  const monthOptions: string[] = Array.from({ length: 18 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    d.setUTCMonth(d.getUTCMonth() - (17 - i));
    return toMonthLabelFromDate(d);
  });

  // Series by period
  const usersSeries =
    period === "monthly"
      ? dailyUsersMonth.map((p) => ({ week: p.day, users: p.value }))
      : dailyUsersWeek;

  const approvedSeries =
    period === "monthly"
      ? dailyApprovedMonth.map((p) => ({ week: p.day, count: p.value }))
      : dailyApprovedWeek;

  const usersTotal = usersSeries.reduce((s, p) => s + (p as any).users, 0);
  const approvedTotal = approvedSeries.reduce((s, p) => s + (p as any).count, 0);

  const usersTitle =
    (period === "monthly" ? "Daily New Users (MM-DD)" : "Daily New Users (Mon–Sun)") +
    ` • Total: ${usersTotal}`;

  const approvedTitle =
    (period === "monthly" ? "Approved Pets (Daily Count)" : "Approved Pets (Mon–Sun)") +
    ` • Total: ${approvedTotal}`;

  const points = usersSeries.length;
  const minWidth = Math.max(points * (period === "monthly" ? 48 : 120), 720);

  const renderScrollableChart = (
    title: string,
    data: any[],
    xKey: "week",
    yKey: "users" | "count",
    width: number
  ) => (
    <div className="overflow-x-auto">
      <div style={{ minWidth: width }}>
        <ChartCard title={title} kind="line" data={data} xKey={xKey} yKey={yKey} />
      </div>
    </div>
  );

  const topBreedsBar = buildBreedsBarData(topBreedsRaw).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* KPIs (Total Users removed; Total Pets excludes adopted) */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard title="Total Pets" value={kpis.total_pets} />
        <KpiCard title="Available Pets" value={kpis.available_pets} />
        <KpiCard title="Pending Applications" value={kpis.pending_apps} />
        <KpiCard title="Approval Rate" value={`${kpis.approval_rate}%`} />
        <KpiCard title="Approved Applications" value={approvedApplicationsTotal} />
      </div>

      {/* Filters */}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <label htmlFor="period" className="text-sm text-white/70">
          View:
        </label>
        <select
          id="period"
          name="period"
          defaultValue={period}
          className="bg-transparent border border-white/10 rounded-md px-2 py-1 text-sm"
        >
          <option value="weekly">Weekly (days of week)</option>
          <option value="monthly">Monthly (daily points)</option>
        </select>

        {/* monthly */}
        {period === "monthly" && (
          <>
            <label htmlFor="month" className="text-sm text-white/70 ml-2">
              Month:
            </label>
            <select
              id="month"
              name="month"
              defaultValue={selectedMonth || toMonthLabelFromDate(new Date())}
              className="bg-transparent border border-white/10 rounded-md px-2 py-1 text-sm"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </>
        )}

        {/* weekly */}
        {period === "weekly" && (
          <>
            <label htmlFor="month" className="text-sm text-white/70 ml-2">
              Month:
            </label>
            <select
              id="month"
              name="month"
              defaultValue={selectedMonth || toMonthLabelFromDate(new Date())}
              className="bg-transparent border border-white/10 rounded-md px-2 py-1 text-sm"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <label htmlFor="week" className="text-sm text-white/70 ml-2">
              Week:
            </label>
            <select
              id="week"
              name="week"
              defaultValue={effectiveWeekLabel}
              className="bg-transparent border border-white/10 rounded-md px-2 py-1 text-sm"
            >
              {weekOptions.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </>
        )}

        <button
          type="submit"
          className="ml-2 text-sm px-3 py-1 rounded-md border border-white/10 hover:bg-white/5"
        >
          Apply
        </button>
      </form>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        {renderScrollableChart(usersTitle, usersSeries as any[], "week", "users", minWidth)}
        {renderScrollableChart(approvedTitle, approvedSeries as any[], "week", "count", minWidth)}
      </div>

      {/* Top Breeds */}
      <ChartCard title="Top Breeds Searched" kind="bar" data={topBreedsBar} xKey="label" yKey="value" />
    </div>
  );
}
