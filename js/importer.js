// Liest ein Quiz-Skript (Word .docx) ein. Fett gedruckte Antwortoptionen gelten als richtig.
// Format wie im Beispiel: "RUNDE 1: Titel", nummerierte Fragen, Optionen "a." / "a)", Musikrunde mit "Interpret - Titel".

const OPT = /^\s*([a-hA-H])\s*[\.\)]\s*(.*)$/;
const NUM = /^\s*\d{1,2}\s*[\.\)]\s*(.*)$/;
const HEAD = /^\s*(runde\s*\d+|musik\s*quiz|musikrunde|musik)\b\s*[:\-–]?\s*(.*)$/i;

export const uid = () => Math.random().toString(36).slice(2, 10);

// paragraphs: Array von Absätzen, jeder ein Array von [text, bold]
export function paragraphsToLines(paragraphs) {
  const lines = [];
  for (const segs of paragraphs) {
    let cur = { t: "", bold: 0, all: 0 };
    const push = () => { const t = cur.t.replace(/ /g, " ").trim(); if (t) lines.push({ t, b: cur.all > 0 && cur.bold / cur.all >= 0.5 }); cur = { t: "", bold: 0, all: 0 }; };
    for (const [text, bold] of segs) {
      const parts = text.split("\n");
      parts.forEach((p, i) => {
        if (i > 0) push();
        cur.t += p;
        const n = p.replace(/\s/g, "").length;
        cur.all += n; if (bold) cur.bold += n;
      });
    }
    push();
  }
  return lines;
}

export function parseNumber(s) {
  const m = String(s ?? "").replace(/\./g, "").match(/-?\d+(?:,\d+)?/) || String(s ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : null;
}

export function linesToQuiz(lines, title = "Neues Quiz") {
  const quiz = { title, rounds: [] };
  let round = null, q = null, estimateNext = false;
  const newRound = (name, music) => { round = { id: uid(), name: name || `Runde ${quiz.rounds.length + 1}`, music, items: [] }; quiz.rounds.push(round); q = null; };
  const finish = () => {
    if (!q) return;
    if (q.type === "mc") {
      if (q.options.length === 0) { q.type = "text"; }
      else {
        const c = q._bold.indexOf(true); q.correct = c;
        if (q.estimate) { q.type = "estimate"; q.answer = c >= 0 ? parseNumber(q.options[c]) : null; q.options = []; }
      }
    }
    delete q._bold; delete q.estimate;
    q = null;
  };
  const newQ = text => {
    finish();
    if (!round) newRound("", false);
    q = { id: uid(), type: "mc", text, options: [], _bold: [], correct: -1, answer: "", note: "", estimate: estimateNext };
    round.items.push(q); estimateNext = false;
  };

  for (const { t, b } of lines) {
    const h = t.match(HEAD);
    if (h && !OPT.test(t)) {
      finish();
      const music = /musik/i.test(h[1]);
      newRound(music ? (h[2] ? `Musik: ${h[2]}` : "Musikrunde") : (h[2] || h[1]), music);
      continue;
    }
    if (round && round.music) {
      const parts = t.split(/\s+[-–]\s+/);
      if (parts.length >= 2) round.items.push({ id: uid(), type: "music", a: parts[0].trim(), b: parts.slice(1).join(" - ").trim(), note: "" });
      continue;
    }
    if (/sch[äa]tzfrage/i.test(t) && !/\?\s*$/.test(t)) { finish(); estimateNext = true; continue; }
    const o = t.match(OPT);
    if (o && q) { q.options.push(o[2].trim()); q._bold.push(b); continue; }
    const n = t.match(NUM);
    if (n) { newQ(n[1].trim()); continue; }
    if (!q || q.options.length > 0 && /[\?…:]\s*$|\.\.\.\s*$/.test(t) && t.length > 15) { newQ(t); continue; }
    if (q.options.length === 0) q.text += " " + t;
    else q.note = (q.note ? q.note + " · " : "") + t;
  }
  finish();
  return quiz;
}

// Liest eine .docx-Datei (ArrayBuffer) im Browser mit JSZip
export async function docxToQuiz(buf, title) {
  const zip = await window.JSZip.loadAsync(buf);
  const xml = await zip.file("word/document.xml").async("string");
  const d = new DOMParser().parseFromString(xml, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paras = [];
  for (const p of d.getElementsByTagNameNS(W, "p")) {
    const segs = [];
    for (const r of p.getElementsByTagNameNS(W, "r")) {
      const bEl = [...r.childNodes].find(n => n.localName === "rPr");
      const bb = bEl && [...bEl.childNodes].find(n => n.localName === "b");
      const bold = !!bb && !["0", "false"].includes(bb.getAttributeNS(W, "val") || bb.getAttribute("w:val") || "");
      for (const c of r.childNodes) {
        if (c.localName === "t") segs.push([c.textContent, bold]);
        else if (c.localName === "tab") segs.push(["\t", bold]);
        else if (c.localName === "br" || c.localName === "cr") segs.push(["\n", bold]);
      }
    }
    paras.push(segs);
  }
  return linesToQuiz(paragraphsToLines(paras), title);
}
