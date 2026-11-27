// Auswertung: Vorschläge für richtig/falsch, Summen, Rangliste mit Stechen per Schätzfrage

export const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/ß/g, "ss").replace(/\b(the|der|die|das|feat|ft)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function similar(given, right) {
  const a = norm(given), b = norm(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && (b.includes(a) || a.includes(b))) return true;
  return lev(a, b) <= Math.floor(Math.max(a.length, b.length) / 5);
}

// Anzahl Punkte-Kästchen pro Frage
export const slots = item => item.type === "music" ? 2 : 1;
// Zählt die Frage für die Punkte? (Schätzfragen entscheiden nur das Stechen)
export const counts = item => item.type !== "estimate";

// Vorschlag aus der Antwort eines Teams: Array mit 0/1 je Kästchen
export function suggest(item, ans) {
  if (item.type === "mc") return [ans !== undefined && ans !== null && ans !== "" && +ans === item.correct ? 1 : 0];
  if (item.type === "text") return [similar(ans, item.answer) ? 1 : 0];
  if (item.type === "music") {
    const art = ans?.artist, tit = ans?.title;
    const s1 = [similar(art, item.a) ? 1 : 0, similar(tit, item.b) ? 1 : 0];
    const s2 = [similar(art, item.b) ? 1 : 0, similar(tit, item.a) ? 1 : 0];
    return s1[0] + s1[1] >= s2[0] + s2[1] ? s1 : s2;
  }
  return [0];
}

export const answerText = (item, ans) => {
  if (ans === undefined || ans === null || ans === "") return "";
  if (item.type === "mc") return item.options[+ans] !== undefined ? `${"abcdefgh"[+ans]}) ${item.options[+ans]}` : "";
  if (item.type === "music") return [ans.artist, ans.title].filter(Boolean).join(" / ");
  return String(ans);
};

export const rightText = item => {
  if (item.type === "mc") return item.correct >= 0 ? `${"abcdefgh"[item.correct]}) ${item.options[item.correct]}` : "keine markiert";
  if (item.type === "music") return `${item.a} – ${item.b}`;
  return String(item.answer ?? "");
};

// marks[team][round][item] = [0|1|2, ...], bonus[team][round] = Zahl
export function roundPoints(quiz, st, teamId, round) {
  const m = st.marks?.[teamId]?.[round.id] || {};
  let p = 0;
  for (const it of round.items) if (counts(it)) for (const v of m[it.id] || []) p += Math.min(2, Number(v) || 0);
  return p + (Number(st.bonus?.[teamId]?.[round.id]) || 0);
}

export const total = (quiz, st, teamId) => quiz.rounds.reduce((a, r) => a + roundPoints(quiz, st, teamId, r), 0);

// teams: [{id,name}], guesses: {teamId: Zahl} für die Schätzfrage
export function ranking(quiz, st, teams, estimate) {
  const rows = teams.map(t => ({ id: t.id, name: t.name, total: total(quiz, st, t.id) }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "de"));
  rows.forEach((r, i) => r.place = i && r.total === rows[i - 1].total ? rows[i - 1].place : i + 1);
  const top = rows.filter(r => r.place === 1);
  if (top.length > 1 && top[0].total > 0 && estimate && estimate.answer !== null && estimate.answer !== undefined && estimate.answer !== "") {
    const d = r => { const g = parseFloat(String(estimate.guesses?.[r.id] ?? "").replace(",", ".")); return Number.isFinite(g) ? Math.abs(g - estimate.answer) : Infinity; };
    top.sort((a, b) => d(a) - d(b));
    top.forEach((r, i) => { r.diff = d(r); r.place = i && d(r) === d(top[i - 1]) ? top[i - 1].place : i + 1; });
    rows.splice(0, top.length, ...top);
    rows.tiebreak = true;
  }
  return rows;
}
