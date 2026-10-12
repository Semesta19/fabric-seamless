// Vercel Serverless Function — menjaga OPENAI_API_KEY tetap di server.
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

const MAIN_PROMPT = "Fabric extracted and converted into a seamless repeat texture";
const SUPPORT_PROMPT =
  "Flat, top-down, evenly lit swatch of the same fabric. Remove folds, wrinkles, shadows, curled edges, scan borders and any background. " +
  "Keep the original weave, yarn structure, print or pattern, scale and colors. " +
  "The left/right and top/bottom edges must match so the image tiles perfectly in all directions with no visible seams.";

const SIZES = ["1024x1024", "1536x1024", "1024x1536"];
const QUALITIES = ["low", "medium", "high", "auto"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: "OPENAI_API_KEY belum diatur di server." });

  const appPassword = process.env.APP_PASSWORD;
  if (appPassword && req.headers["x-app-password"] !== appPassword) {
    return res.status(401).json({ error: "Password salah." });
  }

  try {
    const { image, size = "1024x1024", quality = "high", notes = "" } = req.body || {};

    const match = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(image || "");
    if (!match) return res.status(400).json({ error: "Gambar tidak valid (harus PNG, JPG, atau WebP)." });
    if (!SIZES.includes(size) || !QUALITIES.includes(quality)) {
      return res.status(400).json({ error: "Ukuran atau kualitas tidak valid." });
    }

    const buffer = Buffer.from(match[3], "base64");
    const ext = match[2] === "jpeg" ? "jpg" : match[2];

    let prompt = `${MAIN_PROMPT}. ${SUPPORT_PROMPT}`;
    const extra = String(notes).trim().slice(0, 500);
    if (extra) prompt += ` Additional notes: ${extra}`;

    const form = new FormData();
    form.append("model", MODEL);
    form.append("image", new Blob([buffer], { type: match[1] }), `scan.${ext}`);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("n", "1");
    // JPEG supaya respons tetap di bawah batas 4.5 MB milik Vercel
    form.append("output_format", "jpeg");
    form.append("output_compression", "95");

    const upstream = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data?.error?.message || "Gagal memanggil OpenAI." });
    }

    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: "OpenAI tidak mengembalikan gambar." });

    return res.status(200).json({ image: `data:image/jpeg;base64,${b64}` });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Terjadi kesalahan di server." });
  }
}
