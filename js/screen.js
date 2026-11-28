import { ready, auth, db, signInAnonymously, onAuthStateChanged, doc, onSnapshot, $, esc, params, until, hydrate } from "./fb.js?v=20261128a";
import { confetti } from "./fx.js?v=20261128a";

const s = $("s"), code = (params.get("g") || "").toUpperCase();
let owner = null, game = null, tick = null, animKey = "", solKey = "", partyKey = "";
const join = location.origin + location.pathname.replace(/screen\.html$/, "") + `?g=${code}`;
const qrSvg = () => { try { const q = qrcode(0, "M"); q.addData(join); q.make(); return q.createSvgTag({ cellSize: 6, margin: 0 }); } catch { return ""; } };

// Passt der Inhalt nicht auf die Bühne (viele Teams, lange Fragen), wird er etwas verkleinert
function fit() {
  const c = [...s.children].find(x => !x.classList.contains("hd") && !x.classList.contains("drumov")); if (!c) return;
  c.style.zoom = ""; let z = 1;
  while (s.scrollHeight > s.clientHeight + 1 && z > .5) { z -= .05; c.style.zoom = z; }
}
function render() { draw(); fit(); }
s.addEventListener("load", () => fit(), true);
function draw() {
  clearInterval(tick);
  const g = game, ph = g.phase;
  const logo = big => `<div class="logo${big ? " big" : ""}" role="img" aria-label="Kolties QuizKasten"><div class="in"><span class="l1">Kolties</span><span class="l2">QuizKasten</span></div></div>`;
  const head = (sub = "") => `<div class="hd"><div class="row2" style="gap:24px">${logo(false)}${sub ? `<div class="rn">${sub}</div>` : ""}</div>${ph !== "lobby" && ph !== "final" ? `<div class="qr mini">${qrSvg()}</div>` : ""}</div>`;
  const pic = cls => `<img class="host-pic ${cls}" src="img/kolti.webp" alt="Quizmaster Kolti">`;
  if (ph === "lobby") {
    s.innerHTML = `<div class="lobby"><div class="stack" style="gap:44px"><div>${logo(true)}</div>${g.title ? `<div class="rn">${esc(g.title)}</div>` : ""}
      <div class="join"><div class="qr">${qrSvg()}</div><div><p style="font-size:30px;margin:0;font-weight:600">QR-Code scannen oder Code eingeben:</p><div class="code">${esc(code)}</div><p class="url">${esc(join)}</p></div></div>
      <div><div class="names">${(g.teamNames || []).map(n => `<span>${esc(n)}</span>`).join("")}</div>${(g.teamNames || []).length ? `<p class="rn">${g.teamNames.length} ${g.teamNames.length === 1 ? "Team ist" : "Teams sind"} dabei</p>` : `<p class="rn">Wer traut sich als Erstes?</p>`}</div></div>
      <div class="stage spot">${pic("")}</div></div>`;
    return;
  }
  const rsub = g.roundIdx >= 0 ? `Runde ${g.roundIdx + 1} von ${g.roundCount}: ${esc(g.roundName)}` : "";
  const pl = g.playing;
  if ((ph === "question" || ph === "answering") && pl && pl.until > Date.now()) {
    const bars = Array.from({ length: 28 }, (_, i) => `<i style="animation-delay:${(-((i * 37) % 100) / 100).toFixed(2)}s;animation-duration:${(0.55 + ((i * 13) % 7) / 10).toFixed(2)}s"></i>`).join("");
    s.innerHTML = head(`Runde ${g.roundIdx + 1} von ${g.roundCount}: ${esc(g.roundName)}`) + `<div class="onair"><div class="lab">Lied ${pl.n}</div>
      <div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="bg"/><circle cx="60" cy="60" r="54" class="fg" id="arc"/></svg><span id="cd"></span></div>
      <div class="eq" aria-hidden="true">${bars}</div><div class="rn">Musik läuft: Interpret und Titel?</div></div>`;
    const total = 10000, arc = $("arc"), C = 2 * Math.PI * 54;
    arc.style.strokeDasharray = C;
    const upd = () => { const l = pl.until - Date.now(); if (l <= 0) { clearInterval(tick); render(); return; } $("cd").textContent = Math.ceil(l / 1000); arc.style.strokeDashoffset = C * (1 - Math.min(1, l / total)); };
    upd(); tick = setInterval(upd, 100);
    return;
  }
  if (ph === "question" || ph === "answering" || ph === "locked") {
    const qs = g.questions || [], q = qs.find(x => x.id === g.currentId) || qs[qs.length - 1];
    let body = "";
    if (ph === "locked") body = `<div class="withpic"><div class="q"><div class="lab">Stifte weg!</div><div class="txt">Runde geschlossen.</div><div class="rn">Kolti wertet aus, gleich gibt's den Zwischenstand.</div></div><div class="spot">${pic("")}</div></div>`;
    else if (ph === "answering") {
      const nT = (g.teamNames || []).length, nA = Math.min(nT, g.answered || 0);
      body = `<div class="q" id="aq"><div class="lab">Antwortzeit</div><div class="tm slab" id="tm"></div><div class="rn">${qs.length} ${qs.length === 1 ? "Frage" : "Fragen"} auf euren Handys. Ändern geht bis zum Ende der Zeit.</div>
        ${nT ? `<div class="got"><div class="dots">${Array.from({ length: nT }, (_, i) => `<i class="${i < nA ? "on" : ""}"></i>`).join("")}</div><div class="rn"><b>${nA} von ${nT}</b> Teams haben schon geantwortet</div></div>` : ""}</div>`;
    }
    else if (!q) body = `<div class="q"><div class="lab">Runde ${g.roundIdx + 1}</div><div class="txt">${esc(g.roundName)}</div><div class="rn">Gleich geht's los…</div></div>${pic("corner")}`;
    else if (q.type === "music") body = `<div class="q"><div class="lab">Lied ${q.n}</div><div class="txt">Ohren auf: Interpret und Titel?</div></div>`;
    else body = `<div class="q${q.img ? " hasimg" : ""}"><div class="qt"><div class="lab">${q.type === "estimate" ? "Schätzfrage" : `Frage ${q.n}`}</div><div class="txt">${esc(q.text)}</div>${q.type === "mc" ? `<div class="op">${q.options.map((o, k) => `<div><b>${"abcdefgh"[k]}</b>${esc(o)}</div>`).join("")}</div>` : ""}</div>${q.img ? `<img class="qimg" data-img="${esc(q.img)}" alt="Bild zur Frage">` : ""}</div>`;
    s.innerHTML = head(rsub) + body;
    hydrate(s, code, owner);
    if (ph === "answering") { const upd = () => { const l = g.deadline - Date.now(), hot = l > 0 && l <= 10000; $("aq").classList.toggle("last10", hot); $("tm").textContent = hot ? Math.ceil(l / 1000) : l > 0 ? until(l) : "Zeit ist um!"; $("aq").classList.toggle("over", l <= 0 && !!g.deadline); }; upd(); tick = setInterval(upd, 100); }
    return;
  }
  if (ph === "solve") return solve(g, head(rsub));
  const rows = g.board || [];
  const hidden = ph === "final" ? Math.max(0, rows.length - (g.reveal || 0)) : 0;
  s.innerHTML = head(ph === "final" ? "Siegerehrung" : `Stand nach Runde ${g.boardRound + 1} von ${g.roundCount}`) +
    `<div class="withpic"><ol id="rk">${rows.map((r, i) => `<li data-pi="${r.pi ?? i}" class="${r.place === 1 && r.total > 0 ? "first" : ""}${i < hidden ? " hid" : ""}"><span class="slab" style="text-align:center">${r.place}.</span><span class="nm">${esc(r.name)}${r.joker ? ` <span class="jk" title="Joker">🃏×2</span>` : ""}${ph === "results" ? arrow(r) : ""}</span><span class="slab pts" data-from="${r.prevTotal ?? r.total}" data-to="${r.total}">${r.total}</span></li>`).join("")}</ol>${ph === "final" ? `<div class="spot">${pic("")}</div>` : ""}</div>${g.drum ? `<div class="drumov"><div>🥁</div><p>Und der Sieger ist…</p></div>` : ""}`;
  if (ph === "results") { const k = code + g.boardRound + JSON.stringify(rows); if (animKey !== k) { animKey = k; climb(); } }
  if (ph === "final" && !hidden && rows.length && !g.drum && partyKey !== code + "final") { partyKey = code + "final"; confetti(12000); }
}

const arrow = r => r.prev === undefined || r.prev === r.place ? "" : r.prev > r.place ? `<span class="mv up">▲ ${r.prev - r.place}</span>` : `<span class="mv down">▼ ${r.place - r.prev}</span>`;

// Rangliste fährt vom alten in den neuen Stand, Punkte zählen hoch
function climb() {
  const ol = $("rk"); if (!ol || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const li = [...ol.children]; if (li.length < 1) return;
  const step = li.length > 1 ? li[1].offsetTop - li[0].offsetTop : li[0].offsetHeight;
  li.forEach((el, i) => { el.style.transition = "none"; el.style.transform = `translateY(${(+el.dataset.pi - i) * step}px)`; });
  ol.classList.add("anim"); void ol.offsetHeight;
  setTimeout(() => li.forEach(el => { el.style.transition = "transform 1.6s cubic-bezier(.2,.8,.2,1)"; el.style.transform = ""; }), 700);
  const pts = li.map(el => el.querySelector(".pts")), t0 = performance.now() + 700;
  pts.forEach(p => p.textContent = p.dataset.from);
  (function count(now) {
    const k = Math.max(0, Math.min(1, (now - t0) / 1600));
    pts.forEach(p => p.textContent = Math.round(+p.dataset.from + (+p.dataset.to - +p.dataset.from) * k));
    if (k < 1) requestAnimationFrame(count); else ol.classList.remove("anim");
  })(performance.now());
}

// Auflösung einer Frage mit Statistik
function solve(g, header) {
  const so = g.sol || {}, key = `${so.idx}-${so.shown}`, fresh = solKey !== key; solKey = key;
  const pct = (n, of) => of ? Math.round(100 * n / of) : 0;
  let body = "";
  if (so.type === "mc") body = `<div class="op sol">${(so.options || []).map((o, k) => `<div class="${so.shown && k === so.correct ? "right" : so.shown ? "wrong" : ""}"><span class="bar" style="--w:${so.shown ? pct(so.picks?.[k] || 0, so.of) : 0}%"></span><b>${"abcdefgh"[k]}</b><span class="ot">${esc(o)}</span>${so.shown ? `<span class="cnt">${so.picks?.[k] || 0}</span>` : ""}</div>`).join("")}</div>`;
  else if (so.type === "music") body = so.shown ? `<div class="big-ans">${esc(so.a)} – ${esc(so.b)}</div><div class="stats"><div><span>Interpret</span><span class="meter"><i style="--w:${pct(so.parts?.[0] || 0, so.of)}%"></i></span><b>${so.parts?.[0] || 0} von ${so.of}</b></div><div><span>Titel</span><span class="meter"><i style="--w:${pct(so.parts?.[1] || 0, so.of)}%"></i></span><b>${so.parts?.[1] || 0} von ${so.of}</b></div></div>` : `<div class="rn">Wer hat's erkannt?</div>`;
  else if (so.type === "estimate") body = numberLine(so);
  else body = so.shown ? `<div class="big-ans">${esc(so.answer)}</div>` : `<div class="rn">Was meint ihr?</div>`;
  const okLine = so.shown && so.type !== "estimate" && so.type !== "music" ? `<div class="stats"><div><span>Richtig</span><span class="meter"><i style="--w:${pct(so.ok, so.of)}%"></i></span><b>${so.ok} von ${so.of}</b></div></div>` : "";
  s.innerHTML = header + `<div class="q solve${so.img ? " hasimg" : ""}${fresh ? " fresh" : ""}"><div class="qt"><div class="lab">Auflösung · ${esc(so.label || "")}</div>${so.text ? `<div class="txt">${esc(so.text)}</div>` : ""}${body}${okLine}</div>${so.img ? `<img class="qimg" data-img="${esc(so.img)}" alt="Bild zur Frage">` : ""}</div>`;
  hydrate(s, code, owner);
  // Balken wachsen lassen
  const bars = s.querySelectorAll(".bar,.meter i,.pin,.truth");
  if (fresh) { bars.forEach(b => b.classList.add("pre")); requestAnimationFrame(() => requestAnimationFrame(() => bars.forEach(b => b.classList.remove("pre")))); }
}

function numberLine(so) {
  const gs = (so.guesses || []).slice().sort((a, b) => a.v - b.v);
  if (!gs.length) return so.shown ? `<div class="big-ans">${esc(so.answer)}</div><div class="rn">Keine Schätzungen abgegeben.</div>` : `<div class="rn">Keine Schätzungen abgegeben.</div>`;
  const vals = gs.map(x => x.v).concat(so.shown && so.answer !== null ? [so.answer] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals); if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * .08; lo -= pad; hi += pad;
  const x = v => ((v - lo) / (hi - lo) * 100).toFixed(2);
  const fmt = v => (+v).toLocaleString("de-DE", { maximumFractionDigits: 2 });
  const best = so.shown && so.answer !== null ? Math.min(...gs.map(t => Math.abs(t.v - so.answer))) : null;
  return `<div class="nl"><div class="axis"></div>${gs.map((t, i) => `<div class="pin ${i % 2 ? "dn" : "upr"}${best !== null && Math.abs(t.v - so.answer) === best ? " best" : ""}" style="left:${x(t.v)}%;transition-delay:${(i * .12).toFixed(2)}s"><span class="pn">${esc(t.name)}</span><span class="pv">${fmt(t.v)}</span></div>`).join("")}
    ${so.shown && so.answer !== null ? `<div class="truth" style="left:${x(so.answer)}%"><span>Lösung: ${fmt(so.answer)}</span></div>` : ""}</div>
    <div class="rn">${so.shown ? `Am nächsten dran: <b>${esc(gs.filter(t => Math.abs(t.v - so.answer) === best).map(t => t.name).join(", "))}</b>` : `${gs.length} Schätzungen. Wo liegt die Lösung?`}</div>`;
}

// Beamer-Vorschau für die Generalprobe: Daten kommen direkt aus dem Moderations-Fenster
if (params.has("preview")) {
  s.innerHTML = `<div class="q"><div class="lab">Beamer-Vorschau</div><div class="txt">Wähle in der Generalprobe eine Frage aus.</div></div>`;
  const ch = new BroadcastChannel("pq-probe");
  ch.onmessage = e => { if (!e.data?.game) return; owner = e.data.owner || null; game = e.data.game; render(); };
  ch.postMessage({ hello: true });
}
else if (!code) s.innerHTML = `<p>Kein Spiel-Code in der Adresse.</p>`;
else if (!ready) s.innerHTML = `<p>Die App ist noch nicht mit Firebase verbunden.</p>`;
else onAuthStateChanged(auth, u => {
  if (!u) { signInAnonymously(auth).catch(() => s.innerHTML = "<p>Keine Verbindung.</p>"); return; }
  if (game !== null) return;
  game = {};
  onSnapshot(doc(db, "games", code), snap => { if (!snap.exists()) { s.innerHTML = "<p>Dieses Spiel gibt es nicht.</p>"; return; } game = snap.data(); render(); });
});
