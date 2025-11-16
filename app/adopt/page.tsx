// app/adopt/page.tsx
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import Image from "next/image";
import Link from "next/link";
import SortDropdown from "../../components/SortDropdown"; // client dropdown

export const dynamic = "force-dynamic";

type Pet = {
  id: string;
  name: string;
  species: string | null;
  breed: string | null;
  sex: string | null;
  age: number | null;
  city: string | null;
  photo_url: string | null;
  created_at: string;
  owner_id: string;
  status: string | null;
  expires_at: string | null;
  applications?: { count: number }[] | null;
};

const MAX_ADOPTED_PETS = 3;
const ADOPTED_STATUSES = ["approved", "accepted", "completed", "adopted"];

export default async function AdoptPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = getSupabaseServerClient();

  // Filters
  const q = qp(searchParams, "q");
  const species = qp(searchParams, "species");
  const sort = (qp(searchParams, "sort") || "newest") as "newest" | "oldest";
  const page = Math.max(1, Number(qp(searchParams, "page") || 1));

  // === 6 per page ===
  const pageSize = 6;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Current user (to exclude their own pets from the list)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const myUserId = user?.id || null;

  // 🔒 How many pets has this user already adopted?
  let myAdoptedCount = 0;
  let hasReachedAdoptLimit = false;

  if (myUserId) {
    const { data: adoptedRows } = await supabase
      .from("applications")
      .select("id")
      .eq("user_id", myUserId) // <-- adjust to your adopter column if different
      .in("status", ADOPTED_STATUSES);

    myAdoptedCount = adoptedRows?.length ?? 0;
    hasReachedAdoptLimit = myAdoptedCount >= MAX_ADOPTED_PETS;
  }

  const nowIso = new Date().toISOString();

  // Query pets (+ applicant count)
  let query = supabase
    .from("pets")
    .select(
      "id, name, species, breed, sex, age, city, photo_url, created_at, owner_id, status, expires_at, applications(count)",
      { count: "exact" }
    )
    .neq("status", "adopted")
    .gt("expires_at", nowIso) // <-- ONLY NOT EXPIRED
    .order("created_at", { ascending: sort === "oldest" }) // newest = desc, oldest = asc
    .range(from, to);

  // exclude my own pets
  if (myUserId) query = query.neq("owner_id", myUserId);

  if (species) query = query.eq("species", species.toLowerCase());
  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `name.ilike.${like},city.ilike.${like},breed.ilike.${like}`
    );
  }

  const { data: petsData, count, error } = await query;
  const pets: Pet[] = (petsData as Pet[] | null) ?? [];
  const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header: filter bar */}
      <section className="rounded-3xl border border-black/10 bg-white shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          {/* Left + species pills */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-700">Filters</span>

            <div className="ml-3 flex items-center gap-2 rounded-full bg-white px-1 py-1 ring-1 ring-black/10">
              <SpeciesPillLink label="All" active={!species} q={q} sort={sort} />
              <SpeciesPillLink
                label="Dog"
                value="dog"
                active={species === "dog"}
                q={q}
                sort={sort}
              />
              <SpeciesPillLink
                label="Cat"
                value="cat"
                active={species === "cat"}
                q={q}
                sort={sort}
              />
              <SpeciesPillLink
                label="Other"
                value="other"
                active={species === "other"}
                q={q}
                sort={sort}
              />
            </div>
          </div>

          {/* Right: search + sort */}
          <div className="flex items-center gap-2">
            <SearchInline defaultValue={q || ""} species={species} sort={sort} />
            <SortDropdown species={species} q={q} current={sort} />
          </div>
        </div>
      </section>

      {/* 🔔 Limit notice */}
      {hasReachedAdoptLimit && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You have already adopted{" "}
          <span className="font-semibold">{myAdoptedCount}</span> pets, which is
          the maximum allowed ({MAX_ADOPTED_PETS}). You can still browse pets,
          but you can’t apply for more adoptions unless an adoption is cancelled
          or completed in the system.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          Error loading pets: {error.message}
        </div>
      )}

      {/* Results */}
      {!error &&
        (pets.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {pets.map((p) => {
                const isMine = myUserId && p.owner_id === myUserId;
                const applicants = p.applications?.[0]?.count ?? 0;
                const expiresLabel = remainingLabel(p.expires_at);

                return (
                  <article
                    key={p.id}
                    className={[
                      "overflow-hidden rounded-xl border bg-white shadow-sm transition",
                      "hover:-translate-y-0.5 hover:shadow-md",
                      isMine
                        ? "border-indigo-200 ring-1 ring-indigo-100"
                        : "border-gray-200",
                    ].join(" ")}
                  >
                    {/* Media */}
                    <div className="relative aspect-[4/3] w-full bg-gray-100">
                      {p.photo_url ? (
                        <Image
                          src={p.photo_url}
                          alt={p.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-4xl text-gray-300">
                          🐾
                        </div>
                      )}
                      {isMine && (
                        <span className="absolute left-2 top-2 inline-flex items-center rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          Your pet
                        </span>
                      )}

                      {/* timer badge */}
                      {expiresLabel && (
                        <span className="absolute right-2 top-2 inline-flex items-center rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-rose-600 ring-1 ring-rose-100">
                          {expiresLabel}
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-[15px] font-semibold text-gray-900">
                          {p.name}
                        </h3>

                        {/* Species pill — with icons */}
                        <span className={speciesPill(p.species || "other")}>
                          {speciesIcon((p.species || "other").toLowerCase())}
                          {cap(p.species || "other")}
                        </span>
                      </div>

                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                        {p.breed ? `${p.breed} • ` : ""}
                        {p.sex ? `${cap(p.sex)} • ` : ""}
                        {p.age != null ? `${p.age} yrs • ` : ""}
                        {p.city || "Location not set"}
                      </p>

                      <div className="mt-3 flex items-center justify-between">
                        {/* View & Apply button */}
                        {hasReachedAdoptLimit ? (
                          <button
                            type="button"
                            disabled
                            title="You have reached the maximum of 3 adopted pets."
                            className="inline-flex items-center rounded-full bg-gray-200 px-3.5 py-1.5 text-xs font-semibold text-gray-500 shadow cursor-not-allowed"
                          >
                            Max adopted reached
                          </button>
                        ) : (
                          <Link
                            href={`/pets/${p.id}`}
                            className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:opacity-95 active:scale-[0.98]"
                          >
                            View &amp; Apply
                          </Link>
                        )}

                        <div className="flex flex-col items-end gap-1 text-xs text-gray-600">
                          {isMine && (
                            <span title="Total adoption applications">
                              {applicants} applicant{applicants === 1 ? "" : "s"}
                            </span>
                          )}
                          <span>
                            {new Date(p.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Numbered Pagination */}
            <Pagination
              page={page}
              totalPages={totalPages}
              q={q}
              species={species}
              sort={sort}
            />
          </>
        ))}
    </div>
  );
}

/* ---------------- helpers / ui ---------------- */

function qp(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** how long until it expires */
function remainingLabel(expires_at: string | null) {
  if (!expires_at) return "";
  const now = new Date();
  const exp = new Date(expires_at);
  const diffMs = exp.getTime() - now.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (diffMs <= 0) return "Expired";
  const diffDays = Math.floor(diffMs / oneDay);
  if (diffDays === 0) {
    // show hours
    const diffHours = Math.ceil(diffMs / (60 * 60 * 1000));
    return diffHours <= 1 ? "1 hr left" : `${diffHours} hrs left`;
  }
  if (diffDays === 1) return "1 day left";
  return `${diffDays} days left`;
}

/** pill styles for the species tag on each card */
function speciesPill(s: string) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1";
  switch ((s || "").toLowerCase()) {
    case "dog":
      return `${base} bg-amber-50 text-amber-700 ring-amber-100`;
    case "cat":
      return `${base} bg-indigo-50 text-indigo-700 ring-indigo-100`;
    default:
      return `${base} bg-emerald-50 text-emerald-700 ring-emerald-100`;
  }
}

/** tiny emoji icon for the species pill */
function speciesIcon(s: string) {
  if (s === "dog") return <span className="text-[12px]">🐶</span>;
  if (s === "cat") return <span className="text-[12px]">🐱</span>;
  return <span className="text-[12px]">🐾</span>;
}

/* ─── Top filter bar pieces ─── */

function SpeciesPillLink({
  label,
  value,
  active,
  q,
  sort,
}: {
  label: string;
  value?: "dog" | "cat" | "other";
  active: boolean;
  q?: string;
  sort?: "newest" | "oldest";
}) {
  const params = new URLSearchParams();
  if (value) params.set("species", value);
  if (q) params.set("q", q);
  if (sort) params.set("sort", sort);
  const href = params.toString() ? `/adopt?${params.toString()}` : "/adopt";

  const base =
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 transition";
  const on =
    "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white ring-black/0";
  const off = "bg-white text-gray-700 ring-black/10 hover:bg-gray-50";

  return (
    <Link href={href} className={[base, active ? on : off].join(" ")}>
      {label}
    </Link>
  );
}

function SearchInline({
  defaultValue,
  species,
  sort,
}: {
  defaultValue: string;
  species?: string;
  sort?: "newest" | "oldest";
}) {
  return (
    <form
      className="flex items-center gap-2 rounded-full bg-white px-3 py-1 ring-1 ring-black/10"
      action="/adopt"
    >
      {species ? <input type="hidden" name="species" value={species} /> : null}
      {sort ? <input type="hidden" name="sort" value={sort} /> : null}
      <span className="text-sm">🔍</span>
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="City (e.g., Manila)"
        className="w-56 bg-transparent text-sm outline-none placeholder:text-gray-400"
      />
    </form>
  );
}

function Pagination({
  page,
  totalPages,
  q,
  species,
  sort,
}: {
  page: number;
  totalPages: number;
  q?: string;
  species?: string;
  sort?: "newest" | "oldest";
}) {
  if (totalPages <= 1) return null;

  const paramsFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (species) params.set("species", species);
    if (sort) params.set("sort", sort);
    params.set("page", String(p));
    return `/adopt?${params.toString()}`;
  };

  // Numbered pages with ellipses
  const siblings = 1;
  const pages: (number | "...")[] = [];

  const left = Math.max(2, page - siblings);
  const right = Math.min(totalPages - 1, page + siblings);

  pages.push(1);
  if (left > 2) pages.push("...");
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < totalPages - 1) pages.push("...");
  if (totalPages > 1) pages.push(totalPages);

  const baseBtn =
    "rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 aria-disabled:opacity-50";
  const numBtn =
    "min-w-9 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50";
  const active =
    "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-600 hover:text-white";

  return (
    <div className="mt-6 flex items-center justify-center gap-2">
      <Link
        href={paramsFor(Math.max(1, page - 1))}
        className={baseBtn}
        aria-disabled={page === 1}
      >
        Prev
      </Link>

      {pages.map((p, idx) =>
        p === "..." ? (
          <span key={`dots-${idx}`} className="px-2 text-sm text-gray-500">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={paramsFor(p)}
            aria-current={p === page ? "page" : undefined}
            className={[
              numBtn,
              p === page ? active : "border-gray-300 text-gray-700",
            ].join(" ")}
          >
            {p}
          </Link>
        )
      )}

      <Link
        href={paramsFor(Math.min(totalPages, page + 1))}
        className={baseBtn}
        aria-disabled={page === totalPages}
      >
        Next
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-gray-50 text-2xl">
        🐶
      </div>
      <h3 className="text-lg font-medium text-gray-900">No pets found</h3>
      <p className="mt-1 text-gray-600">
        Try clearing filters or searching a different term.
      </p>
      <div className="mt-4">
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          List your pet
        </Link>
      </div>
    </div>
  );
}
