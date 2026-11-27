# Kolties QuizKasten

Teams spielen per Smartphone mit, der Moderator steuert alles vom Laptop, der Beamer zeigt Fragen und Rangliste.

## Seiten

| Seite | Wer | Was |
|---|---|---|
| `index.html` | Teams | Per QR-Code beitreten, Fragen sehen, Antworten eingeben |
| `host.html` | Moderator | Anmelden, Quiz importieren und bearbeiten, Abend steuern, Antworten prüfen |
| `screen.html?g=CODE` | Beamer | QR-Code, aktuelle Frage, Timer, Rangliste, Siegerehrung |

## Einmalige Einrichtung

1. **Firestore-Regeln:** Inhalt von `firestore.rules` in der Firebase-Konsole unter Firestore Database → Regeln einfügen und veröffentlichen.
2. **Moderator-Konto:** Firebase-Konsole → Authentication → Nutzer → Nutzer hinzufügen (E-Mail + Passwort).
3. **Online stellen:** Repository auf GitHub → Settings → Pages → Branch `main`, Ordner `/ (root)`. Die Seite läuft dann unter `https://<name>.github.io/<repo>/`.

## Ablauf eines Abends

1. `host.html` öffnen, anmelden, Word-Skript importieren (fett = richtige Antwort), kurz prüfen.
2. „Abend starten“ → „Beamer öffnen“ und das Fenster auf den Beamer ziehen.
3. Teams scannen den QR-Code und tragen ihren Namen ein.
4. Pro Runde: Fragen beim Vorlesen einzeln freigeben → „Antwortzeit starten“ → „Runde schließen“.
5. Unter „Antworten prüfen“ die Vorschläge kontrollieren (1× tippen richtig, 2× mit Zusatzpunkt, 3× falsch), dann „Stand auf Beamer zeigen“.
6. Nach der letzten Runde „Siegerehrung starten“ und Platz für Platz aufdecken. Gleichstand auf Platz 1 entscheidet die Schätzfrage.

## Word-Format

- `RUNDE 1: Thema` beginnt eine Runde, `MUSIKQUIZ: Thema` eine Musikrunde.
- Fragen nummeriert (`1.`), Antworten `a)` / `a.`; die **fett** gedruckte gilt als richtig. Fragen ohne Antworten werden freie Fragen; die richtige Antwort steht darunter in einer Zeile `Antwort: ...`.
- Musikrunde: eine Zeile pro Lied, `Interpret - Titel` (Reihenfolge egal).
- Eine Zeile mit `Schätzfrage` markiert die folgende Frage als Schätzfrage für das Stechen.

## Lokal testen

Mit den Firebase-Emulatoren: `firebase emulators:start --only auth,firestore --project demo-pubquiz`, dann die Seiten über einen lokalen Webserver mit `?emu` am Ende öffnen.
