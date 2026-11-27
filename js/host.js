import { ready, auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, getDocs, $, esc, keepEmu, until, hydrate, imgSrc } from "./fb.js?v=20261127j";
import * as fx from "./fx.js?v=20261127j";
import { docxToQuiz, uid } from "./importer.js?v=20261127j";
import { slots, counts, suggest, answerText, rightText, roundPoints, total, ranking } from "./scoring.js?v=20261127j";

const app = $("app");
const toast = m => { const t = $("toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", 3500); };
const LSG = "pq-host-game";
let user = null, quizzes = [], editing = null, editT = null;
// Live-Spiel
let code = null, game = null, hs = null, teams = [], allTeams = [], raw = {}, subs = [], hsT = null, tick = null, view = "round", lastSec = null, gonged = 0;
document.addEventListener("pointerdown", () => fx.unlock(), true);

// ---------- Anmeldung ----------
function login(msg = "") {
  $("topacts").innerHTML = "";
  app.innerHTML = `<form class="panel stack narrow" id="lf"><h2 class="slab big">Anmelden</h2>
    <p class="hint">Nur für den Moderator. Das Konto legst du einmal in der Firebase-Konsole an (Authentication → Nutzer hinzufügen).</p>
    <label>E-Mail<input id="em" type="email" autocomplete="username"></label>
    <label>Passwort<input id="pw" type="password" autocomplete="current-password"></label>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ""}<button class="main">Anmelden</button></form>`;
  $("lf").addEventListener("submit", async e => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, $("em").value.trim(), $("pw").value); }
    catch { login("E-Mail oder Passwort stimmt nicht."); }
  });
}

// ---------- Quiz-Liste ----------
async function home() {
  stopLive(); probe = null;
  $("topacts").innerHTML = `<button id="out">Abmelden</button>`;
  $("out").onclick = () => signOut(auth);
  const snap = await getDocs(collection(db, "users", user.uid, "quizzes"));
  quizzes = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const last = localStorage.getItem(LSG);
  app.innerHTML = `<div class="grid2">
    <section class="panel stack"><h2 class="slab big">Deine Quizze</h2>
      ${quizzes.length ? quizzes.map(q => `<div class="card row2" style="justify-content:space-between"><div><b>${esc(q.title)}</b><br><span class="hint">${q.rounds.length} Runden · ${q.rounds.reduce((a, r) => a + r.items.length, 0)} Fragen</span></div>
        <div class="row2"><button data-edit="${esc(q.id)}">Bearbeiten</button><button class="main" data-start="${esc(q.id)}">Abend starten</button></div></div>`).join("") : `<p class="hint">Noch keine Quizze. Importiere dein Word-Skript oder leg ein leeres an.</p>`}
    </section>
    <section class="panel stack"><h2 class="slab big">Neues Quiz</h2>
      <label>Word-Skript (.docx) importieren<input type="file" id="file" accept=".docx"></label>
      <p class="hint">Format wie bisher: „RUNDE 1: Thema“, nummerierte Fragen, Antworten a) b) c) d). Die <b>fett</b> gedruckte Antwort gilt als richtig. In der Musikrunde eine Zeile pro Lied: „Interpret - Titel“. Eine Zeile „Schätzfrage“ markiert die nächste Frage als Schätzfrage fürs Stechen.</p>
      <button id="blank">Leeres Quiz anlegen</button>
      ${last ? `<hr style="border:0;border-top:1px solid var(--line);width:100%"><p>Laufender Abend: <b>${esc(last)}</b></p><button class="main" id="resume">Zurück zum Abend</button>` : ""}
    </section></div>`;
  $("file").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const q = await docxToQuiz(await f.arrayBuffer(), f.name.replace(/\.docx$/i, "").replace(/_?\[\d+\]$/, "").replace(/_/g, " "));
      if (!q.rounds.length) return toast("In der Datei habe ich keine Runden gefunden.");
      const imgs = q._imgs || {}; delete q._imgs;
      const withImg = q.rounds.flatMap(r => r.items).filter(it => String(it.img || "").startsWith("docx:"));
      if (withImg.length) toast(`${withImg.length} Bilder werden hochgeladen…`);
      for (const it of withImg) { try { it.img = await storeImg(imgs[it.img.slice(5)]); } catch (err) { console.error(err); delete it.img; } }
      await saveQuiz({ ...q, id: uid() }); edit(quizzes.find(x => x.id === editing?.id) || editing);
      toast(`${q.rounds.length} Runden importiert. Bitte einmal drüberschauen.`);
    } catch (err) { console.error(err); toast("Die Datei konnte ich nicht lesen."); }
  };
  $("blank").onclick = async () => { await saveQuiz({ id: uid(), title: "Neues Quiz", rounds: Array.from({ length: 6 }, (_, i) => ({ id: uid(), name: `Runde ${i + 1}`, music: false, items: [] })) }); edit(editing); };
  app.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => edit(quizzes.find(q => q.id === b.dataset.edit)));
  app.querySelectorAll("[data-start]").forEach(b => b.onclick = () => startGame(quizzes.find(q => q.id === b.dataset.start)));
  $("resume") && ($("resume").onclick = () => openLive(last));
}

async function saveQuiz(q) {
  q.updatedAt = Date.now(); editing = q;
  const { id, ...data } = q;
  await setDoc(doc(db, "users", user.uid, "quizzes", id), JSON.parse(JSON.stringify(data)));
}

// ---------- Editor ----------
function itemEditor(it, ri, ii) {
  const k = `${ri}-${ii}`;
  const type = `<label>Art<select data-f="type" data-k="${k}">${[["mc", "Multiple Choice"], ["text", "Freie Antwort"], ["estimate", "Schätzfrage (Stechen)"], ["music", "Lied"]].map(([v, l]) => `<option value="${v}" ${it.type === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
  let body = "";
  if (it.type === "music") body = `<div class="row2"><label>Teil 1 (z. B. Interpret)<input data-f="a" data-k="${k}" value="${esc(it.a)}"></label><label>Teil 2 (z. B. Titel)<input data-f="b" data-k="${k}" value="${esc(it.b)}"></label></div>
    <div class="row2"><label style="flex:3 1 260px">Spotify-Link (Song teilen → Link kopieren)<input data-f="spotify" data-k="${k}" value="${esc(it.spotify || "")}" placeholder="https://open.spotify.com/track/…"></label><label style="flex:1 1 110px">Start bei Sekunde<input data-f="start" data-k="${k}" inputmode="numeric" value="${esc(it.start || 0)}"></label></div>
    ${it.spotify && !trackId(it.spotify) ? `<p class="err">Das ist kein Spotify-Song-Link.</p>` : ""}`;
  else {
    body = `<label>Frage<textarea data-f="text" data-k="${k}">${esc(it.text)}</textarea></label>`;
    if (it.type === "mc") body += `<div class="row2"><label style="flex:3 1 260px">Antworten (eine pro Zeile)<textarea data-f="options" data-k="${k}">${esc((it.options || []).join("\n"))}</textarea></label>
      <label style="flex:1 1 120px">Richtig<select data-f="correct" data-k="${k}"><option value="-1">–</option>${(it.options || []).map((o, i) => `<option value="${i}" ${it.correct === i ? "selected" : ""}>${"abcdefgh"[i]}) ${esc(o.slice(0, 30))}</option>`).join("")}</select></label></div>`;
    else body += `<label>Richtige Antwort${it.type === "estimate" ? " (Zahl)" : ""}<input data-f="answer" data-k="${k}" value="${esc(it.answer ?? "")}"></label>`;
    const own = String(it.img || "").startsWith("media:");
    body += `<div class="row2"><label style="flex:3 1 260px">Bild (optional): Link einfügen oder hochladen<input data-f="img" data-k="${k}" value="${esc(own ? "" : it.img || "")}" placeholder="${own ? "Hochgeladenes Bild" : "https://…/bild.jpg"}"></label>
      <label class="filebtn" style="align-self:end">Bild hochladen<input type="file" accept="image/*" data-upload="${k}"></label>${it.img ? `<button data-noimg="${k}" style="align-self:end">Bild entfernen</button>` : ""}</div>${it.img ? `<img class="thumb" data-img="${esc(it.img)}" alt="Bild zu Frage ${ii + 1}">` : ""}`;
  }
  return `<div class="card item"><div class="row2" style="justify-content:space-between"><b>${it.type === "music" ? "Lied" : "Frage"} ${ii + 1}</b><div class="row2"><button data-up="${k}" aria-label="Nach oben">↑</button><button data-delitem="${k}" aria-label="Löschen">✕</button></div></div>
    <div class="row2">${type}</div>${body}<label>Notiz für dich (sehen die Teams nicht)<input data-f="note" data-k="${k}" value="${esc(it.note || "")}"></label></div>`;
}

function edit(q) {
  editing = JSON.parse(JSON.stringify(q));
  probe = null;
  $("topacts").innerHTML = `<button id="back">Fertig</button><button id="probeB">Generalprobe</button><button class="main" id="startE">Abend starten</button>`;
  $("back").onclick = async () => { await saveQuiz(editing); home(); };
  $("probeB").onclick = async () => { await saveQuiz(editing); rehearse(); };
  $("startE").onclick = async () => { await saveQuiz(editing); startGame(editing); };
  renderEditor();
}
function renderEditor() {
  const q = editing;
  app.innerHTML = `<div class="stack">
    <div class="panel row2"><label style="flex:1">Name des Quiz<input id="qt" value="${esc(q.title)}"></label><button id="delq" class="red" style="align-self:end">Quiz löschen</button></div>
    ${q.rounds.map((r, ri) => `<section class="panel stack"><div class="row2"><label style="flex:1 1 240px">Runde ${ri + 1}<input data-rf="name" data-r="${ri}" value="${esc(r.name)}"></label>
      <label class="row2" style="color:var(--ink);align-self:end"><input type="checkbox" data-rf="music" data-r="${ri}" ${r.music ? "checked" : ""} style="width:20px;min-height:20px"> Musikrunde</label>
      <button data-delround="${ri}" style="align-self:end">Runde löschen</button></div>
      ${r.items.map((it, ii) => itemEditor(it, ri, ii)).join("")}
      <div class="row2"><button data-additem="${ri}">${r.music ? "Lied" : "Frage"} hinzufügen</button></div></section>`).join("")}
    <button id="addround">Runde hinzufügen</button></div>`;
  hydrate(app, null, user.uid);
}
// Bilder verkleinern und in Firestore ablegen (ohne extra Speicher-Dienst)
async function shrink(blob) {
  const bm = await createImageBitmap(blob), sc = Math.min(1, 1280 / Math.max(bm.width, bm.height));
  const c = document.createElement("canvas"); c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bm, 0, 0, c.width, c.height);
  for (const q of [.82, .7, .55, .4, .3]) { const d = c.toDataURL("image/jpeg", q); if (d.length < 850000) return d; }
  throw new Error("Bild zu groß");
}
async function storeImg(blob) {
  const id = uid(); await setDoc(doc(db, "users", user.uid, "media", id), { data: await shrink(blob), at: Date.now() });
  return "media:" + id;
}
function autosave() { clearTimeout(editT); editT = setTimeout(() => saveQuiz(editing).catch(() => toast("Speichern fehlgeschlagen")), 800); }
app.addEventListener("input", e => {
  if (!editing || code || probe) return;
  const el = e.target;
  if (el.id === "qt") { editing.title = el.value; return autosave(); }
  if (el.dataset.rf === "name") { editing.rounds[+el.dataset.r].name = el.value; return autosave(); }
  if (el.dataset.k && el.dataset.f !== "type" && el.dataset.f !== "correct") {
    const [ri, ii] = el.dataset.k.split("-").map(Number), it = editing.rounds[ri].items[ii];
    if (el.dataset.f === "options") it.options = el.value.split("\n").map(s => s.trim()).filter(Boolean);
    else if (el.dataset.f === "start") it.start = Math.max(0, parseInt(el.value) || 0);
    else if (el.dataset.f === "img") { it.img = el.value.trim(); clearTimeout(el.t); el.t = setTimeout(renderEditor, 1200); }
    else if (el.dataset.f === "answer" && it.type === "estimate") it.answer = el.value.trim() === "" ? null : parseFloat(el.value.replace(",", "."));
    else it[el.dataset.f] = el.value;
    autosave();
  }
});
app.addEventListener("change", async e => {
  if (!editing || code || probe) return;
  const el = e.target;
  if (el.dataset.rf === "music") { editing.rounds[+el.dataset.r].music = el.checked; autosave(); return renderEditor(); }
  if (el.dataset.upload && el.files[0]) {
    const [ri, ii] = el.dataset.upload.split("-").map(Number), it = editing.rounds[ri].items[ii];
    toast("Bild wird hochgeladen…");
    try { it.img = await storeImg(el.files[0]); autosave(); renderEditor(); toast("Bild gespeichert."); } catch (err) { console.error(err); toast("Das Bild konnte ich nicht speichern."); }
    return;
  }
  if (el.dataset.f === "type" || el.dataset.f === "correct" || el.dataset.f === "options") {
    const [ri, ii] = el.dataset.k.split("-").map(Number), it = editing.rounds[ri].items[ii];
    if (el.dataset.f === "type") { it.type = el.value; it.options ||= []; it.correct ??= -1; it.a ||= ""; it.b ||= ""; it.text ||= ""; }
    if (el.dataset.f === "correct") it.correct = +el.value;
    autosave(); renderEditor();
  }
});
app.addEventListener("click", async e => {
  if (!editing || code || probe) return;
  const b = e.target.closest("button"); if (!b) return;
  const R = editing.rounds;
  if (b.dataset.additem) { const r = R[+b.dataset.additem]; r.items.push(r.music ? { id: uid(), type: "music", a: "", b: "", note: "" } : { id: uid(), type: "mc", text: "", options: [], correct: -1, answer: "", note: "" }); }
  else if (b.dataset.delitem) { const [ri, ii] = b.dataset.delitem.split("-").map(Number); R[ri].items.splice(ii, 1); }
  else if (b.dataset.up) { const [ri, ii] = b.dataset.up.split("-").map(Number); if (ii > 0) [R[ri].items[ii - 1], R[ri].items[ii]] = [R[ri].items[ii], R[ri].items[ii - 1]]; }
  else if (b.dataset.noimg) { const [ri, ii] = b.dataset.noimg.split("-").map(Number); delete R[ri].items[ii].img; }
  else if (b.dataset.delround) { if (R[+b.dataset.delround].items.length && b.textContent !== "Wirklich löschen?") { b.textContent = "Wirklich löschen?"; return; } R.splice(+b.dataset.delround, 1); }
  else if (b.id === "addround") R.push({ id: uid(), name: `Runde ${R.length + 1}`, music: false, items: [] });
  else if (b.id === "delq") { if (b.textContent !== "Wirklich löschen?") { b.textContent = "Wirklich löschen?"; return; } await deleteDoc(doc(db, "users", user.uid, "quizzes", editing.id)); editing = null; return home(); }
  else return;
  autosave(); renderEditor();
});

// ---------- Generalprobe: Bilder prüfen, Songs anspielen, Beamer-Vorschau ----------
let probe = null, probeCh = null;
function probeSend() {
  if (!probe?.cur) return;
  const q = editing, [ri, ii] = probe.cur, r = q.rounds[ri], it = r.items[ii];
  const n = r.items.slice(0, ii + 1).filter(x => x.type !== "estimate").length;
  const pubIt = publicItem(it, n);
  const game = { phase: "question", title: q.title, roundIdx: ri, roundCount: q.rounds.length, roundName: r.name, questions: [pubIt], currentId: it.id, teamNames: [],
    playing: probe.playing && probe.playing.until > Date.now() ? probe.playing : null };
  probeCh?.postMessage({ game, owner: user.uid });
}
function rehearse() {
  const q = editing;
  probe = { img: {}, song: {}, cur: null, playing: null };
  if (!probeCh) { probeCh = new BroadcastChannel("pq-probe"); probeCh.onmessage = e => { if (e.data?.hello) probeSend(); }; }
  $("topacts").innerHTML = `<button id="probeBack">Zurück zum Editor</button><button class="main" id="startE">Abend starten</button>`;
  $("probeBack").onclick = () => { stopClip(); edit(editing); };
  $("startE").onclick = () => { stopClip(); probe = null; startGame(editing); };
  const all = q.rounds.flatMap((r, ri) => r.items.map((it, ii) => ({ r, ri, it, ii })));
  app.innerHTML = `<div class="stack">
    <section class="panel stack"><h2 class="slab big">Generalprobe</h2>
      <p class="hint">Hier spielst du das Quiz ohne Teams durch. Bilder werden automatisch geprüft, Songs spielst du einzeln an. Mit „Auf Beamer“ siehst du jede Frage in der Beamer-Vorschau.</p>
      <div class="row2"><a href="${esc(keepEmu("screen.html?preview"))}" target="_blank"><button class="main">Beamer-Vorschau öffnen</button></a><span id="psum" class="hint"></span></div></section>
    ${q.rounds.map((r, ri) => `<section class="panel stack"><h2 class="slab">Runde ${ri + 1}: ${esc(r.name)}</h2>
      ${r.items.map((it, ii) => { const k = `${ri}-${ii}`, lab = itemLabel(r, ii);
        return `<div class="script probe" id="pr-${k}"><div class="row2" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><span class="qnum">${esc(lab)}</span><span class="row2" style="flex:none"><span class="pstat" id="ps-${k}"></span><button data-pv="${k}">Auf Beamer</button></span></div>
          ${it.type === "music" ? `<b>${esc(it.a)} – ${esc(it.b)}</b>${it.start ? ` <span class="hint">ab Sekunde ${it.start}</span>` : ""}${trackId(it.spotify) ? `<div class="row2" style="margin:6px 0"><button class="main" data-pplay="${k}">▶ ${CLIP} Sek. abspielen</button><button data-stop="1">■ Stopp</button></div>` : ""}`
            : `${esc(it.text) || `<span class="err">Kein Fragetext</span>`}${it.type === "mc" ? `<br><span class="hint">${(it.options || []).map((o, j) => `${"abcdefgh"[j]}) ${esc(o)}`).join(" · ")}</span>` : ""}${it.img ? `<img class="thumb" data-img="${esc(it.img)}" alt="Bild">` : ""}`}
          <br><span class="right">${esc(rightText(it))}</span></div>`; }).join("") || `<p class="hint">Keine Fragen in dieser Runde.</p>`}</section>`).join("")}</div>`;
  hydrate(app, null, user.uid);
  // Status je Frage
  for (const { r, ri, it, ii } of all) {
    const k = `${ri}-${ii}`, st = $("ps-" + k), warn = [];
    if (it.type === "mc" && !(it.correct >= 0)) warn.push("keine richtige Antwort markiert");
    if ((it.type === "text") && !String(it.answer ?? "").trim()) warn.push("keine Lösung eingetragen");
    if (it.type === "estimate" && (it.answer === null || it.answer === undefined || it.answer === "")) warn.push("keine Lösung eingetragen");
    if (it.type === "music") { probe.song[k] = trackId(it.spotify) ? "open" : "none"; if (!trackId(it.spotify)) warn.push("kein Spotify-Link"); }
    if (it.img && it.type !== "music") { probe.img[k] = "wait"; checkImg(k, it.img); }
    st.dataset.warn = warn.join(", ");
    probeStat(k);
  }
  probeSum();
}
async function checkImg(k, ref) {
  const src = await imgSrc(null, ref, user.uid);
  const ok = src && await new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = src; });
  if (!probe) return;
  probe.img[k] = ok ? "ok" : "bad"; probeStat(k); probeSum();
}
function probeStat(k) {
  const st = $("ps-" + k); if (!st || !probe) return;
  const parts = [];
  if (st.dataset.warn) parts.push(`<span class="err">⚠ ${esc(st.dataset.warn)}</span>`);
  const im = probe.img[k], so = probe.song[k];
  if (im) parts.push(im === "ok" ? `<span class="okc">✓ Bild lädt</span>` : im === "bad" ? `<span class="err">✕ Bild lädt nicht</span>` : `<span class="hint">Bild wird geprüft…</span>`);
  if (so === "open") parts.push(`<span class="hint">noch nicht angespielt</span>`);
  if (so === "played") parts.push(`<span class="okc">✓ Song läuft</span>`);
  if (!parts.length) parts.push(`<span class="okc">✓</span>`);
  st.innerHTML = parts.join(" · ");
  $("pr-" + k)?.classList.toggle("bad", !!st.dataset.warn || im === "bad");
}
function probeSum() {
  const el = $("psum"); if (!el || !probe) return;
  const iv = Object.values(probe.img), sv = Object.values(probe.song);
  const warns = [...app.querySelectorAll(".pstat")].filter(x => x.dataset.warn).length;
  el.innerHTML = [`Bilder: ${iv.filter(v => v === "ok").length} von ${iv.length} laden${iv.some(v => v === "bad") ? ` <span class="err">(${iv.filter(v => v === "bad").length} kaputt)</span>` : ""}`,
    `Songs: ${sv.filter(v => v === "played").length} von ${sv.length} angespielt`, warns ? `<span class="err">${warns} ${warns === 1 ? "Frage" : "Fragen"} mit Hinweis</span>` : `<span class="okc">keine fehlenden Lösungen</span>`].join(" · ");
}
app.addEventListener("click", e => {
  if (!probe) return;
  const b = e.target.closest("button"); if (!b) return;
  const k = b.dataset.pv || b.dataset.pplay;
  if (b.dataset.stop) { stopClip(); return; }
  if (!k) return;
  const [ri, ii] = k.split("-").map(Number);
  probe.cur = [ri, ii]; probe.playing = null;
  app.querySelectorAll(".probe.cur").forEach(x => x.classList.remove("cur")); $("pr-" + k)?.classList.add("cur");
  if (b.dataset.pplay) { probe.playKey = k; playClip(editing.rounds[ri].items[ii]); }
  probeSend();
});

// ---------- Abend starten ----------
async function startGame(q) {
  probe = null;
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 10; i++) { c = Array.from({ length: 5 }, () => A[Math.floor(Math.random() * A.length)]).join(""); if (!(await getDoc(doc(db, "games", c))).exists()) break; }
  const quiz = JSON.parse(JSON.stringify(q));
  await setDoc(doc(db, "games", c), { ownerUid: user.uid, title: quiz.title, phase: "lobby", roundIdx: -1, roundId: "", roundName: "", questions: [], deadline: 0, board: [], boardRound: -1, reveal: 0, teamNames: [], roundCount: quiz.rounds.length, answered: 0, jokers: {}, createdAt: Date.now() });
  await setDoc(doc(db, "games", c, "host", "state"), { quiz, marks: {}, bonus: {}, relIds: [], jokers: {} });
  const refs = [...new Set(quiz.rounds.flatMap(r => r.items).map(it => String(it.img || "")).filter(x => x.startsWith("media:")))];
  let fail = 0;
  await Promise.all(refs.map(async ref => { try { const m = await getDoc(doc(db, "users", user.uid, "media", ref.slice(6))); if (m.exists()) await setDoc(doc(db, "games", c, "media", ref.slice(6)), m.data()); } catch (e) { console.error(e); fail++; } }));
  if (fail) setTimeout(() => toast("Die Bilder konnten nicht für die Teams freigegeben werden. Bitte die neuen Firestore-Regeln einfügen."), 1500);
  localStorage.setItem(LSG, c);
  editing = null; openLive(c);
}

function stopLive() { subs.forEach(u => u()); subs = []; clearInterval(tick); code = null; game = null; hs = null; }

async function openLive(c) {
  stopLive(); code = c; teams = []; allTeams = []; raw = {};
  const h = await getDoc(doc(db, "games", c, "host", "state")).catch(() => null);
  if (!h || !h.exists()) { localStorage.removeItem(LSG); toast("Diesen Abend gibt es nicht mehr."); return home(); }
  hs = h.data();
  subs.push(onSnapshot(doc(db, "games", c), s => { if (!s.exists()) return; game = s.data(); renderLive(); }));
  subs.push(onSnapshot(collection(db, "games", c, "teams"), s => {
    allTeams = s.docs.map(d => ({ id: d.id, name: d.data().name, at: d.data().at })).sort((a, b) => a.at - b.at);
    refreshTeams();
    const names = teams.map(t => t.name);
    if (game && JSON.stringify(names) !== JSON.stringify(game.teamNames || [])) pub({ teamNames: names });
    renderLive();
  }));
  subs.push(onSnapshot(collection(db, "games", c, "answers"), s => {
    s.docChanges().forEach(ch => { const d = ch.doc.data(); raw[d.round] ||= {}; if (ch.type === "removed") delete raw[d.round][d.uid]; else raw[d.round][d.uid] = { a: d.a || {}, at: d.at || 0 }; });
    syncLive(); renderLive();
  }));
  tick = setInterval(() => {
    const t = $("htimer"); if (!game?.deadline || game.phase !== "answering") return;
    const l = game.deadline - Date.now(); if (t) t.textContent = l > 0 ? until(l) : "Zeit um";
    // letzte 10 Sekunden ticken, dann Gong
    const sec = Math.ceil(l / 1000);
    if (l > 0 && sec <= 10 && sec !== lastSec) { lastSec = sec; fx.tick(sec <= 3); }
    if (l <= 0 && l > -3000 && gonged !== game.deadline) { gonged = game.deadline; fx.gong(); }
  }, 100);
}

// Handywechsel: neue Handy-IDs zeigen auf das ursprüngliche Team
const eff = id => { let x = id, n = 0; while (hs?.alias?.[x] && n++ < 10) x = hs.alias[x]; return x; };
function refreshTeams() { teams = allTeams.filter(t => eff(t.id) === t.id); }
// Antworten einer Runde je Team (bei mehreren Handys: neuere Antworten gewinnen)
function roundAnswers(rid) {
  const out = {};
  Object.entries(raw[rid] || {}).sort((a, b) => a[1].at - b[1].at).forEach(([uid, v]) => { const t = eff(uid); out[t] = { ...(out[t] || {}), ...v.a }; });
  return out;
}
const norm = s => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Joker (einmal pro Abend: die erste Runde, in der ein Team ihn setzt) und "X von Y haben geantwortet"
const hasAns = a => Object.keys(a || {}).some(k => k !== "_joker");
function syncLive() {
  if (!game || !hs) return;
  const j = {};
  for (const r of quiz().rounds) { const A = roundAnswers(r.id); for (const t of teams) if (!j[t.id] && A[t.id]?._joker) j[t.id] = r.id; }
  const upd = {};
  if (JSON.stringify(j) !== JSON.stringify(hs.jokers || {})) { hs.jokers = j; saveHs(); }
  if (JSON.stringify(j) !== JSON.stringify(game.jokers || {})) upd.jokers = j;
  const r = curRound(), n = r ? Object.values(roundAnswers(r.id)).filter(hasAns).length : 0;
  if ((game.phase === "question" || game.phase === "answering") && n !== (game.answered || 0)) upd.answered = n;
  if (Object.keys(upd).length) pub(upd);
}
function dupeOf(t) { return teams.find(o => o.id !== t.id && o.at < t.at && norm(o.name) === norm(t.name)); }
async function mergeTeam(newId, oldId) {
  hs.alias ||= {}; hs.alias[newId] = oldId;
  await setDoc(doc(db, "games", code, "host", "state"), hs);
  refreshTeams();
  await pub({ alias: hs.alias, teamNames: teams.map(t => t.name) });
  toast("Zusammengeführt. Das neue Handy spielt jetzt für das alte Team.");
  renderLive();
}
const pub = data => updateDoc(doc(db, "games", code), data).catch(e => { console.error(e); toast("Konnte nicht speichern. Internet?"); });
function saveHs() { clearTimeout(hsT); hsT = setTimeout(() => setDoc(doc(db, "games", code, "host", "state"), hs).catch(() => toast("Punkte nicht gespeichert. Internet?")), 500); }

const quiz = () => hs.quiz;
const curRound = () => quiz().rounds[game.roundIdx];
function estimateInfo() {
  for (const r of quiz().rounds) for (const it of r.items) if (it.type === "estimate") {
    const guesses = {}; for (const [t, a] of Object.entries(roundAnswers(r.id))) if (a[it.id] !== undefined) guesses[t] = a[it.id];
    return { item: it, answer: it.answer, guesses };
  }
  return null;
}
function board() {
  const before = game.roundIdx > 0 ? ranking({ ...quiz(), rounds: quiz().rounds.slice(0, game.roundIdx) }, hs, teams, null) : null;
  const rid = curRound()?.id;
  return ranking(quiz(), hs, teams, estimateInfo()).map(r => {
    const b = before?.find(x => x.id === r.id), o = { id: r.id, name: r.name, total: r.total, place: r.place };
    if (b) { o.prev = b.place; o.prevTotal = b.total; o.pi = before.indexOf(b); }
    if (hs.jokers?.[r.id] && hs.jokers[r.id] === rid) o.joker = true;
    return o;
  });
}
const publicItem = (it, n) => { const o = it.type === "music" ? { id: it.id, type: "music", n, text: "" } : it.type === "mc" ? { id: it.id, type: "mc", n, text: it.text, options: it.options } : { id: it.id, type: it.type, n, text: it.text }; if (it.img && it.type !== "music") o.img = it.img; return o; };

// ---------- Auflösung auf dem Beamer ----------
const num = v => { const g = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(g) ? g : null; };
function solData(idx, shown) {
  const r = curRound(), it = r.items[idx], A = roundAnswers(r.id);
  const o = { id: it.id, idx, count: r.items.length, label: itemLabel(r, idx), type: it.type, text: it.type === "music" ? "" : it.text || "", img: it.type !== "music" && it.img || "", shown, of: teams.length, pts: {} };
  const m = t => hs.marks[t.id]?.[r.id]?.[it.id] || [];
  for (const t of teams) o.pts[t.id] = m(t).reduce((a, v) => a + Math.min(2, +v || 0), 0);
  o.ok = teams.filter(t => o.pts[t.id] > 0).length;
  if (it.type === "mc") { o.options = it.options; o.correct = it.correct; o.picks = it.options.map((_, k) => teams.filter(t => A[t.id]?.[it.id] !== undefined && A[t.id][it.id] !== "" && +A[t.id][it.id] === k).length); }
  else if (it.type === "music") { o.a = it.a; o.b = it.b; o.parts = [0, 1].map(s => teams.filter(t => (m(t)[s] || 0) > 0).length); }
  else if (it.type === "estimate") { o.answer = num(it.answer); o.guesses = teams.map(t => ({ id: t.id, name: t.name, v: num(A[t.id]?.[it.id]) })).filter(g => g.v !== null); }
  else o.answer = String(it.answer ?? "");
  return o;
}

const relIds = r => hs.relIds || r.items.slice(0, hs.released || 0).map(it => it.id);
const publicList = r => r.items.map((it, i) => [it, i]).filter(([it]) => relIds(r).includes(it.id)).map(([it, i]) => publicItem(it, r.items.slice(0, i + 1).filter(x => x.type !== "estimate").length));
async function releaseItem(id, all = false) {
  const r = curRound();
  hs.relIds = all ? r.items.map(it => it.id) : [...new Set([...relIds(r), id])]; saveHs();
  await pub({ questions: publicList(r), currentId: all ? (game.currentId || "") : id });
}
function itemLabel(r, idx) { const it = r.items[idx]; if (it.type === "estimate") return "Schätzfrage"; const n = r.items.slice(0, idx + 1).filter(x => x.type !== "estimate").length; return it.type === "music" ? `Lied ${n}` : `Frage ${n}`; }

// ---------- Spotify: kurze Ausschnitte abspielen ----------
const CLIP = 10;
function trackId(link) { const m = String(link || "").match(/(?:track[\/:])([A-Za-z0-9]{22})/); return m ? m[1] : ""; }
let spApi = null, spCtl = null, spWant = null, spTimer = null, spSeeked = false, spStarted = 0;
document.addEventListener("click", e => { if (e.target.id === "spclose") { stopClip(); $("spotbox").hidden = true; } });
function spMsg(t) { const m = $("spmsg"); if (m) m.textContent = t; }
function stopClip() { clearTimeout(spTimer); spWant = null; try { spCtl?.pause(); } catch {} spMsg("Gestoppt"); if (code && game?.playing) pub({ playing: null }); }
// Beamer: Countdown und Musik-Animation
function onAir(want) {
  if (probe && probe.playKey) {
    probe.song[probe.playKey] = "played"; probeStat(probe.playKey); probeSum();
    const [ri, ii] = probe.playKey.split("-").map(Number);
    probe.playing = { id: want.id, n: editing.rounds[ri].items.slice(0, ii + 1).filter(x => x.type !== "estimate").length, until: Date.now() + CLIP * 1000 };
    probeSend();
  }
  if (!code || !game) return;
  const r = curRound(), i = r ? r.items.findIndex(x => x.id === want.id) : -1;
  const n = i >= 0 ? r.items.slice(0, i + 1).filter(x => x.type !== "estimate").length : 0;
  pub({ playing: { id: want.id, n, until: Date.now() + CLIP * 1000 } });
}
function playClip(it) {
  const uri = "spotify:track:" + trackId(it.spotify), box = $("spotbox");
  box.hidden = false; $("sptitle").textContent = `${it.a} – ${it.b}`;
  spWant = { uri, id: it.id, start: Math.max(0, +it.start || 0) }; spSeeked = false; spStarted = 0; clearTimeout(spTimer);
  if (code && game?.phase === "question" && !relIds(curRound()).includes(it.id)) releaseItem(it.id);
  spMsg("Lädt…");
  spApi ||= window.SpotifyIframeApi;
  if (!spApi) { spMsg("Spotify-Player lädt noch, gleich nochmal drücken."); return; }
  if (!spCtl) {
    spApi.createController($("spframe"), { uri, width: "100%", height: 80 }, c => {
      spCtl = c;
      c.addListener("ready", () => { if (spWant) c.play(); });
      c.addListener("playback_update", e => {
        const d = e.data || {}; if (!spWant || d.isPaused || d.isBuffering) return;
        if (!spSeeked) { spSeeked = true; if (spWant.start) { c.seek(spWant.start); return; } }
        if (!spStarted) { spStarted = Date.now(); onAir(spWant); spTimer = setTimeout(() => { c.pause(); spWant = null; spMsg(`${CLIP} Sekunden gespielt`); if (code) pub({ playing: null }); }, CLIP * 1000); }
        spMsg(`Läuft… noch ${Math.max(0, Math.ceil(CLIP - (Date.now() - spStarted) / 1000))} Sek.`);
      });
    });
  } else { spCtl.loadUri(uri); spCtl.play(); }
}

// ---------- Aktionen ----------
async function act(a) {
  const r = curRound(), last = game.roundIdx >= quiz().rounds.length - 1;
  if (a === "startRound" || a === "nextRound") {
    const i = a === "startRound" ? 0 : game.roundIdx + 1, nr = quiz().rounds[i];
    hs.relIds = []; saveHs();
    await pub({ phase: "question", roundIdx: i, roundId: nr.id, roundName: nr.name, questions: [], currentId: "", deadline: 0, playing: null, answered: 0, sol: null });
  }
  if (a === "release") { const next = r.items.find(it => !relIds(r).includes(it.id)); if (next) await releaseItem(next.id); }
  if (a === "releaseAll") await releaseItem(null, true);
  if (a === "timer") {
    const m = Math.max(1, +($("mins")?.value || 10));
    hs.relIds = r.items.map(it => it.id); saveHs();
    await pub({ phase: "answering", deadline: Date.now() + m * 60000, questions: publicList(r) });
  }
  if (a === "plus1") await pub({ deadline: Math.max(game.deadline || Date.now(), Date.now()) + 60000 });
  if (a === "lock") {
    await pub({ phase: "locked", deadline: 0 });
    applySuggestions(false); view = "grade";
  }
  if (a === "reopen") await pub({ phase: "answering", deadline: 0 });
  if (a === "solve") { view = "round"; await pub({ phase: "solve", sol: solData(0, false) }); }
  if (a === "solShow") { await pub({ sol: solData(game.sol?.idx || 0, true) }); fx.ding(); }
  if (a === "solNext" || a === "solPrev") { const i = Math.max(0, Math.min(r.items.length - 1, (game.sol?.idx || 0) + (a === "solNext" ? 1 : -1))); await pub({ sol: solData(i, false) }); }
  if (a === "results") { await pub({ phase: "results", board: board(), boardRound: game.roundIdx }); fx.tada(); }
  if (a === "final") await pub({ phase: "final", board: board(), boardRound: game.roundIdx, reveal: 0 });
  if (a === "reveal") {
    const n = Math.min((game.reveal || 0) + 1, teams.length);
    if (n === teams.length) { // der Sieger: erst Trommelwirbel, dann Fanfare
      await pub({ drum: true }); fx.drumroll(2.6); await new Promise(res => setTimeout(res, 2700));
      await pub({ reveal: n, drum: false }); fx.fanfare();
    } else { await pub({ reveal: n }); fx.ding(); }
  }
  if (a === "end") { localStorage.removeItem(LSG); stopLive(); home(); }
  renderLive();
}

function applySuggestions(overwrite) {
  const r = curRound(); if (!r) return;
  for (const t of teams) {
    const a = roundAnswers(r.id)[t.id] || {};
    hs.marks[t.id] ||= {}; const m = hs.marks[t.id][r.id] ||= {};
    for (const it of r.items) if (counts(it) && (overwrite || !m[it.id])) m[it.id] = suggest(it, a[it.id]);
  }
  saveHs();
}

// ---------- Live-Ansicht ----------
function renderLive() {
  if (!game || !hs || !code) return;
  const focus = document.activeElement?.id;
  const r = curRound(), ph = game.phase, last = game.roundIdx >= quiz().rounds.length - 1;
  const join = location.origin + location.pathname.replace(/host\.html$/, "") + `?g=${code}`;
  $("topacts").innerHTML = `<button id="fxb" aria-pressed="${fx.fxOn()}" title="Gong, Ticken, Trommelwirbel und Fanfare">${fx.fxOn() ? "🔊 Show-Sounds an" : "🔇 Show-Sounds aus"}</button><a href="${esc(keepEmu(`screen.html?g=${code}`))}" target="_blank"><button class="main">Beamer öffnen</button></a><button id="endb">Abend beenden</button>`;
  $("fxb").onclick = () => { fx.setFx(!fx.fxOn()); fx.unlock(); renderLive(); };
  $("endb").onclick = () => { if ($("endb").textContent === "Wirklich beenden?") act("end"); else $("endb").textContent = "Wirklich beenden?"; };

  let ctrl = "";
  if (ph === "lobby") ctrl = `<p>Die Teams melden sich gerade an. Wenn alle da sind:</p><button class="main" data-a="startRound">Runde 1 starten</button>`;
  else if (ph === "question" || ph === "answering") {
    const nextIdx = r.items.findIndex(it => !relIds(r).includes(it.id)), next = r.items[nextIdx], rel = nextIdx;
    ctrl = `<div class="row2">${ph === "answering" ? `<span class="okc">Antwortzeit läuft, die Teams können jetzt antworten.</span>` : next ? `<button class="main" data-a="release">${esc(itemLabel(r, rel))} freigeben</button><button data-a="releaseAll">Alle auf einmal</button>` : `<span class="okc">Alle Fragen sind vorgelesen. Jetzt die Antwortzeit starten.</span>`}</div>
      ${ph === "question" ? `<p class="hint">Die Teams sehen die Fragen zum Mitlesen, antworten können sie erst, wenn die Antwortzeit läuft.</p>` : ""}
      <div class="row2">${ph === "answering" ? `<span class="pill timer big" id="htimer">${until(game.deadline - Date.now())}</span><button data-a="plus1">+1 Minute</button>` : `<label style="width:110px">Minuten<input id="mins" type="number" min="1" value="10"></label><button class="main" data-a="timer" style="align-self:end">Antwortzeit starten</button>`}
      <button class="red" data-a="lock" style="align-self:end">Runde schließen</button></div>`;
  } else if (ph === "locked") ctrl = `<p>Runde geschlossen. Prüfe unten die Antworten, dann:</p><div class="row2"><button class="main" data-a="solve">Auflösung auf dem Beamer</button><button data-a="${last ? "final" : "results"}">${last ? "Direkt zur Siegerehrung" : "Direkt zum Stand"}</button><button data-a="reopen">Runde wieder öffnen</button></div>`;
  else if (ph === "solve") {
    const so = game.sol || { idx: 0, count: r.items.length }, it = r.items[so.idx], end = so.idx >= r.items.length - 1;
    ctrl = `<p>Auflösung: <b>${esc(itemLabel(r, so.idx))}</b> (${so.idx + 1} von ${r.items.length}). ${so.shown ? `<span class="okc">Lösung ist aufgedeckt: ${esc(rightText(it))}</span>` : "Die Teams sehen die Frage, die Lösung noch nicht."}</p>
      <div class="row2">${so.shown ? (end ? `<button class="main" data-a="${last ? "final" : "results"}">${last ? "Siegerehrung starten" : "Stand auf Beamer zeigen"}</button>` : `<button class="main" data-a="solNext">Nächste Frage</button>`) : `<button class="main" data-a="solShow">Lösung aufdecken</button>${end ? "" : `<button data-a="solNext">Überspringen</button>`}`}
      <button data-a="solPrev" ${so.idx ? "" : "disabled"}>Zurück</button>${so.shown && !end ? `<button data-a="${last ? "final" : "results"}">${last ? "Zur Siegerehrung" : "Zum Stand"}</button>` : ""}</div>
      <p class="hint">Die Statistik kommt aus deinen Haken unter „Antworten prüfen“. Korrigierst du dort etwas, drück einfach noch mal „Lösung aufdecken“.</p>`;
  }
  else if (ph === "results") ctrl = `<p>Der Stand nach Runde ${game.roundIdx + 1} ist auf dem Beamer und den Handys.</p><div class="row2">${last ? `<button class="main" data-a="final">Siegerehrung starten</button>` : `<button class="main" data-a="nextRound">Runde ${game.roundIdx + 2} starten</button>`}<button data-a="results">Stand aktualisieren</button>${last ? "" : `<button class="red" data-a2="early">Hier beenden: Siegerehrung</button>`}</div>${last ? "" : (() => { const ri = quiz().rounds.findIndex(r => r.items.some(it => it.type === "estimate")); return ri > game.roundIdx ? `<p class="hint">Hinweis: Die Schätzfrage steht in Runde ${ri + 1}. Beendest du vorher, entscheidet sie einen Gleichstand auf Platz 1 nicht.</p>` : ""; })()}`;
  if (ph === "solve" && game.sol?.shown) ctrl = ctrl.replace(`<button data-a="solPrev"`, `<button data-a="solShow">Neu laden</button><button data-a="solPrev"`);
  if (ph === "final") ctrl = `<p>${(game.reveal || 0) < teams.length ? `${game.reveal || 0} von ${teams.length} Plätzen aufgedeckt.` : "Alle Plätze aufgedeckt. Glückwunsch!"}</p><div class="row2"><button class="main" data-a="reveal" ${(game.reveal || 0) >= teams.length ? "disabled" : ""}>Nächsten Platz aufdecken</button><button data-a="final">Neu berechnen</button></div>`;

  const rids = r ? relIds(r) : [], nextId = r?.items.find(it => !rids.includes(it.id))?.id;
  const script = r ? r.items.map((it, i) => { const done = rids.includes(it.id), canRel = ph === "question" && !done;
    return `<div class="script${done ? " done" : ""}"><div class="row2" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap"><span class="qnum">${esc(itemLabel(r, i))}${done ? " · freigegeben ✓" : ""}</span>${canRel ? `<button class="${it.id === nextId ? "main" : ""}" data-rel="${esc(it.id)}" style="flex:none">Freigeben</button>` : ""}</div>${it.type === "music" ? `<b>${esc(it.a)} – ${esc(it.b)}</b>${trackId(it.spotify) ? `<div class="row2" style="margin:6px 0"><button class="main" data-play="${esc(it.id)}">▶ ${CLIP} Sek. abspielen</button><button data-stop="1">■ Stopp</button>${it.start ? `<span class="hint">ab Sekunde ${it.start}</span>` : ""}</div>` : `<br><span class="hint">Kein Spotify-Link hinterlegt</span>`}` : esc(it.text)}${it.type === "mc" ? `<br><span class="hint">${it.options.map((o, k) => `${"abcdefgh"[k]}) ${esc(o)}`).join(" · ")}</span>` : ""}${it.img && it.type !== "music" ? `<img class="thumb" data-img="${esc(it.img)}" alt="Bild">` : ""}<br><span class="right">${esc(rightText(it))}</span>${it.note ? `<br><span class="hint">${esc(it.note)}</span>` : ""}</div>`; }).join("")
    + (ph === "question" ? `<div class="row2"><button class="main" data-a="timer">Antwortzeit starten</button><span class="hint">Dauer wie oben eingestellt</span></div>` : "") : "";

  const answered = r ? Object.values(roundAnswers(r.id)).filter(hasAns).length : 0;
  const rows = ranking(quiz(), hs, teams, estimateInfo());
  const est = estimateInfo();
  app.innerHTML = `<div class="grid2">
    <section class="stack">
      <div class="panel stack"><div class="row2" style="justify-content:space-between"><div><span class="hint">Spiel-Code</span><div class="slab code">${esc(code)}</div><span class="hint" style="overflow-wrap:anywhere">${esc(join)}</span></div><div class="qrbox" id="qr"></div></div></div>
      <div class="panel stack"><h2 class="slab">${r ? `Runde ${game.roundIdx + 1}: ${esc(r.name)}` : "Anmeldung läuft"}</h2>${r ? `<p class="hint">${answered} von ${teams.length} Teams haben in dieser Runde schon geantwortet.</p>` : ""}${ctrl}</div>
      ${r ? `<div class="panel stack"><div class="tabs" role="tablist"><button data-v="round" aria-selected="${view === "round"}">Skript</button><button data-v="grade" aria-selected="${view === "grade"}">Antworten prüfen</button></div>${view === "round" ? script : gradeHtml(r)}</div>` : ""}
    </section>
    <section class="stack">
      <div class="panel stack"><h2 class="slab">Rangliste</h2><ol class="board">${rows.map(x => `<li class="${x.place === 1 && x.total > 0 ? "first" : ""}"><span class="pl slab">${x.place}.</span><span><b>${esc(x.name)}</b>${hs.jokers?.[x.id] ? ` <span class="pill" title="Joker in ${esc(quiz().rounds.find(q => q.id === hs.jokers[x.id])?.name || "")}">🃏 R${quiz().rounds.findIndex(q => q.id === hs.jokers[x.id]) + 1}</span>` : ""}${x.diff !== undefined ? `<br><span class="hint">Schätzung ${x.diff === Infinity ? "fehlt" : `${+x.diff.toFixed(2)} daneben`}</span>` : ""}</span><span class="pts slab">${x.total}</span></li>`).join("") || `<p class="hint">Noch keine Teams</p>`}</ol>
      ${rows.tiebreak === undefined && rows.filter(x => x.place === 1).length > 1 && rows[0].total > 0 ? `<p class="hint">Gleichstand auf Platz 1. ${est ? (est.answer === null || est.answer === undefined || est.answer === "" ? "Trag im Quiz die Lösung der Schätzfrage ein." : "Die Schätzfrage wurde noch nicht beantwortet.") : "Im Quiz gibt es keine Schätzfrage."}</p>` : ""}</div>
      <div class="panel stack"><h2 class="slab">Teams (${teams.length})</h2>${teams.map(t => { const d = dupeOf(t); return `<div class="row2" style="justify-content:space-between"><span>${esc(t.name)}${d ? `<br><span class="err">Handy gewechselt? Den Namen gibt es schon.</span>` : ""}</span><span class="row2">${d ? `<button class="main" data-merge="${esc(t.id)}|${esc(d.id)}">Zusammenführen</button>` : ""}<button data-kick="${esc(t.id)}" aria-label="${esc(t.name)} entfernen">✕</button></span></div>`; }).join("") || `<p class="hint">Noch niemand angemeldet.</p>`}</div>
    </section></div>`;
  try { const qr = qrcode(0, "M"); qr.addData(join); qr.make(); $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0 }); } catch {}
  hydrate(app, null, user.uid);
  if (focus && $(focus)) $(focus).focus();
}

function gradeHtml(r) {
  if (!teams.length) return `<p class="hint">Noch keine Teams.</p>`;
  const A = roundAnswers(r.id);
  const blocks = r.items.map((it, i) => {
    if (!counts(it)) return `<div class="gradeq"><b>${esc(itemLabel(r, i))}</b> <span class="hint">zählt nicht, entscheidet nur das Stechen. Lösung: ${esc(it.answer ?? "–")}</span>${teams.map(t => `<div class="grow"><span>${esc(t.name)}</span><span class="ans${A[t.id]?.[it.id] !== undefined ? " has" : ""}">${esc(A[t.id]?.[it.id] ?? "keine Schätzung")}</span><span></span></div>`).join("")}</div>`;
    return `<div class="gradeq"><b>${esc(itemLabel(r, i))}</b> <span class="hint">${it.type === "music" ? "" : esc(it.text.slice(0, 80))}</span><br><span class="okc">${esc(rightText(it))}</span>
      ${teams.map(t => {
        const m = hs.marks[t.id]?.[r.id]?.[it.id] || [], sug = suggest(it, A[t.id]?.[it.id]), txt = answerText(it, A[t.id]?.[it.id]);
        const chips = Array.from({ length: slots(it) }, (_, s) => `<button class="chip${m[s] === 2 ? " s2" : m[s] === 1 ? " s1" : ""}${sug[s] ? " sug" : ""}" data-mark="${esc(t.id)}|${esc(it.id)}|${s}" aria-label="${it.type === "music" ? (s ? "Teil 2" : "Teil 1") : "Punkt"} für ${esc(t.name)}">${it.type === "music" ? (s ? "2" : "1") : "✓"}</button>`).join("");
        return `<div class="grow"><span>${esc(t.name)}</span><span class="ans${txt ? " has" : ""}">${esc(txt || "keine Antwort")}</span><span class="chips">${chips}</span></div>`;
      }).join("")}</div>`;
  }).join("");
  const sums = teams.map(t => `<div class="grow"><span>${esc(t.name)}${hs.jokers?.[t.id] === r.id ? `<br><span class="pill">🃏 Joker: Fragenpunkte ×2</span>` : ""}</span><label style="max-width:150px">Rundenbonus<input id="bon-${esc(t.id)}" data-bonus="${esc(t.id)}" inputmode="numeric" value="${esc(hs.bonus[t.id]?.[r.id] || "")}" placeholder="0"></label><span class="slab big">${roundPoints(quiz(), hs, t.id, r)}</span></div>`).join("");
  return `<p class="hint">Tippen: 1× richtig, 2× richtig + Zusatzpunkt, 3× falsch. Grüner Strich = automatischer Vorschlag. Beim Schließen der Runde werden die Vorschläge übernommen.</p>
    <button data-a2="suggest">Vorschläge neu übernehmen</button>${blocks}<div class="gradeq"><b>Summe dieser Runde</b>${sums}</div>`;
}

app.addEventListener("click", async e => {
  if (!code) return;
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.a) { b.disabled = true; await act(b.dataset.a); return; }
  if (b.dataset.v) { view = b.dataset.v; return renderLive(); }
  if (b.dataset.play) { const it = curRound().items.find(x => x.id === b.dataset.play); if (it) playClip(it); return; }
  if (b.dataset.stop) { stopClip(); return; }
  if (b.dataset.rel) { b.disabled = true; await releaseItem(b.dataset.rel); return; }
  if (b.dataset.a2 === "early") { if (b.textContent !== "Wirklich jetzt beenden?") { b.textContent = "Wirklich jetzt beenden?"; return; } b.disabled = true; await act("final"); return; }
  if (b.dataset.a2 === "suggest") { applySuggestions(true); return renderLive(); }
  if (b.dataset.merge) { const [n, o] = b.dataset.merge.split("|"); b.disabled = true; await mergeTeam(n, o); return; }
  if (b.dataset.kick) { if (b.textContent !== "Entfernen?") { b.textContent = "Entfernen?"; return; } await deleteDoc(doc(db, "games", code, "teams", b.dataset.kick)); return; }
  if (b.dataset.mark) {
    const [t, it, s] = b.dataset.mark.split("|"), rid = curRound().id;
    hs.marks[t] ||= {}; hs.marks[t][rid] ||= {}; const arr = hs.marks[t][rid][it] ||= [];
    arr[+s] = ((arr[+s] || 0) + 1) % 3; for (let i = 0; i < arr.length; i++) arr[i] ||= 0;
    saveHs(); renderLive();
  }
});
app.addEventListener("input", e => {
  if (!code || !e.target.dataset.bonus) return;
  const t = e.target.dataset.bonus, rid = curRound().id;
  hs.bonus[t] ||= {}; hs.bonus[t][rid] = Math.max(0, parseInt(e.target.value) || 0);
  saveHs(); clearTimeout(e.target.t); e.target.t = setTimeout(renderLive, 600);
});

if (!ready) app.innerHTML = `<div class="panel"><p>Die App ist noch nicht mit Firebase verbunden. Trag deine Werte in <code>js/config.js</code> ein.</p></div>`;
else onAuthStateChanged(auth, u => {
  if (!u || u.isAnonymous) { user = null; stopLive(); return login(); }
  if (user?.uid === u.uid) return;
  user = u;
  const last = localStorage.getItem(LSG);
  last ? openLive(last) : home();
});
