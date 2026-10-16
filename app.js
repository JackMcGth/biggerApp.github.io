const ENDPOINT = "https://itunes.apple.com/search";
const form = document.getElementById("search-form");
const input = document.getElementById("lyrics");
const goBtn = document.getElementById("go");
const statusEl = document.getElementById("status");
const list = document.getElementById("results");
let audio = null, playingBtn = null;

const tokens = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);

// Build several query variants: the whole phrase (trimmed) plus short sliding windows.
function buildQueries(text) {
  const words = tokens(text);
  const queries = new Set([words.slice(0, 8).join(" ")]);
  const size = words.length > 6 ? 4 : 3;
  for (let i = 0; i + size <= words.length && queries.size < 7; i += Math.max(1, Math.floor(size / 2) + 1)) {
    queries.add(words.slice(i, i + size).join(" "));
  }
  return [...queries].filter(Boolean);
}

// fetch first (iTunes allows CORS), JSONP as a fallback
async function itunes(term) {
  const params = new URLSearchParams({ term, media: "music", entity: "song", limit: "25" });
  try {
    const res = await fetch(`${ENDPOINT}?${params}`);
    if (!res.ok) throw new Error(res.status);
    return (await res.json()).results || [];
  } catch {
    return new Promise((resolve) => {
      const cb = "itunes_cb_" + Math.random().toString(36).slice(2);
      const s = document.createElement("script");
      window[cb] = (data) => { resolve(data.results || []); s.remove(); delete window[cb]; };
      s.onerror = () => { resolve([]); s.remove(); };
      s.src = `${ENDPOINT}?${params}&callback=${cb}`;
      document.head.append(s);
    });
  }
}

async function findSongs(text) {
  const lyricWords = new Set(tokens(text));
  const queries = buildQueries(text);
  const batches = await Promise.all(queries.map(itunes));
  const merged = new Map();
  batches.forEach((songs) => songs.forEach((s) => {
    const entry = merged.get(s.trackId) || { song: s, hits: 0 };
    entry.hits++;
    merged.set(s.trackId, entry);
  }));
  return [...merged.values()].map(({ song, hits }) => {
    const hay = new Set(tokens(`${song.trackName} ${song.artistName} ${song.collectionName || ""}`));
    let overlap = 0;
    lyricWords.forEach((w) => hay.has(w) && overlap++);
    return { song, score: hits * 2 + (overlap / Math.max(lyricWords.size, 1)) * 10 };
  }).sort((a, b) => b.score - a.score).slice(0, 20).map((r) => r.song);
}

function render(songs) {
  list.replaceChildren(...songs.map((s) => {
    const li = document.createElement("li");
    li.className = "song";
    const img = Object.assign(document.createElement("img"), {
      src: (s.artworkUrl100 || "").replace("100x100", "200x200"), alt: "", loading: "lazy" });
    const info = document.createElement("div");
    const h = document.createElement("h2"); h.textContent = s.trackName;
    const p = document.createElement("p"); p.textContent = `${s.artistName} — ${s.collectionName || "Single"}`;
    info.append(h, p);
    if (s.trackViewUrl) {
      const a = Object.assign(document.createElement("a"), {
        href: s.trackViewUrl, target: "_blank", rel: "noopener", textContent: "Open in Apple Music" });
      info.append(a);
    }
    li.append(img, info);
    if (s.previewUrl) {
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: "Play preview" });
      b.addEventListener("click", () => togglePreview(b, s.previewUrl));
      li.append(b);
    }
    return li;
  }));
}

function togglePreview(btn, url) {
  if (audio) { audio.pause(); playingBtn.textContent = "Play preview"; }
  if (playingBtn === btn) { audio = playingBtn = null; return; }
  audio = new Audio(url); playingBtn = btn;
  btn.textContent = "Stop preview";
  audio.play();
  audio.addEventListener("ended", () => { btn.textContent = "Play preview"; audio = playingBtn = null; });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  goBtn.disabled = true; list.replaceChildren();
  statusEl.textContent = "Searching…";
  try {
    const songs = await findSongs(text);
    statusEl.textContent = songs.length
      ? `${songs.length} possible songs, best matches first.`
      : "No songs found. Try a different line, or the words from the chorus.";
    render(songs);
  } catch {
    statusEl.textContent = "The search failed. Check your connection and try again.";
  } finally { goBtn.disabled = false; }
});
