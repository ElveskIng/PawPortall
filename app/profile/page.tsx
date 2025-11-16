/* eslint-disable @typescript-eslint/no-explicit-any */
// app/profile/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { Camera, Check, Copy, Link2, Loader2, Pencil, ShieldCheck } from "lucide-react";
import IdTypeSelect from "@/components/IdTypeSelect";

/* ----------------------------- Types ----------------------------- */
type ProfileLink = { label?: string | null; url: string };

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  links: ProfileLink[] | null;
  id_image_url: string | null;
  email?: string | null;
  updated_at?: string | null;
};

type PartialProfileRow = Partial<ProfileRow> & { id: string };

/* --------- Default profile para hindi mag-null / mag-block -------- */
const BLANK_PROFILE: ProfileRow = {
  id: "",
  full_name: null,
  phone: null,
  bio: null,
  avatar_url: null,
  links: [],
  id_image_url: null,
  email: null,
  updated_at: null,
};

/* ---------------------------- Helpers ---------------------------- */
const safeUrl = (url: string) => {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
    return u.toString();
  } catch {
    return "#";
  }
};

const displayHost = (url: string) => {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.host;
  } catch {
    return url.replace(/^https?:\/\//i, "");
  }
};

const stripProtocol = (url: string) => {
  try {
    const u = new URL(url);
    const path =
      (u.pathname === "/" ? "" : u.pathname) + (u.search || "") + (u.hash || "");
    return `${u.host}${path}`;
  } catch {
    return url.replace(/^https?:\/\//i, "");
  }
};

const FB_RE = /^(https?:\/\/)?(www\.)?(m\.)?(facebook\.com|fb\.com)\/.+/i;
const IG_RE = /^(https?:\/\/)?(www\.)?(m\.)?instagram\.com\/.+/i;
const digitsOnly = (v: string) => v.replace(/\D+/g, "");

function errorMessage(err: unknown, fallback = "Unexpected error"): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err)
    return String((err as any).message || fallback);
  return fallback;
}

/** UI timeout para hindi ma-stuck sa “Saving…” */
function withUiTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(
        new Error(
          "Saving is taking too long. Please check your internet and try again."
        )
      );
    }, ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

/* --------------------- BIO parsing / composing ------------------- */
function parseBio(bio?: string | null) {
  const res = { address: "", idType: "", idNumber: "", about: "", idImage: "" };
  if (!bio) return res;

  const lines = bio.split(/\r?\n/);
  const other: string[] = [];
  for (const line of lines) {
    const mAddr = line.match(/^\s*Address:\s*(.+)\s*$/i);
    const mType = line.match(/^\s*ID\s*Type:\s*(.+)\s*$/i);
    const mNo = line.match(/^\s*ID\s*Number:\s*(.+)\s*$/i);
    const mImg = line.match(/^\s*ID\s*Image:\s*(.+)\s*$/i);
    if (mAddr) res.address = mAddr[1].trim();
    else if (mType) res.idType = mType[1].trim();
    else if (mNo) res.idNumber = mNo[1].trim();
    else if (mImg) res.idImage = mImg[1].trim();
    else other.push(line);
  }
  res.about = other.join("\n").trim();
  return res;
}

function buildBio(
  address: string,
  idType: string,
  idNumber: string,
  about: string,
  idImageUrl?: string
) {
  const parts: string[] = [];
  if (address.trim()) parts.push(`Address: ${address.trim()}`);
  if (idType.trim()) parts.push(`ID Type: ${idType.trim()}`);
  if (idNumber.trim()) parts.push(`ID Number: ${idNumber.trim()}`);
  if (idImageUrl?.trim()) parts.push(`ID Image: ${idImageUrl.trim()}`);
  if (about.trim()) parts.push(about.trim());
  return parts.join("\n");
}

/** 🚫 HINDI NA NAGBA-BLOCK: laging false */
function requiresVerification(_p: ProfileRow | null) {
  return false;
}

/* ------------------------------- Page ---------------------------- */
export default function ProfilePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const IDS_BUCKET = "id-images";

  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // ✅ Default agad sa BLANK_PROFILE
  const [profile, setProfile] = useState<ProfileRow>(BLANK_PROFILE);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Avatar
  const [avatarDlgOpen, setAvatarDlgOpen] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imgError, setImgError] = useState(false);

  // Edit info
  const [editOpen, setEditOpen] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  // Links
  const [fbUrl, setFbUrl] = useState("");
  const [igUrl, setIgUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  // Identity fields (verification modal)
  const [editFullAddress, setEditFullAddress] = useState("");
  const [editIdType, setEditIdType] = useState("");
  const [editIdNumber, setEditIdNumber] = useState("");
  const [editAbout, setEditAbout] = useState("");

  // ID image
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idPreview, setIdPreview] = useState<string | null>(null);
  const [idUploading, setIdUploading] = useState(false);

  // Copy ID
  const [copied, setCopied] = useState(false);

  // Verification modal
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifySaving, setVerifySaving] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  const [verifyOk, setVerifyOk] = useState<string | null>(null);

  // purpose dropdown
  const [verifyIntent, setVerifyIntent] = useState<"" | "placing" | "adopter">("");

  /* -------------------- SMART UPSERT (with fallback) ------------------- */
  async function upsertProfileSmart(payload: any) {
    const first = await (supabase as any)
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (!first.error) return;

    const msg = String(first.error.message || "").toLowerCase();
    const looksLikeTypeError =
      msg.includes("json") ||
      msg.includes("type") ||
      msg.includes("cannot cast") ||
      msg.includes("invalid input");

    if (looksLikeTypeError && Array.isArray(payload.links)) {
      const second = await (supabase as any)
        .from("profiles")
        .upsert(
          {
            ...payload,
            links: JSON.stringify(payload.links),
          },
          { onConflict: "id" }
        );
      if (!second.error) return;
      throw second.error;
    }

    throw first.error;
  }

  /* ------------------------------- load -------------------------------- */
  useEffect(() => {
    let isMounted = true;

    async function run() {
      setLoading(true);
      setLoadErr(null);

      try {
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        const u = data?.user ?? null;

        if (!u) {
          if (!isMounted) return;
          setUserId(null);
          setUserEmail(null);
          setProfile(BLANK_PROFILE);
          return;
        }

        if (!isMounted) return;

        setUserId(u.id);
        setUserEmail(u.email ?? null);

        const { data: rowData, error: rowErr } = await supabase
          .from("profiles")
          .select(
            [
              "id",
              "full_name",
              "phone",
              "bio",
              "avatar_url",
              "links",
              "id_image_url",
            ].join(",")
          )
          .eq("id", u.id)
          .maybeSingle();

        if (rowErr && rowErr.code !== "PGRST116") {
          console.error("Profile load error:", rowErr);
          setLoadErr(rowErr.message);
        }

        const baseRow: ProfileRow =
          (rowData as any) ?? {
            id: u.id,
            full_name: null,
            phone: null,
            bio: null,
            avatar_url: null,
            links: [],
            id_image_url: null,
          };

        let links: ProfileLink[] | null = baseRow.links;
        if (typeof baseRow.links === "string") {
          try {
            const parsed = JSON.parse(baseRow.links) as any;
            links = Array.isArray(parsed) ? parsed : [];
          } catch {
            links = [];
          }
        }

        const fixedRow: ProfileRow = {
          ...baseRow,
          links,
          id_image_url: baseRow.id_image_url ?? null,
        };

        if (!isMounted) return;

        setProfile(fixedRow);

        // pre-fill edit fields
        setEditFullName(fixedRow.full_name ?? "");
        setEditPhone(fixedRow.phone ?? "");

        const parsed = parseBio(fixedRow.bio);
        setEditFullAddress(parsed.address || "");
        setEditIdType(parsed.idType || "");
        setEditIdNumber(parsed.idNumber || "");
        setEditAbout(parsed.about || "");

        const fb = (links || []).find(
          (l) =>
            (l.label || "").toLowerCase() === "facebook" ||
            /facebook\.com|fb\.com/i.test(l.url || "")
        );
        const ig = (links || []).find(
          (l) =>
            (l.label || "").toLowerCase() === "instagram" ||
            /instagram\.com/i.test(l.url || "")
        );
        setFbUrl(fb?.url ? stripProtocol(fb.url) : "");
        setIgUrl(ig?.url ? stripProtocol(ig.url) : "");

        setVerifyOpen(false);
      } catch (err) {
        if (!isMounted) return;
        console.error("Profile load fatal error:", err);
        setLoadErr(errorMessage(err, "Could not load your profile."));
        setProfile(BLANK_PROFILE);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    run();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  //REMOVE | ONLY A TEST
  useEffect(() => {
  console.log('🔍 Profile state changed:', {
    id: profile?.id,
    name: profile?.full_name,
    phone: profile?.phone,
  });
}, [profile]);

  const avatarSrc = useMemo(() => {
    if (!profile?.avatar_url) return null;
    return profile.avatar_url.includes("?")
      ? `${profile.avatar_url}&v=${avatarVersion}`
      : `${profile.avatar_url}?v=${avatarVersion}`;
  }, [profile?.avatar_url, avatarVersion]);

  const bioParsed = useMemo(() => parseBio(profile?.bio), [profile?.bio]);
  const fullAddressFromBio = bioParsed.address || null;
  const aboutFromBio = bioParsed.about || null;

  /* ---------------------------- avatar ops ---------------------------- */
  const chooseAvatar = () => {
    setSaveErr(null);
    fileInputRef.current?.click();
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(f));
    setAvatarDlgOpen(true);
    e.currentTarget.value = "";
  };

  async function confirmSaveAvatar() {
    if (!avatarFile || !userId) return;
    setAvatarSaving(true);
    setSaveErr(null);
    try {
      const body = new FormData();
      body.append("file", avatarFile);
      const res = await fetch("/api/profile/avatar", { method: "POST", body });

      const ct = res.headers.get("content-type") || "";
      const text = await res.text();
      const data = ct.includes("application/json") ? JSON.parse(text) : { error: text };

      if (!res.ok) throw new Error(data?.error || `Failed to save avatar (${res.status})`);

      setProfile((p) => (p ? { ...p, avatar_url: data.url } : p));
      setAvatarVersion((v) => v + 1);
      setAvatarDlgOpen(false);
      setAvatarFile(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
      setImgError(false);
    } catch (e) {
      setSaveErr(errorMessage(e, "Failed to save avatar."));
    } finally {
      setAvatarSaving(false);
    }
  }

  /* ------------------------- EDIT INFORMATION ------------------------- */
  const saveEditInfo = async () => {
    if (!profile) return;
    setEditSaving(true);
    setEditErr(null);

    try {
      const links: ProfileLink[] = [];

      if (fbUrl.trim()) {
        const u = fbUrl.startsWith("http") ? fbUrl : `https://${fbUrl}`;
        if (!FB_RE.test(u))
          throw new Error("Facebook link must be a valid facebook.com/fb.com URL.");
        links.push({ label: "Facebook", url: safeUrl(u) });
      }

      if (igUrl.trim()) {
        const u = igUrl.startsWith("http") ? igUrl : `https://${igUrl}`;
        if (!IG_RE.test(u))
          throw new Error("Instagram link must be a valid instagram.com URL.");
        links.push({ label: "Instagram", url: safeUrl(u) });
      }

      const old = parseBio(profile.bio);
      const newBio = buildBio(
        editFullAddress || "",
        old.idType || "",
        old.idNumber || "",
        editAbout || "",
        old.idImage || ""
      );

      const payload: PartialProfileRow = {
        id: profile.id,
        full_name: editFullName || null,
        phone: editPhone ? digitsOnly(editPhone) : null,
        links,
        bio: newBio || null,
      };

      await withUiTimeout(upsertProfileSmart(payload), 10000);

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              full_name: payload.full_name ?? prev.full_name,
              phone: payload.phone ?? prev.phone,
              bio: payload.bio ?? prev.bio,
              links,
            }
          : prev
      );

      setEditOpen(false);
    } catch (e) {
      setEditErr(errorMessage(e, "Could not save your changes."));
    } finally {
      setEditSaving(false);
    }
  };

  /* ----------------------- VERIFICATION MODAL ----------------------- */
  function onPickIdFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setIdFile(f);
    if (idPreview) URL.revokeObjectURL(idPreview);
    setIdPreview(f ? URL.createObjectURL(f) : null);
    e.currentTarget.value = "";
  }

  async function uploadIdImageIfAny(): Promise<string | null> {
    if (!idFile) return null;
    if (!userId) throw new Error("User session not ready. Please try again.");

    const MAX_MB = 8;
    const okTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (idFile.size > MAX_MB * 1024 * 1024)
      throw new Error(`ID image too large (>${MAX_MB} MB).`);
    if (idFile.type && !okTypes.includes(idFile.type))
      throw new Error("Unsupported image type.");

    setVerifyErr(null);
    setIdUploading(true);
    try {
      const ext = (idFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `applications/${userId}/${Date.now()}.${ext}`;

      const uploadRes: any = await (supabase as any).storage
        .from(IDS_BUCKET)
        .upload(path, idFile, {
          cacheControl: "3600",
          upsert: true,
        });
      if (uploadRes?.error) {
        console.error("ID upload error:", uploadRes.error);
        throw new Error(uploadRes.error.message || "Upload failed");
      }

      const pubRes: any = (supabase as any).storage.from(IDS_BUCKET).getPublicUrl(path);
      if (pubRes?.error) {
        console.error("Public URL error:", pubRes.error);
        throw new Error(pubRes.error.message || "Could not generate public URL");
      }
      const publicUrl: string | undefined = pubRes?.data && pubRes.data.publicUrl;
      if (!publicUrl) throw new Error("Public URL is empty.");
      return publicUrl;
    } catch (e) {
      const msg = errorMessage(e, "Could not upload ID image.");
      setVerifyErr(msg);
      return null;
    } finally {
      setIdUploading(false);
    }
  }

  async function saveVerification() {
    if (!profile) return;
    setVerifySaving(true);
    setVerifyErr(null);
    setVerifyOk(null);

    try {
      const phone = digitsOnly(editPhone).slice(0, 11);
      if (phone.length !== 11) throw new Error("Phone number must be exactly 11 digits.");
      if (!(editFullAddress || "").trim())
        throw new Error("Please complete the full address.");

      let newUploadedUrl: string | null = null;
      if (idFile) {
        newUploadedUrl = await uploadIdImageIfAny();
        if (!newUploadedUrl) {
          throw new Error("ID image upload failed. Please see the error message above.");
        }
      }

      const parsedOld = parseBio(profile.bio);

      const finalIdImageUrl =
        newUploadedUrl || profile.id_image_url || parsedOld.idImage || null;

      const combinedBio = buildBio(
        editFullAddress,
        editIdType,
        editIdNumber,
        editAbout,
        finalIdImageUrl || undefined
      );

      await withUiTimeout(
        upsertProfileSmart({
          id: profile.id,
          phone,
          bio: combinedBio || null,
          id_image_url: finalIdImageUrl,
        }),
        10000
      );

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              phone,
              bio: combinedBio || null,
              id_image_url: finalIdImageUrl ?? prev.id_image_url,
            }
          : prev
      );

      setVerifyOk("Verification info saved.");

      setVerifyOpen(false);

      setIdFile(null);
      if (idPreview) URL.revokeObjectURL(idPreview);
      setIdPreview(null);

      if (typeof window !== "undefined") {
        if (verifyIntent === "placing") {
          window.location.href = "/dashboard";
        } else if (verifyIntent === "adopter") {
          window.location.href = "/adopt";
        }
      }
    } catch (e) {
      setVerifyErr(errorMessage(e, "Failed to save verification."));
    } finally {
      setVerifySaving(false);
    }
  }

  /* ------------------------------- render --------------------------- */
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>
      <div className="text-sm text-gray-600 mt-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1">
          {userEmail || "Not signed in"}
        </span>
      </div>

      {loadErr && (
        <p className="mt-3 text-sm text-red-600">
          {loadErr} (your local data will still show)
        </p>
      )}

      {/* 🔕 Wala nang actual blocking, pero pwede mong i-keep o i-remove itong banner.
          Dahil requiresVerification() => false, hindi na ito magre-render. */}
      {requiresVerification(profile) && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 mt-0.5" />
          <div className="text-sm flex-1">
            <div className="font-semibold">Identity verification required</div>
            <div>
              Please complete your phone, full address, and ID image before using
              other features.
            </div>
          </div>
          <button
            onClick={() => setVerifyOpen(true)}
            className="ml-3 inline-flex items-center rounded-full bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            Verify now
          </button>
        </div>
      )}

      {/* ------------- AVATAR + DETAILS CARD ------------- */}
      <div className="mt-6 rounded-3xl overflow-hidden border border-black/5 shadow-sm bg-white">
        {/* header */}
        <div className="relative h-40 sm:h-48 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -inset-8 rounded-[3rem] blur-2xl opacity-20 bg-white" />
          </div>
        </div>

        {/* body */}
        <div className="relative p-4 sm:p-6">
          {/* avatar */}
          <div className="absolute -top-12 left-6">
            <div className="h-24 w-24 rounded-full ring-4 ring-white shadow-md overflow-hidden bg-gray-100 grid place-items-center">
              {profile.avatar_url && !imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc || ""}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <span className="text-3xl">🙂</span>
              )}
            </div>
          </div>

          <div className="pl-32 flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-xl font-semibold">
                {profile.full_name || "Unnamed user"}
              </div>
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50"
                onClick={() => setEditOpen(true)}
                title="Edit information"
              >
                <Pencil className="h-4 w-4" />
                Edit information
              </button>
            </div>

            <div className="text-sm text-gray-500">
              Member since{" "}
              <span className="font-medium">{new Date().toLocaleDateString()}</span>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={chooseAvatar}
                className="inline-flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                <Camera className="h-4 w-4" />
                Change avatar
              </button>

              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(profile.id);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  } catch {
                    // ignore
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                title="Copy User ID"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy User ID
              </button>

              <span className="text-xs text-gray-500 select-all">{profile.id}</span>
            </div>
          </div>
        </div>

        {/* details */}
        <div className="px-4 sm:px-6 pb-6">
          <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-violet-50/40 p-4 sm:p-6">
            <dl className="grid grid-cols-1 gap-6">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Phone
                </dt>
                <dd className="mt-1 text-gray-800">
                  {profile.phone || <span className="text-gray-400">Not set</span>}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Full address
                </dt>
                <dd className="mt-1 text-gray-800">
                  {fullAddressFromBio ? (
                    fullAddressFromBio
                  ) : (
                    <span className="text-gray-400">Not set</span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  About you
                </dt>
                <dd className="mt-1 text-gray-800 whitespace-pre-wrap">
                  {aboutFromBio ? (
                    aboutFromBio
                  ) : (
                    <span className="text-gray-400">No information yet.</span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Links
                </dt>
                <dd className="mt-2">
                  {profile.links && profile.links.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {profile.links.map((l, idx) => {
                        const href = safeUrl(l.url);
                        const shown = stripProtocol(href);
                        return (
                          <a
                            key={idx}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                            title={href}
                          >
                            <Link2 className="h-4 w-4" />
                            <div className="flex items-center gap-2">
                              <span>{l.label || displayHost(href)}</span>
                              <span className="text-xs text-gray-500 truncate max-w-[220px]">
                                {shown}
                              </span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-gray-400">No links yet.</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* hidden file input for avatar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFilePicked}
      />

      {/* Avatar dialog */}
      {avatarDlgOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 text-white flex items-center justify-between">
              <div className="font-semibold">Save new avatar?</div>
              <button
                onClick={() => {
                  setAvatarDlgOpen(false);
                  setAvatarFile(null);
                  if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                  setAvatarPreview(null);
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full overflow-hidden ring-1 ring-gray-200 bg-gray-100 grid place-items-center">
                  {avatarPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-2xl">🙂</span>
                  )}
                </div>
                <div className="text-sm">
                  <div className="font-medium">{avatarFile?.name}</div>
                  <div className="text-gray-500">
                    {avatarFile ? `${(avatarFile.size / 1024 / 1024).toFixed(2)} MB` : ""}
                  </div>
                </div>
                <div className="ml-auto">
                  <button
                    onClick={chooseAvatar}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    Choose another
                  </button>
                </div>
              </div>

              {saveErr && <div className="text-sm text-red-600">{saveErr}</div>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    setAvatarDlgOpen(false);
                    setAvatarFile(null);
                    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                    setAvatarPreview(null);
                  }}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSaveAvatar}
                  disabled={avatarSaving || !avatarFile}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {avatarSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {avatarSaving ? "Saving..." : "Save image"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit information dialog */}
      {editOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="px-5 py-3 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 text-white flex items-center justify-between">
              <div className="font-semibold">Edit information</div>
              <button onClick={() => setEditOpen(false)} aria-label="Close" className="opacity-90">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Full name</label>
                  <input
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Phone</label>
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(digitsOnly(e.target.value).slice(0, 11))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={11}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                    placeholder="09xxxxxxxxx"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-sm text-gray-600">Full address</label>
                  <input
                    value={editFullAddress}
                    onChange={(e) => setEditFullAddress(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                    placeholder="House No. Street, Barangay, City, Province"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600">About you</label>
                  <textarea
                    rows={4}
                    value={editAbout}
                    onChange={(e) => setEditAbout(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                    placeholder="Anything admins/adopters should know..."
                  />
                </div>
              </div>

              {/* Links */}
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">Links</div>
                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
                  <input
                    value="Facebook"
                    disabled
                    className="rounded-xl border border-gray-200 px-3 py-2 bg-gray-50 text-gray-600"
                  />
                  <input
                    value={fbUrl}
                    onChange={(e) => setFbUrl(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                    placeholder="facebook.com/yourpage-or-reel"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
                  <input
                    value="Instagram"
                    disabled
                    className="rounded-xl border border-gray-200 px-3 py-2 bg-gray-50 text-gray-600"
                  />
                  <input
                    value={igUrl}
                    onChange={(e) => setIgUrl(e.target.value)}
                    className="rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                    placeholder="instagram.com/you"
                  />
                </div>
              </div>

              {editErr && <div className="text-sm text-red-600">{editErr}</div>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setEditOpen(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={saveEditInfo}
                  disabled={editSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {editSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verification dialog */}
      {verifyOpen && userId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="px-5 py-3 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600 text-white flex items-center justify-center">
              <div className="font-semibold">Identity verification</div>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Phone number</label>
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(digitsOnly(e.target.value).slice(0, 11))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={11}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                    placeholder="09xxxxxxxxx"
                  />
                  <p className="text-xs text-gray-500 mt-1">Must be 11 digits.</p>
                </div>
                <div>
                  <IdTypeSelect value={editIdType} onChange={setEditIdType} />
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600">Full address</label>
                <input
                  value={editFullAddress}
                  onChange={(e) => setEditFullAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                  placeholder="House No. Street, Barangay, City, Province"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-600">ID number</label>
                  <input
                    value={editIdNumber}
                    onChange={(e) => setEditIdNumber(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                    placeholder="e.g. 1212121212"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Upload ID image</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={onPickIdFile}
                    className="mt-1 block w-full text-sm"
                  />
                  {idPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={idPreview}
                      alt="ID preview"
                      className="mt-2 h-40 w-auto rounded-md border"
                    />
                  )}
                  {idUploading && (
                    <div className="text-xs text-gray-500 mt-1">Uploading…</div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm text-gray-600">What do you want to do?</label>
                <select
                  value={verifyIntent}
                  onChange={(e) =>
                    setVerifyIntent(e.target.value as "placing" | "adopter" | "")
                  }
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500 bg-white"
                >
                  <option value="">Select purpose…</option>
                  <option value="placing">Placing for adoption</option>
                  <option value="adopter">Adopter</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600">About you</label>
                <textarea
                  rows={4}
                  value={editAbout}
                  onChange={(e) => setEditAbout(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
                  placeholder="Anything admins/adopters should know..."
                />
              </div>

              {verifyErr && <div className="text-sm text-red-600">{verifyErr}</div>}
              {verifyOk && <div className="text-sm text-emerald-700">{verifyOk}</div>}

              <div className="flex justify-end gap-2 pt-1 pb-2">
                <button
                  onClick={saveVerification}
                  disabled={verifySaving || idUploading}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {(verifySaving || idUploading) && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {verifySaving ? "Saving…" : "Save & submit"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
