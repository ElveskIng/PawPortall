// app/dashboard/page.tsx
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect";
import DeletePetButton from "@/components/DeletePetButton";
import MessagesDrawer from "@/components/chat/MessagesDrawer";
import AddFivePhotos from "@/components/PhotoUploadFive";
import MarkAdoptedButton from "@/components/MarkAdoptedButton";
import NextDynamic from "next/dynamic";
import AddPetCareDialog from "@/components/AddPetCareDialog";

export const dynamic = "force-dynamic";

const AddPetPaymentBlock = NextDynamic(
  () => import("@/components/payments/AddPetPaymentBlock"),
  { ssr: false }
);

// 🔒 Max adopted pets per user
const MAX_ADOPTED_PETS = 3;
const ADOPTED_STATUSES = ["approved", "accepted", "completed", "adopted"];

/* ───────── types ───────── */
type AppRow = {
  id: string;
  pet_id: string;
  status: "pending" | "approved" | "rejected" | string;
  message?: string | null;
  created_at: string;
  pets?: {
    id?: string;
    name?: string | null;
    photo_url?: string | null;
    owner_id?: string | null;
    status?: string | null;
  } | null;
};
type PetApplicationRow = { status: string | null };
type MyPet = {
  id: string;
  name: string;
  photo_url: string | null;
  created_at: string;
  status: string | null;
  expires_at?: string | null;
  applications?: PetApplicationRow[] | null;
  care_title?: string | null;
  care_feeding?: string | null;
  care_exercise?: string | null;
  care_grooming?: string | null;
  care_notes?: string | null;
  care_env?: string | null;
  care_adopter?: string | null;
  adoption_method?: string | null;
  vaccinated?: boolean | null;
  vaccine_proof_url?: string | null;
};

/* ───────── actions (NOT exported – para happy si Vercel) ───────── */
async function deletePet(formData: FormData) {
  "use server";
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const petId = (formData.get("pet_id") || "").toString();
  const returnTo = (formData.get("returnTo") || "/dashboard").toString();

  if (!user || !petId) redirect(returnTo);

  await supabase.from("pets").delete().eq("id", petId).eq("owner_id", user.id);

  revalidatePath("/adopt");
  revalidatePath("/dashboard");
  redirect(returnTo);
}

async function deleteMyApplication(formData: FormData) {
  "use server";
  const applicationId = (formData.get("application_id") || "").toString();
  if (!applicationId)
    redirect(
      "/dashboard?error=" + encodeURIComponent("Missing application id.")
    );

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/sign-in?next=/dashboard");

  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("id, applicant_id, status")
    .eq("id", applicationId)
    .single();

  if (fetchErr || !app) {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent(fetchErr?.message || "Application not found.")
    );
  }
  if (app.applicant_id !== user.id) {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent("Not allowed to delete this application.")
    );
  }
  if ((app.status || "").toLowerCase() !== "rejected") {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent("Only rejected applications can be removed.")
    );
  }

  const { error: delErr } = await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .eq("applicant_id", user.id);

  if (delErr) {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent("Delete failed: " + delErr.message)
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?success=" + encodeURIComponent("Application removed."));
}

async function cancelMyPendingApplication(formData: FormData) {
  "use server";
  const applicationId = (formData.get("application_id") || "").toString();
  if (!applicationId)
    redirect(
      "/dashboard?error=" + encodeURIComponent("Missing application id.")
    );

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/sign-in?next=/dashboard");

  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("id, applicant_id, status")
    .eq("id", applicationId)
    .single();

  if (fetchErr || !app) {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent(fetchErr?.message || "Application not found.")
    );
  }
  if (app.applicant_id !== user.id) {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent("Not allowed to cancel this application.")
    );
  }
  if ((app.status || "").toLowerCase() !== "pending") {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent("Only pending applications can be cancelled.")
    );
  }

  const { error: delErr } = await supabase
    .from("applications")
    .delete()
    .eq("id", applicationId)
    .eq("applicant_id", user.id);

  if (delErr) {
    redirect(
      "/dashboard?error=" +
        encodeURIComponent("Cancel failed: " + delErr.message)
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?success=" + encodeURIComponent("Application cancelled."));
}

/* ───────── page ───────── */
export default async function Dashboard({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = getSupabaseServerClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) redirect("/sign-in?error=" + encodeURIComponent(userErr.message));
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const listingCredits = Number(profile?.listing_credits || 0);

  const { data: appsRaw } = await supabase
    .from("applications")
    .select(
      "id, pet_id, status, message, created_at, pets(id, name, photo_url, owner_id, status)"
    )
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false });

  const applications: AppRow[] = (appsRaw as AppRow[] | null) ?? [];

  // 🔢 How many pets has this user already adopted?
  const adoptedCount = applications.filter((a) => {
    const appStatus = (a.status || "").toLowerCase();
    const petStatus = (a.pets?.status || "").toLowerCase();
    return (
      ADOPTED_STATUSES.includes(appStatus) || petStatus === "adopted"
    );
  }).length;

  const { data: myPetsRaw, error: petsErr } = await supabase
    .from("pets")
    .select(
      "id, name, photo_url, created_at, status, expires_at, applications(status), care_title, care_feeding, care_exercise, care_grooming, care_notes, care_env, care_adopter, adoption_method, vaccinated, vaccine_proof_url"
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  const myPets: MyPet[] = (myPetsRaw as MyPet[] | null) ?? [];

  function effectivePetStatus(
    p: MyPet
  ): "adopted" | "approved" | "rejected" | "pending" | "expired" {
    if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) {
      return "expired";
    }

    const ps = (p.status || "").toLowerCase();
    if (ps === "adopted") return "adopted";
    const hasApproved =
      (p.applications ?? []).some(
        (a) => (a.status || "").toLowerCase() === "approved"
      ) || ps === "approved";
    if (hasApproved) return "approved";
    const hasRejected =
      (p.applications ?? []).some(
        (a) => (a.status || "").toLowerCase() === "rejected"
      ) || ps === "rejected";
    return hasRejected ? "rejected" : "pending";
  }

  const petsWithEffective = myPets.map((p) => ({
    ...p,
    _effective: effectivePetStatus(p),
  }));

  const totals = {
    total: petsWithEffective.length,
    pending: petsWithEffective.filter((p) => p._effective === "pending").length,
    approved: petsWithEffective.filter((p) => p._effective === "approved")
      .length,
    rejected: petsWithEffective.filter((p) => p._effective === "rejected")
      .length,
  };

  const firstName = (profile?.full_name || user.email || "Adopter").split(
    " "
  )[0];

  const cityFromProfile =
    (profile as any)?.full_address ||
    extractAddressFromBio(profile?.bio || "") ||
    "";
  const ownerFullName = profile?.full_name ?? "";
  const ownerPhone = profile?.phone ?? "";

  /* ───── server action: create pet (inside page, ok to keep) ───── */
  async function createPet(formData: FormData) {
    "use server";
    const supabase = getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/sign-in");

    try {
      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("listing_credits")
        .eq("id", user.id)
        .single();

      if (meErr) {
        redirect(
          "/dashboard?error=" +
            encodeURIComponent("Failed to check credits: " + meErr.message)
        );
      }
      const credits = Number(me?.listing_credits ?? 0);
      if (credits < 1) {
        redirect(
          "/dashboard?error=" +
            encodeURIComponent("You don’t have any listing credit yet.")
        );
      }

      const name = (formData.get("name") || "").toString().trim();
      const species = (formData.get("species") || "").toString().trim();
      const breed = (formData.get("breed") || "").toString().trim();
      const sex = (formData.get("sex") || "").toString().trim();

      const ageValueRaw = (formData.get("age_value") || "").toString().trim();
      const ageUnitRaw = (formData.get("age_unit") || "years")
        .toString()
        .toLowerCase();
      let age: number | null = null;
      if (ageValueRaw !== "") {
        const v = Number(ageValueRaw);
        if (!Number.isNaN(v)) {
          age = ageUnitRaw === "months" ? Math.round((v / 12) * 100) / 100 : v;
        }
      }

      const city = (formData.get("city") || "").toString().trim();
      const description = (formData.get("description") || "")
        .toString()
        .trim();

      const owner_full_name = (formData.get("owner_full_name") || "")
        .toString()
        .trim();
      const owner_phone = (formData.get("owner_phone") || "")
        .toString()
        .trim();

      const adoption_method = (formData.get("adoption_method") || "")
        .toString()
        .trim();

      const vaccinatedStr = (formData.get("vaccinated") || "")
        .toString()
        .toLowerCase();
      const vaccinated =
        vaccinatedStr === "yes" || vaccinatedStr === "true" ? true : false;

      const care_title = (formData.get("care_title") || "").toString().trim();
      const care_feeding = (formData.get("care_feeding") || "")
        .toString()
        .trim();
      const care_exercise = (formData.get("care_exercise") || "")
        .toString()
        .trim();
      const care_grooming = (formData.get("care_grooming") || "")
        .toString()
        .trim();
      const care_notes = (formData.get("care_notes") || "").toString().trim();
      const care_env = (formData.get("care_env") || "").toString().trim();
      const care_adopter = (formData.get("care_adopter") || "")
        .toString()
        .trim();

      const files = formData.getAll("photos").filter(Boolean) as File[];
      const vaccineFile = formData.get("vaccine_proof") as File | null;

      if (!name || !species) {
        redirect(
          "/dashboard?error=" +
            encodeURIComponent("Name and Species are required.")
        );
      }
      if (files.length !== 5) {
        redirect(
          "/dashboard?error=" +
            encodeURIComponent(
              `Please upload exactly 5 images (you have ${files.length}).`
            )
        );
      }

      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      const publicUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext =
          file.name.split(".").pop()?.toLowerCase().replace(/[^\w]/g, "") ||
          "jpg";
        const path = `${user.id}/${randomUUID()}_${i}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from("pet-photos")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: true,
            contentType: file.type || "image/jpeg",
          });

        if (uploadErr) {
          redirect(
            "/dashboard?error=" +
              encodeURIComponent(`Upload failed: ${uploadErr.message}`)
          );
        }
        const { data: pub } = supabase.storage
          .from("pet-photos")
          .getPublicUrl(path);
        publicUrls.push(pub?.publicUrl ?? "");
      }

      let vaccine_proof_url: string | null = null;
      if (vaccineFile && typeof vaccineFile.name === "string") {
        const ext =
          vaccineFile.name
            .split(".")
            .pop()
            ?.toLowerCase()
            .replace(/[^\w]/g, "") || "jpg";
        const path = `${user.id}/vaccine_${randomUUID()}.${ext}`;
        const { error: upVaxErr } = await supabase.storage
          .from("pet-photos")
          .upload(path, vaccineFile, {
            cacheControl: "3600",
            upsert: true,
            contentType: vaccineFile.type || "image/jpeg",
          });
        if (!upVaxErr) {
          const { data: pubVax } = supabase.storage
            .from("pet-photos")
            .getPublicUrl(path);
          vaccine_proof_url = pubVax?.publicUrl ?? null;
        }
      }

      const { data: petRow, error: insertErr } = await supabase
        .from("pets")
        .insert({
          name,
          species: species.toLowerCase(),
          breed,
          sex: sex ? sex.toLowerCase() : null,
          age,
          city,
          description,
          photo_url: publicUrls[0] || null,
          owner_id: user.id,
          status: "pending",
          owner_full_name: owner_full_name || null,
          owner_phone: owner_phone || null,
          adoption_method: adoption_method || null,
          vaccinated,
          vaccine_proof_url,
          care_title,
          care_feeding,
          care_exercise,
          care_grooming,
          care_notes,
          care_env,
          care_adopter,
          expires_at: expiresAt,
        })
        .select("id")
        .single();

      if (insertErr) {
        redirect(
          "/dashboard?error=" +
            encodeURIComponent(`Save failed: ${insertErr.message}`)
        );
      }

      try {
        if (petRow?.id && publicUrls.length > 0) {
          await supabase.from("pet_photos").insert(
            publicUrls.map((url, index) => ({
              pet_id: petRow.id,
              path: url,
              is_primary: index === 0,
              order_index: index,
            }))
          );
        }
      } catch {}

      const nextCredits = Math.max(0, credits - 1);
      const { error: decErr } = await supabase
        .from("profiles")
        .update({ listing_credits: nextCredits })
        .eq("id", user.id);
      if (decErr) {
        redirect(
          "/dashboard?success=" +
            encodeURIComponent(
              "Pet saved, but credits were not updated. Please refresh or contact admin."
            ) +
            "&warn=" +
            encodeURIComponent(decErr.message)
        );
      }

      revalidatePath("/adopt");
      revalidatePath("/dashboard");
      const ts = Date.now().toString();
      redirect(`/dashboard?success=${encodeURIComponent("Pet saved.")}&ts=${ts}`);
    } catch (e: any) {
      if (isRedirectError(e)) throw e;
      redirect(
        "/dashboard?error=" + encodeURIComponent(String(e?.message || e))
      );
    }
  }

  const errorMsg = qp(searchParams, "error");
  const successMsg = qp(searchParams, "success");
  const warnMsg = qp(searchParams, "warn");
  const ts = qp(searchParams, "ts");
  const confirmDelApp = qp(searchParams, "confirmDelApp");
  const confirmCancelApp = qp(searchParams, "confirmCancelApp");

  const view: "pets" | "applications" =
    qp(searchParams, "view") === "applications" ? "applications" : "pets";

  return (
    <div className="space-y-8">
      {/* welcome card */}
      <HeroHeader
        name={firstName}
        totals={totals}
        credits={listingCredits}
        adoptedCount={adoptedCount}
      />

      {errorMsg && <Callout tone="rose" title={decodeURIComponent(errorMsg)} />}
      {petsErr && (
        <Callout tone="rose" title={`Pets load error: ${petsErr.message}`} />
      )}
      {successMsg && (
        <Callout
          tone="emerald"
          title={decodeURIComponent(successMsg)}
          subtitle={warnMsg ? decodeURIComponent(warnMsg) : undefined}
        />
      )}

      {/* confirm delete application (rejected) */}
      {confirmDelApp ? (
        <div
          id="confirm-delete"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-center justify-between gap-3"
        >
          <div>
            <p className="font-medium text-rose-900">
              Remove this application from your list?
            </p>
            <p className="text-sm text-rose-800/80">
              This only removes it on your side. It won’t affect the pet.
            </p>
          </div>
          <div className="flex gap-2">
            <form action={deleteMyApplication}>
              <input type="hidden" name="application_id" value={confirmDelApp} />
              <button
                type="submit"
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-500"
              >
                Yes, remove
              </button>
            </form>
            <Link
              href="/dashboard?view=applications#lists"
              className="rounded-lg px-3 py-1.5 text-sm text-rose-900 hover:bg-rose-100"
            >
              No, keep it
            </Link>
          </div>
        </div>
      ) : null}

      {/* ✅ confirm cancel PENDING application */}
      {confirmCancelApp ? (
        <div
          id="confirm-cancel"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3"
        >
          <div>
            <p className="font-medium text-amber-900">
              Cancel this adoption application?
            </p>
            <p className="text-sm text-amber-800/80">
              The owner will no longer see this as pending.
            </p>
          </div>
          <div className="flex gap-2">
            <form action={cancelMyPendingApplication}>
              <input
                type="hidden"
                name="application_id"
                value={confirmCancelApp}
              />
              <button
                type="submit"
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-500"
              >
                Yes, cancel
              </button>
            </form>
            <Link
              href="/dashboard?view=applications#lists"
              className="rounded-lg px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100"
            >
              No, keep it
            </Link>
          </div>
        </div>
      ) : null}

      {/* ADD PET FORM */}
      <section className="rounded-3xl border bg-white/80 p-6 md:p-8" id="add">
        <SectionHeader
          title="Add Your Pet"
          subtitle="List a pet for ethical adoption."
        />

        {listingCredits < 1 ? (
          <div className="mt-6">
            <AddPetPaymentBlock />
          </div>
        ) : (
          <form
            key={ts ? `reset-${ts}` : "default"}
            action={createPet}
            method="post"
            encType="multipart/form-data"
            className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <TextField name="name" label="Name *" required />

            {/* Species (with id) */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Species *
              </label>
              <select
                id="species-select"
                name="species"
                required
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select…</option>
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Breed (wrapper so we can swap input/select) */}
            <div id="breed-wrapper">
              <label className="block text-sm font-medium text-gray-700">
                Breed
              </label>
              <input
                id="breed-input"
                name="breed"
                className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <SelectField
              name="sex"
              label="Sex"
              options={["Male", "Female", "Unknown"]}
            />

            <NumberField name="age_value" label="Age" min={0} step={1} />
            <SelectField
              name="age_unit"
              label="Age unit"
              options={["Years", "Months"]}
            />

            <TextField
              name="city"
              label="City / Location"
              defaultValue={cityFromProfile}
            />
            <TextField
              name="owner_full_name"
              label="Owner full name"
              defaultValue={ownerFullName}
            />

            <TextField
              name="owner_phone"
              label="Owner phone number"
              placeholder="e.g., 09xx xxx xxxx"
              defaultValue={ownerPhone}
            />
            <SelectField
              name="adoption_method"
              label="Adoption method"
              options={["Pick up", "Home delivery"]}
            />

            <SelectField
              name="vaccinated"
              label="Vaccinated"
              options={["Yes", "No"]}
            />

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                name="description"
                rows={4}
                className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Temperament, vaccination, special notes..."
              />
            </div>

            {/* photos + vaccine proof */}
            <div className="md:col-span-2 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Photos (exactly 5)
                </label>
                <AddFivePhotos name="photos" submitButtonId="save-pet-btn" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Pet vaccine proof (optional)
                </label>
                <input
                  type="file"
                  name="vaccine_proof"
                  accept="image/*,application/pdf"
                  className="mt-1 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Upload vet card, vaccination card, or photo of certificate.
                </p>
              </div>
            </div>

            <div className="md:col-span-2 flex items-center gap-3">
              <AddPetCareDialog submitButtonId="save-pet-btn" />

              {/* real submit */}
              <button id="save-pet-btn" type="submit" className="hidden">
                submit
              </button>

              <a
                href="/dashboard#add"
                className="rounded-xl border px-4 py-2 text-sm shadow-sm hover:bg-gray-50"
              >
                Cancel
              </a>
            </div>

            {/* dynamic dog/cat breeds script */}
            <script
              dangerouslySetInnerHTML={{
                __html: `
(function(){
  const species = document.getElementById('species-select');
  const wrapper = document.getElementById('breed-wrapper');

  if (!species || !wrapper) return;

  const DOGS = [
    "Aspin",
    "Shih Tzu",
    "Pomeranian",
    "Labrador Retriever",
    "Golden Retriever",
    "Pug",
    "Siberian Husky",
    "German Shepherd",
    "Beagle",
    "Chihuahua",
    "Doberman",
    "Rottweiler",
    "Bulldog",
    "Belgian Malinois"
  ];
  const CATS = [
    "Puspin",
    "Persian",
    "Siamese",
    "Ragdoll",
    "British Shorthair",
    "Maine Coon",
    "Bengal",
    "Scottish Fold",
    "Sphynx"
  ];

  function clearExtra(){
    while (wrapper.children.length > 1) {
      wrapper.removeChild(wrapper.lastChild);
    }
  }

  function makeSelect(list){
    const sel = document.createElement('select');
    sel.name = 'breed';
    sel.id = 'breed-input';
    sel.className = "mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500";
    const opt0 = document.createElement('option');
    opt0.value = "";
    opt0.textContent = "Select breed…";
    sel.appendChild(opt0);
    list.forEach((b) => {
      const o = document.createElement('option');
      o.value = b.toLowerCase();
      o.textContent = b;
      sel.appendChild(o);
    });
    return sel;
  }

  function makeInput(){
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.name = 'breed';
    inp.id = 'breed-input';
    inp.className = "mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500";
    return inp;
  }

  species.addEventListener('change', function(){
    const val = (this.value || '').toLowerCase();
    clearExtra();
    if (val === 'dog') {
      wrapper.appendChild(makeSelect(DOGS));
    } else if (val === 'cat') {
      wrapper.appendChild(makeSelect(CATS));
    } else {
      wrapper.appendChild(makeInput());
    }
  });
})();`,
              }}
            />
          </form>
        )}
      </section>

      {/* LISTS */}
      <section id="lists" className="space-y-4">
        <div className="flex justify-end">
          <div className="inline-flex overflow-hidden rounded-xl border bg-white/80 shadow-sm">
            <a
              href="/dashboard?view=pets#lists"
              className={
                view === "pets"
                  ? "bg-purple-600 px-3 py-1.5 text-sm text-white"
                  : "px-3 py-1.5 text-sm text-purple-700 hover:bg-purple-50"
              }
            >
              Your Pets
            </a>
            <a
              href="/dashboard?view=applications#lists"
              className={
                view === "applications"
                  ? "bg-purple-600 px-3 py-1.5 text-sm text-white"
                  : "px-3 py-1.5 text-sm text-purple-700 hover:bg-purple-50"
              }
            >
              Your Applications
            </a>
          </div>
        </div>

        {view === "pets" ? (
          <div className="space-y-4">
            <SectionHeader
              title="Your Pets"
              subtitle="All pets you’ve listed for adoption."
            />
            {petsWithEffective.length === 0 ? (
              <EmptyBlock ctaHref="/dashboard#add" cta="Add your first pet" />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {petsWithEffective.map((p) => {
                  const isApproved = p._effective === "approved";
                  const isAdopted = p._effective === "adopted";
                  const isExpired = p._effective === "expired";
                  const expiresLabel = p.expires_at
                    ? remainingLabel(p.expires_at)
                    : "—";

                  return (
                    <Card key={p.id}>
                      <CardHeader
                        avatar={p.photo_url}
                        title={p.name}
                        subtitle={`Listed ${new Date(
                          p.created_at
                        ).toLocaleDateString()}`}
                        right={
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={badgeClass(
                                isAdopted ? "adopted" : p._effective
                              )}
                            >
                              {isAdopted
                                ? "Adopted"
                                : isExpired
                                ? "Expired"
                                : p._effective}
                            </span>
                            {p.expires_at ? (
                              <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-100">
                                {expiresLabel}
                              </span>
                            ) : null}
                          </div>
                        }
                      />
                      <CardActions>
                        <ActionLink href={`/pets/${p.id}`}>View pet</ActionLink>
                        <ActionLink href={`/pets/${p.id}/applications`}>
                          Manage applications
                        </ActionLink>
                        <ActionLink href={`/pets/${p.id}/edit`}>Edit</ActionLink>

                        {!isAdopted && (
                          <DeletePetButton
                            key={p.id}
                            action={deletePet}
                            petId={p.id}
                            returnTo="/dashboard"
                          />
                        )}

                        {isApproved && <MarkAdoptedButton petId={p.id} />}
                      </CardActions>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <SectionHeader
              title="Your Applications"
              subtitle="Requests you’ve sent to adopt pets."
            />
            {applications.length === 0 ? (
              <EmptyBlock ctaHref="/adopt" cta="Browse pets" />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {applications.map((a) => {
                  const isOwner = a.pets?.owner_id === user.id;
                  const petIsAdopted =
                    (a.pets?.status || "").toLowerCase() === "adopted";
                  const displayStatus = petIsAdopted
                    ? "adopted"
                    : a.status || "";
                  const isPending =
                    displayStatus.toLowerCase() === "pending";
                  const isRejected =
                    displayStatus.toLowerCase() === "rejected";

                  const note = cleanApplicationMessage(a.message);

                  return (
                    <Card key={a.id}>
                      <CardHeader
                        avatar={a.pets?.photo_url}
                        title={a.pets?.name ?? "Unnamed pet"}
                        subtitle={`Applied ${new Date(
                          a.created_at
                        ).toLocaleDateString()}`}
                        right={
                          <div className="flex items-center gap-2">
                            <span className={badgeClass(displayStatus)}>
                              {displayStatus}
                            </span>
                            {isRejected && (
                              <a
                                href={`/dashboard?confirmDelApp=${encodeURIComponent(
                                  a.id
                                )}#confirm-delete`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              >
                                ✕
                              </a>
                            )}
                          </div>
                        }
                      />
                      {note && (
                        <p className="px-4 text-sm text-gray-600 whitespace-pre-line">
                          Note: {note}
                        </p>
                      )}
                      <CardActions>
                        <ActionLink href={`/pets/${a.pet_id}`}>
                          View pet
                        </ActionLink>

                        {!isOwner && (
                          <ActionLink href={`/pets/${a.pet_id}/chat`}>
                            Chat
                          </ActionLink>
                        )}

                        {!isOwner && isPending && (
                          <a
                            href={`/dashboard?confirmCancelApp=${encodeURIComponent(
                              a.id
                            )}#confirm-cancel`}
                            className="ml-auto rounded-lg border border-amber-200 px-2.5 py-1.5 text-sm text-amber-700 hover:bg-amber-50"
                          >
                            Cancel
                          </a>
                        )}
                      </CardActions>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <MessagesDrawer />
    </div>
  );
}

/* ───────── UI bits / helpers ───────── */
function HeroHeader({
  name,
  totals,
  credits,
  adoptedCount,
}: {
  name: string;
  totals: { total: number; pending: number; approved: number; rejected: number };
  credits: number;
  adoptedCount: number;
}) {
  const total = Math.max(totals.total, 1);
  const pct = (n: number) => Math.round((n / total) * 100);

  return (
    <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-50 via-white to-emerald-50">
      <div className="relative p-6 md:p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold">
              Welcome back, {name}! 🐾
            </h1>
            <p className="text-gray-600">
              Manage your listed pets and keep track of your adoption activity.
            </p>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            {/* Credits pill */}
            <div className="inline-flex items-center rounded-xl border bg-white/80 px-3 py-2 text-sm text-purple-700 shadow-sm">
              <span className="font-medium">Credits:</span>
              <span className="ml-1 rounded-md bg-purple-600 px-2 py-[2px] text-xs text-white">
                {credits}
              </span>
            </div>

            {/* Adopted count pill (max 3) */}
            <div className="inline-flex items-center rounded-xl border bg-white/80 px-3 py-2 text-sm text-emerald-700 shadow-sm">
              <span className="font-medium">Adopted:</span>
              <span className="ml-1 rounded-md bg-emerald-500 px-2 py-[2px] text-xs text-white">
                {adoptedCount}/{MAX_ADOPTED_PETS}
              </span>
            </div>

            <Link
              href="/adopt"
              className="rounded-xl border bg-white/80 px-3 py-2 text-sm text-indigo-700 shadow-sm hover:bg-indigo-50"
            >
              Browse pets
            </Link>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Total"
            value={totals.total}
            percent={100}
            ring="ring-indigo-200"
            bar="bg-indigo-500"
            chip="text-indigo-700"
          />
          <StatTile
            label="Pending"
            value={totals.pending}
            percent={pct(totals.pending)}
            ring="ring-amber-200"
            bar="bg-amber-500"
            chip="text-amber-700"
          />
          <StatTile
            label="Approved"
            value={totals.approved}
            percent={pct(totals.approved)}
            ring="ring-emerald-200"
            bar="bg-emerald-500"
            chip="text-emerald-700"
          />
          <StatTile
            label="Rejected"
            value={totals.rejected}
            percent={pct(totals.rejected)}
            ring="ring-rose-200"
            bar="bg-rose-500"
            chip="text-rose-700"
          />
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  percent,
  ring,
  bar,
  chip,
}: {
  label: string;
  value: number | string;
  percent: number;
  ring: string;
  bar: string;
  chip: string;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white/75 p-3 ring-1 ${ring} shadow-sm`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-gray-600">{label}</span>
        <span className={`text-lg font-semibold ${chip}`}>{value}</span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100">
        <div
          className={`h-1.5 rounded-full ${bar}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-white/90 shadow-sm">
      {children}
    </div>
  );
}

function CardHeader({
  avatar,
  title,
  subtitle,
  right,
}: {
  avatar?: string | null;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 overflow-hidden rounded-xl bg-gray-100">
          {avatar ? (
            <Image
              src={avatar}
              alt={title}
              width={48}
              height={48}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-gray-400">
              🐾
            </div>
          )}
        </div>
        <div>
          <h3 className="font-medium leading-tight capitalize">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function CardActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t p-4">
      {children}
    </div>
  );
}

function ActionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-transparent px-2.5 py-1.5 text-sm text-indigo-700 hover:border-indigo-200 hover:bg-indigo-50"
    >
      {children}
    </Link>
  );
}

function Callout({
  title,
  subtitle,
  tone = "indigo",
}: {
  title: string;
  subtitle?: string;
  tone?: "indigo" | "emerald" | "rose";
}) {
  const t: Record<string, string> = {
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 ${t[tone]}`}>
      <div className="font-medium">{title}</div>
      {subtitle ? (
        <div className="mt-0.5 text-sm opacity-90">{subtitle}</div>
      ) : null}
    </div>
  );
}

function EmptyBlock({ ctaHref, cta }: { ctaHref: string; cta: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white/70 p-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-indigo-50 text-2xl">
        🐾
      </div>
      <h3 className="text-lg font-medium">Nothing here yet</h3>
      <p className="mt-1 text-gray-600">
        Start by adding or applying to a pet.
      </p>
      <div className="mt-4">
        <Link
          href={ctaHref}
          className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-white shadow-sm hover:bg-indigo-700"
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}

function qp(
  sp: Record<string, string | string[] | undefined> | undefined,
  key: string
): string | undefined {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

function TextField(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }
) {
  const { label, ...rest } = props;
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        {...rest}
        className="mt-1 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}

function NumberField(
  props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }
) {
  return <TextField {...props} type="number" />;
}

function SelectField({
  name,
  label,
  options,
  required,
}: {
  name: string;
  label: string;
  options: string[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        name={name}
        required={required}
        className="mt-1 w-full rounded-xl border bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">{required ? "Select…" : "—"}</option>
        {options.map((o) => (
          <option key={o.toLowerCase()} value={o.toLowerCase()}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function badgeClass(status?: string | null) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 capitalize";
  switch ((status || "").toLowerCase()) {
    case "adopted":
      return `${base} bg-emerald-50 text-emerald-700 ring-emerald-200`;
    case "approved":
      return `${base} bg-sky-50 text-sky-700 ring-sky-200`;
    case "rejected":
      return `${base} bg-rose-50 text-rose-700 ring-rose-200`;
    case "expired":
      return `${base} bg-slate-100 text-slate-700 ring-slate-200`;
    default:
      return `${base} bg-amber-50 text-amber-700 ring-amber-200`;
  }
}

function remainingLabel(expires_at: string | null | undefined) {
  if (!expires_at) return "";
  const now = new Date();
  const exp = new Date(expires_at);
  const diffMs = exp.getTime() - now.getTime();
  if (diffMs <= 0) return "Expired";
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(diffMs / oneDay);
  if (diffDays === 0) {
    const diffHours = Math.ceil(diffMs / (60 * 60 * 1000));
    return diffHours <= 1 ? "1 hr left" : `${diffHours} hrs left`;
  }
  if (diffDays === 1) return "1 day left";
  return `${diffDays} days left`;
}

function extractAddressFromBio(bio: string) {
  const m = bio.match(/^\s*address:\s*(.+)\s*$/im);
  return m ? m[1].trim() : "";
}

/** Clean application message for dashboard (hide long ID URLs, etc.) */
function cleanApplicationMessage(message?: string | null): string {
  if (!message) return "";

  // If the message has "Attached IDs:", only show the part before that.
  const [beforeIds] = message.split("Attached IDs:");
  const trimmed = beforeIds.trim();
  if (trimmed) return trimmed;

  // Fallback: strip any URLs (safety for other cases).
  const withoutUrls = message.replace(/https?:\/\/\S+/g, "").trim();
  return withoutUrls;
}
