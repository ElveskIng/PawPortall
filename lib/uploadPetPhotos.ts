import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export async function uploadPetPhotos(petId: string, files: File[]) {
  const supabase = getSupabaseBrowserClient();
  const bucket = "pets"; // change if your bucket name differs
  const uploadedPaths: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = f.name.split(".").pop() ?? "jpg";
    const path = `${petId}/${Date.now()}_${i}.${ext}`;

    const { error } = await supabase.storage.from(bucket).upload(path, f, {
      upsert: false,
      cacheControl: "3600",
      contentType: f.type || "image/jpeg",
    });

    if (error) throw error;
    uploadedPaths.push(path);
  }
  return uploadedPaths;
}
