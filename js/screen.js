import { ready, auth, db, signInAnonymously, onAuthStateChanged, doc, onSnapshot, $, esc, params, until } from "./fb.js";

const s = $("s"), code = (params.get("g") || "").toUpperCase();
let game = null, tick = null;
const join = location.origin + location.pathname.replace(/screen\.html$/, "") + `?g=${code}`;
const qrSvg = () => { try { const q = qrcode(0, "M"); q.addData(join); q.make(); return q.createSvgTag({ cellSize: 6, margin: 0 }); } catch { return ""; } };

function render() {
  clearInterval(tick);
  const g = game, ph = g.phase;
  const head = (sub = "") => `<div class="hd"><div><h1 class="slab">${esc(g.title || "Pubquiz")}</h1>${sub ? `<div class="rn">${sub}</div>` : ""}</div>${ph !== "lobby" && ph !== "final" ? `<div class="qr mini">${qrSvg()}</div>` : ""}</div>`;
  if (ph === "lobby") {
    s.innerHTML = `${head()}<div class="lobby"><div class="qr">${qrSvg()}</div><div><p style="font-size:clamp(18px,2vw,30px);margin:0">QR-Code scannen oder Code eingeben:</p><div class="slab code">${esc(code)}</div><p class="url">${esc(join)}</p>
      <div class="names">${(g.teamNames || []).map(n => `<span>${esc(n)}</span>`).join("")}</div>${(g.teamNames || []).length ? `<p class="rn">${g.teamNames.length} Teams sind dabei</p>` : ""}</div></div>`;
    return;
  }
  const rsub = g.roundIdx >= 0 ? `Runde ${g.roundIdx + 1} von ${g.roundCount}: ${esc(g.roundName)}` : "";
  if (ph === "question" || ph === "answering" || ph === "locked") {
    const qs = g.questions || [], q = qs[qs.length - 1];
    let body = "";
    if (ph === "locked") body = `<div class="q"><div class="txt slab">Runde geschlossen.</div><div class="rn">Die Antworten werden ausgewertet.</div></div>`;
    else if (ph === "answering") body = `<div class="q"><div class="lab">Antwortzeit</div><div class="tm slab" id="tm"></div><div class="rn">${qs.length} ${qs.length === 1 ? "Frage" : "Fragen"} auf euren Handys. Ändern geht bis zum Ende der Zeit.</div></div>`;
    else if (!q) body = `<div class="q"><div class="txt slab">Gleich geht's los…</div></div>`;
    else if (q.type === "music") body = `<div class="q"><div class="lab">Lied ${q.n}</div><div class="txt slab">Interpret und Titel?</div></div>`;
    else body = `<div class="q"><div class="lab">${q.type === "estimate" ? "Schätzfrage" : `Frage ${q.n}`}</div><div class="txt">${esc(q.text)}</div>${q.type === "mc" ? `<div class="op">${q.options.map((o, k) => `<div><b>${"abcdefgh"[k]}</b>${esc(o)}</div>`).join("")}</div>` : ""}</div>`;
    s.innerHTML = head(rsub) + body;
    if (ph === "answering") { const upd = () => { const l = g.deadline - Date.now(); $("tm").textContent = l > 0 ? until(l) : "Zeit ist um!"; }; upd(); tick = setInterval(upd, 250); }
    return;
  }
  const rows = g.board || [];
  const hidden = ph === "final" ? Math.max(0, rows.length - (g.reveal || 0)) : 0;
  s.innerHTML = head(ph === "final" ? "Siegerehrung" : `Stand nach Runde ${g.boardRound + 1} von ${g.roundCount}`) +
    `<ol>${rows.map((r, i) => `<li class="${r.place === 1 && r.total > 0 ? "first" : ""}${i < hidden ? " hid" : ""}"><span class="slab" style="text-align:center">${r.place}.</span><span class="slab" style="overflow-wrap:anywhere">${esc(r.name)}</span><span class="slab">${r.total}</span></li>`).join("")}</ol>`;
}

if (!code) s.innerHTML = `<p>Kein Spiel-Code in der Adresse.</p>`;
else if (!ready) s.innerHTML = `<p>Die App ist noch nicht mit Firebase verbunden.</p>`;
else onAuthStateChanged(auth, u => {
  if (!u) { signInAnonymously(auth).catch(() => s.innerHTML = "<p>Keine Verbindung.</p>"); return; }
  if (game !== null) return;
  game = {};
  onSnapshot(doc(db, "games", code), snap => { if (!snap.exists()) { s.innerHTML = "<p>Dieses Spiel gibt es nicht.</p>"; return; } game = snap.data(); render(); });
});
