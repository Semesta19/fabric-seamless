import { useCallback, useRef, useState } from "react";

type Size = "1024x1024" | "1536x1024" | "1024x1536";
type Quality = "low" | "medium" | "high" | "auto";
type View = "single" | "tiled";

const MAX_EDGE = 2048;
const MAX_BYTES = 3_200_000; // batas body Vercel 4.5 MB (base64 menambah ~33%)

/** Perkecil & kompres gambar di browser agar muat di batas request Vercel. */
async function prepareImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  let quality = 0.92;
  let url = canvas.toDataURL("image/jpeg", quality);
  while (url.length * 0.75 > MAX_BYTES && quality > 0.5) {
    quality -= 0.08;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  return url;
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [size, setSize] = useState<Size>("1024x1024");
  const [quality, setQuality] = useState<Quality>("high");
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState(() => sessionStorage.getItem("app-pw") || "");

  const [view, setView] = useState<View>("tiled");
  const [tile, setTile] = useState(220);
  const [seams, setSeams] = useState(true);

  const handleFile = useCallback(async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError("Gunakan file PNG, JPG, atau WebP.");
      return;
    }
    setError("");
    try {
      setSource(await prepareImage(file));
      setFileName(file.name);
      setResult(null);
    } catch {
      setError("Gambar tidak bisa dibaca. Coba file lain.");
    }
  }, []);

  const generate = async () => {
    if (!source) return;
    setLoading(true);
    setError("");
    sessionStorage.setItem("app-pw", password);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-password": password },
        body: JSON.stringify({ image: source, size, quality, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request gagal (${res.status})`);
      setResult(data.image);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setLoading(false);
    }
  };

  const [w, h] = size.split("x").map(Number);
  const tileH = Math.round((tile * h) / w);
  const seamLine = "rgba(108,143,203,.95)";

  return (
    <div className="shell">
      <header className="top">
        <h1>Fabric to Seamless</h1>
        <p>Upload hasil scan kain. AI meratakannya menjadi tekstur repeat tanpa sambungan.</p>
      </header>

      <main className="grid">
        <section className="panel">
          <div
            className={`drop ${dragOver ? "over" : ""} ${source ? "filled" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files[0]);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          >
            {source ? (
              <img src={source} alt="Scan kain" />
            ) : (
              <span>
                Tarik file scan ke sini
                <small>atau klik untuk memilih · PNG, JPG, WebP</small>
              </span>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
          {fileName && <p className="file">{fileName}</p>}

          <div className="fields">
            <label>
              Ukuran hasil
              <select value={size} onChange={(e) => setSize(e.target.value as Size)}>
                <option value="1024x1024">Persegi 1024×1024</option>
                <option value="1536x1024">Landscape 1536×1024</option>
                <option value="1024x1536">Portrait 1024×1536</option>
              </select>
            </label>
            <label>
              Kualitas
              <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}>
                <option value="low">Low (cepat, murah)</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="auto">Auto</option>
              </select>
            </label>
          </div>

          <label className="block">
            Catatan tambahan (opsional)
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: pertahankan garis stripe diagonal, warna navy lebih pekat"
            />
          </label>

          <label className="block">
            Password akses
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kosongkan jika tidak diatur"
            />
          </label>

          <button className="go" disabled={!source || loading} onClick={generate}>
            {loading ? "Memproses… bisa sampai 1–2 menit" : "Buat tekstur seamless"}
          </button>
          {error && <p className="err" role="alert">{error}</p>}
        </section>

        <section className="panel out">
          <div className="bar">
            <div className="seg" role="tablist">
              <button className={view === "tiled" ? "on" : ""} onClick={() => setView("tiled")}>
                Repeat
              </button>
              <button className={view === "single" ? "on" : ""} onClick={() => setView("single")}>
                Satu tile
              </button>
            </div>
            {result && (
              <a className="dl" href={result} download="seamless-texture.jpg">
                Unduh
              </a>
            )}
          </div>

          <div className="stage">
            {loading && <div className="loading">Menenun tekstur…</div>}
            {!result && !loading && <p className="empty">Hasil akan tampil di sini.</p>}
            {result && view === "single" && <img className="single" src={result} alt="Tekstur seamless" />}
            {result && view === "tiled" && (
              <div
                className="tiled"
                style={{
                  backgroundImage: `url(${result})`,
                  backgroundSize: `${tile}px ${tileH}px`,
                }}
              >
                {seams && (
                  <div
                    className="seams"
                    style={{
                      backgroundImage: `linear-gradient(to right, ${seamLine} 1px, transparent 1px), linear-gradient(to bottom, ${seamLine} 1px, transparent 1px)`,
                      backgroundSize: `${tile}px ${tileH}px`,
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {result && view === "tiled" && (
            <div className="tools">
              <label>
                Ukuran tile
                <input type="range" min={100} max={500} value={tile} onChange={(e) => setTile(+e.target.value)} />
              </label>
              <label className="check">
                <input type="checkbox" checked={seams} onChange={(e) => setSeams(e.target.checked)} />
                Tampilkan garis sambungan
              </label>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
