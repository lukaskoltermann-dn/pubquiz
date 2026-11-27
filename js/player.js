import { ready, auth, db, signInAnonymously, onAuthStateChanged, doc, getDoc, setDoc, onSnapshot, $, esc, params, until } from "./fb.js";

const app = $("app");
const LS = "pubquiz-team";
let code = (params.get("g") || "").toUpperCase(), me = null, team = null, game = null;
let joining = false, unsubGame = null, unsubAns = null, ansRound = null, answers = {}, saveT = null, tick = null;

const toast = m => { const t = $("toast"); t.textContent = m; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", 3000); };
const saved = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };

function joinForm(msg = "") {
  const s = saved();
  app.innerHTML = `<form class="panel stack" id="join">
    <h2 class="slab big">Mitspielen</h2>
    <p class="hint">Gebt den Code vom Beamer ein und euren Teamnamen. Ein Handy pro Team reicht.</p>
    <label>Spiel-Code<input id="code" autocomplete="off" autocapitalize="characters" maxlength="6" value="${esc(code || s.code || "")}" placeholder="z. B. KNEIPE"></label>
    <label>Teamname<input id="name" maxlength="40" autocomplete="off" value="${esc(s.name || "")}" placeholder="z. B. Die Musikalischen Pinguine"></label>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ""}
    <button class="main" id="go">Los geht's</button>
  </form>`;
  $("join").addEventListener("submit", async e => {
    e.preventDefault();
    const c = $("code").value.trim().toUpperCase(), n = $("name").value.trim();
    if (!c || !n) return joinForm("Bitte Code und Teamnamen eintragen.");
    $("go").disabled = true; joining = true;
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      me = auth.currentUser.uid;
      const g = await getDoc(doc(db, "games", c));
      if (!g.exists()) { code = c; return joinForm("Diesen Code gibt es nicht. Schaut noch mal auf den Beamer."); }
      await setDoc(doc(db, "games", c, "teams", me), { name: n, at: Date.now() });
      code = c; team = n;
      try { localStorage.setItem(LS, JSON.stringify({ code: c, name: n })); } catch {}
      play();
    } catch (err) { console.error(err); joinForm("Das hat nicht geklappt. Ist das Internet an?"); }
    finally { joining = false; }
  });
}

function play() {
  $("who").textContent = team;
  history.replaceState(null, "", location.pathname + "?g=" + encodeURIComponent(code) + (params.has("emu") ? "&emu" : ""));
  unsubGame?.();
  unsubGame = onSnapshot(doc(db, "games", code), snap => {
    if (!snap.exists()) { app.innerHTML = `<div class="panel"><p>Dieses Spiel ist beendet.</p></div>`; return; }
    game = snap.data(); render();
  }, () => toast("Verbindung unterbrochen, versuche es weiter…"));
}

function watchAnswers(rid) {
  if (ansRound === rid) return;
  unsubAns?.(); ansRound = rid; answers = {};
  try { answers = JSON.parse(localStorage.getItem(`pq-a-${code}-${rid}`)) || {}; } catch {}
  unsubAns = onSnapshot(doc(db, "games", code, "answers", `${rid}_${me}`), s => {
    if (s.exists() && !s.metadata.hasPendingWrites) { answers = { ...s.data().a, ...answers }; fillInputs(); }
  }, () => {});
}

const open = () => game && game.phase === "answering" && (!game.deadline || Date.now() < game.deadline + 3000);

function save() {
  try { localStorage.setItem(`pq-a-${code}-${ansRound}`, JSON.stringify(answers)); } catch {}
  $("st") && ($("st").textContent = "Speichert…");
  clearTimeout(saveT);
  saveT = setTimeout(async () => {
    if (!open()) return;
    try { await setDoc(doc(db, "games", code, "answers", `${ansRound}_${me}`), { uid: me, round: ansRound, a: answers, at: Date.now() }); $("st") && ($("st").textContent = "Antworten gespeichert ✓"); }
    catch (e) { console.error(e); $("st") && ($("st").textContent = "Nicht gespeichert, die Runde ist schon zu."); }
  }, 500);
}

function qCard(q, i) {
  const n = q.type === "music" ? `Lied ${q.n}` : q.type === "estimate" ? "Schätzfrage" : `Frage ${q.n}`;
  let body = "";
  if (q.type === "mc") body = `<div class="opts">${q.options.map((o, k) => `<button type="button" class="opt" data-q="${esc(q.id)}" data-v="${k}" aria-pressed="false"><b>${"abcdefgh"[k]}</b><span>${esc(o)}</span></button>`).join("")}</div>`;
  else if (q.type === "music") body = `<div class="stack"><label>Interpret<input data-q="${esc(q.id)}" data-f="artist" autocomplete="off"></label><label>Titel<input data-q="${esc(q.id)}" data-f="title" autocomplete="off"></label></div>`;
  else if (q.type === "estimate") body = `<label>Eure Schätzung (Zahl)<input data-q="${esc(q.id)}" inputmode="decimal" autocomplete="off"></label>`;
  else body = `<input data-q="${esc(q.id)}" autocomplete="off" placeholder="Eure Antwort" aria-label="${esc(n)}">`;
  return `<article class="card" id="q-${esc(q.id)}"><div class="qnum">${esc(n)}</div>${q.text ? `<p class="qtext">${esc(q.text)}</p>` : `<p class="qtext">Hört gut hin…</p>`}${body}</article>`;
}

function fillInputs() {
  app.querySelectorAll("[data-q]").forEach(el => {
    const v = answers[el.dataset.q];
    if (el.classList.contains("opt")) el.setAttribute("aria-pressed", String(v !== undefined && +v === +el.dataset.v));
    else if (document.activeElement !== el) el.value = el.dataset.f ? (v?.[el.dataset.f] ?? "") : (v ?? "");
    el.disabled = !open();
  });
}

function boardHtml(rows, hidden = 0) {
  return `<ol class="board">${rows.map((r, i) => i < hidden ? "" : `<li class="${r.place === 1 && r.total > 0 ? "first" : ""}${r.id === me ? " me" : ""}"><span class="pl slab">${r.place}.</span><span><b>${esc(r.name)}</b>${r.id === me ? " (ihr)" : ""}</span><span class="pts slab">${r.total}</span></li>`).join("")}</ol>`;
}

function render() {
  $("title").textContent = game.title || "Pubquiz";
  clearInterval(tick);
  const ph = game.phase;
  if (ph === "lobby") { app.innerHTML = `<div class="panel stack"><h2 class="slab big">Ihr seid dabei!</h2><p>Team <b>${esc(team)}</b> ist angemeldet. Gleich geht's los, die Fragen erscheinen hier automatisch.</p></div>`; return; }
  if (ph === "results" || ph === "final") {
    const rows = game.board || [], hidden = ph === "final" ? Math.max(0, rows.length - (game.reveal || 0)) : 0;
    const mine = rows.find(r => r.id === me);
    app.innerHTML = `<div class="stack"><h2 class="slab big">${ph === "final" ? "Siegerehrung" : `Stand nach Runde ${(game.boardRound ?? 0) + 1}`}</h2>
      ${ph === "final" && hidden ? `<p class="hint">Die Plätze werden gerade aufgedeckt…</p>` : mine ? `<p>Ihr seid auf Platz <b>${mine.place}</b> mit <b>${mine.total}</b> Punkten.</p>` : ""}
      ${boardHtml(rows, hidden)}</div>`;
    return;
  }
  // question, answering, locked
  watchAnswers(game.roundId);
  const qs = game.questions || [];
  let list = $("qlist");
  if (!list || list.dataset.round !== game.roundId) {
    app.innerHTML = `<div class="stack"><div class="row2" style="justify-content:space-between"><h2 class="slab big" id="rname"></h2><span class="pill timer" id="timer" hidden></span></div>
      <p class="hint" id="st"></p><div class="stack" id="qlist" data-round="${esc(game.roundId)}"></div><p class="hint" id="foot"></p></div>`;
    list = $("qlist");
    list.addEventListener("click", e => { const b = e.target.closest(".opt"); if (!b || !open()) return; answers[b.dataset.q] = +b.dataset.v; fillInputs(); save(); });
    list.addEventListener("input", e => { const el = e.target; if (!el.dataset.q) return; if (el.dataset.f) answers[el.dataset.q] = { ...(answers[el.dataset.q] || {}), [el.dataset.f]: el.value }; else answers[el.dataset.q] = el.value; save(); });
  }
  $("rname").textContent = `Runde ${game.roundIdx + 1}: ${game.roundName}`;
  qs.forEach((q, i) => {
    const old = $("q-" + q.id);
    if (!old) list.insertAdjacentHTML("beforeend", qCard(q, i));
    else if ((old.dataset.t || "") !== (q.text || "")) { old.dataset.t = q.text || ""; old.querySelector(".qtext").textContent = q.text || "Hört gut hin…"; }
  });
  [...list.children].forEach(c => { if (!qs.some(q => "q-" + q.id === c.id)) c.remove(); });
  fillInputs();
  const last = list.lastElementChild; if (last && last.dataset.seen !== "1") { last.dataset.seen = "1"; if (qs.length > 1) last.scrollIntoView({ behavior: "smooth", block: "center" }); }
  $("foot").textContent = ph === "locked" ? "Die Runde ist geschlossen. Eure Antworten sind beim Moderator." : ph === "question" ? (qs.length ? "Hört gut zu, die Fragen stehen hier zum Mitlesen. Antworten könnt ihr, sobald die Antwortzeit startet." : "Gleich kommt die erste Frage.") : "Antworten werden automatisch gespeichert. Ihr könnt bis zum Ende der Zeit noch ändern.";
  if (ph === "locked") $("st").textContent = "Abgegeben ✓";
  else if (ph === "question") $("st").textContent = "Zuhören! Antworten geht gleich los.";
  else if (!Object.keys(answers).length) $("st").textContent = "Jetzt antworten!";
  const t = $("timer");
  if (game.deadline && ph === "answering") {
    t.hidden = false;
    const upd = () => { const left = game.deadline - Date.now(); t.textContent = left > 0 ? `noch ${until(left)}` : "Zeit ist um"; if (left <= 0) { clearInterval(tick); fillInputs(); } };
    upd(); tick = setInterval(upd, 500);
  } else t.hidden = true;
}

if (!ready) app.innerHTML = `<div class="panel"><p>Die App ist noch nicht mit der Datenbank verbunden.</p></div>`;
else onAuthStateChanged(auth, async u => {
  if (me || joining) return;
  const s = saved();
  if (u && s.code && (!code || code === s.code)) {
    try {
      const t = await getDoc(doc(db, "games", s.code, "teams", u.uid));
      if (t.exists()) { me = u.uid; code = s.code; team = t.data().name; return play(); }
    } catch {}
  }
  joinForm();
});
