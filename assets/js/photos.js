const MAX = 5, MAX_BYTES = 10 * 1024 * 1024, TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export function pickPhotos(input, thumbs, cb) {
  let files = [];
  input.addEventListener("change", () => {
    let err = "";
    for (const f of input.files) {
      if (files.length >= MAX) { err = `You can add up to ${MAX} photos.`; break; }
      if (!TYPES.includes(f.type) && !/\.(heic|heif)$/i.test(f.name)) { err = `${f.name} isn't a supported image type.`; continue; }
      if (f.size > MAX_BYTES) { err = `${f.name} is larger than 10 MB.`; continue; }
      files.push(f);
    }
    input.value = "";
    thumbs.innerHTML = files.map((f, i) => `<button type="button" data-rm="${i}" aria-label="Remove ${f.name.replace(/"/g, "")}" style="border:0;padding:0;background:none;cursor:pointer"><img src="${URL.createObjectURL(f)}" alt=""></button>`).join("");
    cb(files, err);
  });
  thumbs.addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    files.splice(+b.dataset.rm, 1); b.remove();
    thumbs.querySelectorAll("[data-rm]").forEach((x, i) => (x.dataset.rm = i));
    cb(files, "");
  });
}
// Uploads files to the private photo bucket using one-time signed URLs from the backend.
export async function uploadPhotos(urls, files) {
  await Promise.all(files.slice(0, urls.length).map((f, i) =>
    fetch(urls[i].signedUrl, { method: "PUT", headers: { "Content-Type": f.type || "image/jpeg", "x-upsert": "false" }, body: f })
      .then((r) => { if (!r.ok) throw new Error("upload failed"); })));
}
