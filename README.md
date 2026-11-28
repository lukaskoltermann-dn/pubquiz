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
5. Unter „Antworten prüfen“ die Vorschläge kontrollieren (1× tippen richtig, 2× mit Zusatzpunkt, 3× falsch).
6. „Auflösung auf dem Beamer“: Frage für Frage „Lösung aufdecken“, mit Statistik (wie viele Teams richtig lagen, welche Antwort gewählt wurde, Schätzungen auf dem Zahlenstrahl). Danach „Stand auf Beamer zeigen“: die Rangliste fährt vom alten in den neuen Stand, mit Aufsteiger-Pfeilen.
7. Nach der letzten Runde „Siegerehrung starten“ und Platz für Platz aufdecken. Vor Platz 1 kommt ein Trommelwirbel, dann Fanfare und Konfetti. Gleichstand auf Platz 1 entscheidet die Schätzfrage. Wer früher aufhören will, drückt nach dem Zwischenstand „Hier beenden: Siegerehrung“ (zweimal klicken zum Bestätigen).

## Generalprobe

Im Quiz-Editor oben „Generalprobe“: prüft alle Bilder automatisch, warnt bei fehlenden Lösungen oder Spotify-Links, und jeder Song lässt sich anspielen (wird dann abgehakt). „Beamer-Vorschau öffnen“ zeigt jede Frage per „Auf Beamer“ genau wie am Abend, inklusive Musik-Countdown. Die Vorschau muss im selben Browser geöffnet werden.

## Show-Extras

- **Team-Emoji:** Teams wählen beim Beitreten ein Emoji, es steht vor dem Namen.
- **Joker:** Jedes Team kann einmal pro Abend während der Antwortzeit den Joker setzen. Die Fragenpunkte dieser Runde zählen doppelt (Rundenbonus nicht).
- **Antwortzeit:** Der Beamer zeigt „X von Y Teams haben geantwortet“. In den letzten 10 Sekunden wird der Countdown riesig, danach ertönt ein Gong.
- **Pausenmusik:** Während der Antwortzeit läuft eine leise Quizshow-Musik vom Moderations-Laptop. In der letzten Minute wird sie spannender, 12 Sekunden vor Schluss blendet sie aus (dann ticken die Show-Sounds und der Gong kommt). Sie läuft genau so lang wie die eingestellte Zeit, pausiert während ein Spotify-Song läuft und ist oben rechts an-/ausschaltbar mit Lautstärkeregler.
- **Show-Sounds** (Ticken, Gong, Trommelwirbel, Fanfare) kommen aus dem Moderations-Laptop. Oben rechts an- und ausschaltbar.
- **Bilder:** Im Editor pro Frage ein Bild hochladen oder einen Bild-Link einfügen. Bilder im Word-Dokument direkt unter der Frage werden beim Import übernommen. Bilder erscheinen auf Beamer und Handys.

## Word-Format

- `RUNDE 1: Thema` beginnt eine Runde, `MUSIKQUIZ: Thema` eine Musikrunde.
- Fragen nummeriert (`1.`), Antworten `a)` / `a.`; die **fett** gedruckte gilt als richtig. Fragen ohne Antworten werden freie Fragen; die richtige Antwort steht darunter in einer Zeile `Antwort: ...`.
- Musikrunde: eine Zeile pro Lied, `Interpret - Titel` (Reihenfolge egal).
- Bilderfragen: das Bild direkt unter die Frage (vor die Antworten) ins Dokument einfügen.
- Eine Zeile mit `Schätzfrage` markiert die folgende Frage als Schätzfrage für das Stechen.

## Lokal testen

Mit den Firebase-Emulatoren: `firebase emulators:start --only auth,firestore --project demo-pubquiz`, dann die Seiten über einen lokalen Webserver mit `?emu` am Ende öffnen.
