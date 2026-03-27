# KI-Sichtbarkeits-Check – Grafikwald

## Deployment auf Railway.app (10 Minuten, kostenlos)

### Schritt 1 – Vorbereitung
1. Erstelle ein kostenloses Konto auf **railway.app**
2. Erstelle ein kostenloses Konto auf **github.com** (falls noch nicht vorhanden)

### Schritt 2 – Dateien auf GitHub hochladen
1. Neues Repository erstellen auf github.com → "New repository"
2. Name: `ki-sichtbarkeits-check`, Public oder Private
3. Diese Dateien hochladen (drag & drop):
   - `server.js`
   - `package.json`
   - Ordner `public/` mit `index.html` darin

### Schritt 3 – Railway verbinden
1. railway.app → "New Project" → "Deploy from GitHub repo"
2. Dein Repository auswählen
3. Railway erkennt Node.js automatisch und startet den Build

### Schritt 4 – Environment Variables setzen
In Railway → dein Projekt → "Variables" → folgende eintragen:

```
ANTHROPIC_API_KEY = sk-ant-api03-dein-key-hier
GOOGLE_PSI_KEY   = (optional, für bessere PageSpeed-Daten)
```

**Anthropic API Key holen:**
→ console.anthropic.com/settings/keys → "Create Key"
→ Kosten: ca. 0,02–0,05€ pro Check

**Google PSI Key holen (optional):**
→ console.cloud.google.com → PageSpeed Insights API aktivieren → API Key erstellen
→ Kostenlos bis 25.000 Anfragen/Tag

### Schritt 5 – Domain einrichten
1. Railway → dein Projekt → "Settings" → "Domains"
2. Entweder: kostenlose Railway-Domain verwenden (xxx.railway.app)
3. Oder: eigene Domain eintragen (z.B. ki-check.grafikwald.com)

### Fertig!
Dein Tool ist jetzt online. Der API Key liegt sicher auf dem Server –
kein Kunde sieht ihn je.

---

## Lokal testen (ohne Deployment)

```bash
# Im Projektordner:
npm install

# Environment Variables setzen (einmalig):
# Mac/Linux:
export ANTHROPIC_API_KEY="sk-ant-..."
# Windows:
set ANTHROPIC_API_KEY=sk-ant-...

# Server starten:
npm start

# Browser öffnen:
# http://localhost:3000
```

---

## Datei-Struktur
```
ki-check-app/
├── server.js          ← Backend (API Keys sicher hier)
├── package.json       ← Dependencies
└── public/
    └── index.html     ← Frontend (kein API Key drin!)
```

## Video ersetzen
In `public/index.html` die YouTube-URL in der `loadVid()` Funktion tauschen:
```js
src="https://www.youtube.com/embed/DEINE_VIDEO_ID?autoplay=1"
```

## CTA-Links anpassen
In `public/index.html` alle Links `href="https://grafikwald.com"` 
auf deine gewünschte Landingpage oder Calendly-Link ändern.
