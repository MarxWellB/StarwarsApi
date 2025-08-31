import { useEffect, useMemo, useRef, useState } from "react";
import "./app.css";

/** ===== Config ===== */
const API_BASE = "https://swapi.py4e.com/api/"; // mirror para evitar errores de certificado
const CACHE_KEY = "swapi_cache_v1";

/** ===== Cache simple (memoria + localStorage) ===== */
const cache = new Map();
try {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw) for (const [k, v] of JSON.parse(raw)) cache.set(k, v);
} catch {}
const persist = () => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify([...cache.entries()])); } catch {}
};

/** ===== Helpers ===== */
function httpsify(u) {
  try {
    if (typeof u !== "string") return u;
    return u
      .replace(/^http:\/\//, "https://")
      .replace("swapi.dev/api/", "swapi.py4e.com/api/");
  } catch { return u; }
}

async function fetchJson(url, { revalidate = false } = {}) {
  url = httpsify(url);
  if (!revalidate && cache.has(url)) return cache.get(url).data;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, { data, ts: Date.now() });
  persist();
  return data;
}
async function prefetch(url) { try { await fetchJson(url, { revalidate: true }); } catch {} }

const SWAPI = {
  peoplePage(page = 1, q = "") {
    const u = new URL(API_BASE + "people/");
    if (q.trim()) u.searchParams.set("search", q.trim());
    u.searchParams.set("page", String(page));
    return u.toString();
  },
};

function useDebounced(value, delay = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

/** ===== Componente principal ===== */
export default function SwapiRelationalExplorer() {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const [pageUrl, setPageUrl] = useState(SWAPI.peoplePage(1));
  const [list, setList] = useState({ results: [], next: null, previous: null, count: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedUrl, setSelectedUrl] = useState(null);
  const [detail, setDetail] = useState(null);

  const listRef = useRef(null);

  // Actualiza la página cuando cambia la búsqueda (con debounce)
  useEffect(() => { setPageUrl(SWAPI.peoplePage(1, debounced)); }, [debounced]);

  // Carga la lista
  useEffect(() => {
    let abort = false;
    setLoading(true); setError("");
    fetchJson(pageUrl, { revalidate: true })
      .then((data) => {
        if (!abort) setList({
          results: data.results ?? [],
          next: data.next,
          previous: data.previous,
          count: data.count ?? 0,
        });
      })
      .catch((e) => { if (!abort) setError(e.message || "Error desconocido"); })
      .finally(() => { if (!abort) setLoading(false); });
    return () => { abort = true; };
  }, [pageUrl]);

  // Prefetch en hover
  const handleHover = (personUrl) => {
    if (!personUrl) return;
    prefetch(personUrl);
    const p = cache.get(httpsify(personUrl))?.data;
    if (p) {
      if (p.homeworld) prefetch(p.homeworld);
      (p.films || []).slice(0, 3).forEach((f) => prefetch(f));
    }
  };

  // Carga detalle y relaciones cuando hay selección
  useEffect(() => {
    let abort = false;
    if (!selectedUrl) { setDetail(null); return; }
    (async () => {
      try {
        const person = await fetchJson(selectedUrl, { revalidate: true });
        const homeworldP = person.homeworld ? fetchJson(person.homeworld).catch(() => null) : Promise.resolve(null);
        const filmsP = Promise.all((person.films || []).map((f) => fetchJson(f).catch(() => null)));
        const starshipsP = Promise.all((person.starships || []).map((s) => fetchJson(s).catch(() => null)));
        const [homeworld, films, starships] = await Promise.all([homeworldP, filmsP, starshipsP]);

        const coCharUrls = Array.from(new Set(
          (films || []).filter(Boolean).flatMap((film) => film.characters || []).filter((u) => u && u !== selectedUrl)
        )).slice(0, 24);

        const coCast = [];
        for (const url of coCharUrls) {
          try { const c = await fetchJson(url); coCast.push({ name: c.name, url }); } catch {}
        }

        if (!abort) {
          setDetail({
            person,
            homeworld,
            films: (films || []).filter(Boolean).sort((a, b) => a.episode_id - b.episode_id),
            starships: (starships || []).filter(Boolean),
            coCast,
          });
        }
      } catch (e) { if (!abort) setDetail({ error: e.message || "Error al cargar detalle" }); }
    })();
    return () => { abort = true; };
  }, [selectedUrl]);

  // Navegación con teclado (lista)
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handler = (e) => {
      if (!list.results.length) return;
      const items = Array.from(el.querySelectorAll("[data-person-url]"));
      const idx = items.findIndex((n) => n.getAttribute("data-person-url") === selectedUrl);
      if (e.key === "ArrowDown") {
        const next = items[Math.min(idx + 1, items.length - 1)] || items[0];
        setSelectedUrl(next.getAttribute("data-person-url"));
        next.scrollIntoView({ block: "nearest" });
      }
      if (e.key === "ArrowUp") {
        const prev = items[Math.max(idx - 1, 0)] || items[items.length - 1];
        setSelectedUrl(prev.getAttribute("data-person-url"));
        prev.scrollIntoView({ block: "nearest" });
      }
      if (e.key === "Escape") setSelectedUrl(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [list.results, selectedUrl]);

  const pageInfo = useMemo(() => {
    try { return Number(new URL(pageUrl).searchParams.get("page")) || 1; }
    catch { return 1; }
  }, [pageUrl]);

  return (
    <div className="wrap">
      {/* HERO / BUSCADOR */}
      <header className="hero">
        <h1 className="h1">SWAPI Relational Explorer</h1>
        <p className="p">Busca personas y explora sus relaciones (homeworld, films, naves, co-cast)</p>
        <div className="row row-hero">
          <input
            className="input input-hero"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca por nombre… (luke, vader, r2)"
            aria-label="Buscar personaje"
          />
          <button className="btn primary btn-hero" onClick={() => setPageUrl(SWAPI.peoplePage(1, query))} disabled={loading}>
            Buscar
          </button>
        </div>
        <p className={`status ${error ? "alert" : ""}`} role={error ? "alert" : "status"}>
          {loading ? "Cargando…" : (error ? `Error: ${error}` : `Resultados: ${list.count} · Página ${pageInfo}`)}
        </p>
      </header>

      {/* LISTA */}
      <ul ref={listRef} className="grid" aria-live="polite">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="card skeleton">
                <div style={{ flex: 1 }}>
                  <div className="skel-line" style={{ width: "60%" }}></div>
                  <div className="skel-line" style={{ width: "40%" }}></div>
                </div>
                <div className="skel-btn" />
              </li>
            ))
          : list.results.map((p) => (
              <li
                key={p.url}
                data-person-url={p.url}
                className={`card ${selectedUrl === p.url ? "is-active" : ""}`}
                onMouseEnter={() => handleHover(p.url)}
                onFocus={() => handleHover(p.url)}
              >
                <div>
                  <h3>{p.name}</h3>
                  <div className="small">
                    Altura: {p.height} cm · Género:
                    <span style={{ textTransform: "capitalize" }}> {p.gender}</span>
                  </div>
                </div>
                <button className="btn" onClick={() => setSelectedUrl(p.url)} aria-label={`Ver detalle de ${p.name}`}>
                  Detalle
                </button>
              </li>
            ))}
      </ul>

      {/* PAGINACIÓN */}
      <nav className="toolbar">
        <button className="btn" onClick={() => list.previous && setPageUrl(list.previous)} disabled={!list.previous || loading}>← Anterior</button>
        <span className="small">Página {pageInfo} · Total: {list.count}</span>
        <button className="btn" onClick={() => list.next && setPageUrl(list.next)} disabled={!list.next || loading}>Siguiente →</button>
      </nav>

      {/* DRAWER de detalle (aparece solo al seleccionar) */}
      <DetailDrawer
        open={!!selectedUrl}
        detail={detail}
        onClose={() => setSelectedUrl(null)}
      />
    </div>
  );
}

/** ===== Drawer / tarjeta lateral ===== */
function DetailDrawer({ open, detail, onClose }) {
  // cierra con Escape también
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      <div className={`backdrop ${open ? "is-open" : ""}`} onClick={onClose} />
      <aside className={`drawer ${open ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-label="Detalle del personaje">
        <div className="drawer-header">
          <strong>Detalle</strong>
          <button className="btn btn-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        {!open ? null : !detail ? (
          <div>
            <div className="skel-line" style={{ width: "70%" }}></div>
            <div className="skel-line" style={{ width: "50%" }}></div>
            <div className="skel-line" style={{ width: "60%" }}></div>
          </div>
        ) : detail.error ? (
          <p className="small alert" role="alert">{detail.error}</p>
        ) : (
          <div>
            <h3 style={{ margin: "0 0 6px" }}>{detail.person.name}</h3>
            <p className="small">
              Nacimiento: {detail.person.birth_year} · Masa: {detail.person.mass} · Ojos: {detail.person.eye_color}
            </p>

            {detail.homeworld && (
              <section>
                <h4 className="sec">Homeworld</h4>
                <p className="small">{detail.homeworld.name}</p>
              </section>
            )}

            <section>
              <h4 className="sec">Films ({detail.films.length})</h4>
              <ul className="list">
                {detail.films.map((f) => (
                  <li key={f.url}><b>Ep. {f.episode_id}</b>: {f.title} <span className="small">({new Date(f.release_date).getFullYear()})</span></li>
                ))}
              </ul>
            </section>

            <section>
              <h4 className="sec">Starships ({detail.starships.length})</h4>
              {detail.starships.length ? (
                <ul className="list">
                  {detail.starships.map((s) => (
                    <li key={s.url}>{s.name} — <span className="small">{s.model}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="small">No registra naves.</p>
              )}
            </section>

            <section>
              <h4 className="sec">Co-cast</h4>
              {detail.coCast.length ? (
                <div className="chips">
                  {detail.coCast.map((c) => (
                    <button
                      key={c.url}
                      className="chip"
                      onMouseEnter={() => prefetch(c.url)}
                      onFocus={() => prefetch(c.url)}
                      onClick={() => { /* navegar dentro del drawer */ window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="small">No hay co-cast relevantes.</p>
              )}
            </section>
          </div>
        )}
      </aside>
    </>
  );
}
