require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const app = express();
app.use(express.json());
app.use(cors());

// Statische Dateien aus dem "public" Ordner
app.use(express.static(path.join(__dirname, 'public')));

// ─── Health Check ───
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── PageSpeed API Proxy ───
app.get('/api/pagespeed', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  const key = process.env.GOOGLE_PSI_KEY || '';
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`
    + `?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=seo`
    + (key ? '&key=' + key : '');

  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 30000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        // Only retry on transient server errors
        if ((response.status === 500 || response.status === 503) && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }

        return res.status(200).json({
          error: 'pagespeed_unavailable',
          status: response.status,
          details: errorBody
        });
      }

      const data = await response.json();
      return res.json(data);

    } catch (e) {
      clearTimeout(timeout);

      if (e.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt * 2000));
          continue;
        }
        return res.status(200).json({
          error: 'pagespeed_unavailable',
          message: 'Request timed out after all retries.'
        });
      }

      // Non-abort errors: don't retry
      return res.status(200).json({ error: 'pagespeed_unavailable', message: e.message });
    }
  }
});

// ─── HTML Proxy (für Schema-Erkennung) ───
app.get('/api/fetchhtml', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch('https://' + url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrafikwaldBot/1.0)' }
    });
    clearTimeout(timeout);

    if (!response.ok) return res.status(200).json({ html: null });
    const html = await response.text();
    res.json({ html: html.slice(0, 500000) });
  } catch (e) {
    res.status(200).json({ html: null });
  }
});

// ─── Gemini API Proxy ───
app.post('/api/analyze', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  const { domain, techSummary } = req.body;
  if (!domain) return res.status(400).json({ error: 'domain required' });

  const ai = new GoogleGenAI({ apiKey: apiKey });

  // HIER IST DER NEUE PROMPT EINGEBAUT:
  const prompt = `Du bist ein hochkarätiger GEO-Experte (Generative Engine Optimization) der Agentur "Everfound". Analysiere die KI-Sichtbarkeit für die Domain: ${domain}

Bereits gemessene technische Werte: ${techSummary || 'keine Daten verfügbar'}

DEINE AUFGABE:
Nutze zwingend die Google Suche, um Folgendes für ${domain} herauszufinden:
1. Reale KI-Sichtbarkeit und Thementiefe in der jeweiligen Nische.
2. Finde 2 ECHTE, existierende direkte Wettbewerber aus derselben Region/Branche. 
WICHTIG ZU WETTBEWERBERN: Erfinde NIEMALS URLs. Wenn du keine echten findest, gib ein leeres Array [] aus.

VORGABEN ZUR ABGRENZUNG VON DER KONKURRENZ:
- "geo_factors": Kopiere KEINE Standardbegriffe wie "Answer-First Struktur", "Faktendichte" oder "Thematische Tiefe". Verwende stattdessen moderne, eigene Grafikwald-Begriffe (z.B. "LLM-Antwort-Fokus", "Entitäts-Relevanz", "KI-Vertrauenssignale", "Prompt-Sichtbarkeit"). Generiere 5 GANZ INDIVIDUELLE Faktoren.
- "actions": Generiere EXAKT 10 Maßnahmen. (Die ersten 3 bekommen priority "hoch", die restlichen 7 priority "mittel").
- "lost_monthly" / "lost_yearly": Schätze diese Zahlen REALISTISCH basierend auf der Branche. Ein lokaler Betrieb verliert vielleicht "3-5" Anfragen/Monat, ein B2B-Unternehmen "15-25".
- Scoring: score < 3.5 = kritisch, 3.5-4.9 = opt (Optimierungsbedarf), 5-6.9 = mittel, >= 7 = gut.

Antworte EXAKT in diesem JSON-Format (ohne Markdown, ohne Backticks):
{
  "website_name": "Realer Unternehmensname",
  "website_desc": "2 Sätze, was das Unternehmen konkret macht",
  "score": "Berechne den Score realistisch basierend auf dem Durchschnitt der technischen Faktoren und deiner Recherche von 0.0 bis 10.0",
  "rating": "Einschätzung basierend auf dem Score: z.B. kaum sichtbar, optimierungsbedarf, mittel, gut",
  "summary": "2 konkrete Sätze, warum der Score so ausfällt",
  "competitor_warning": "Dein Hauptwettbewerber liegt in einigen Metriken vor dir. [echte-domain.at] wird von KI-Systemen bereits aktiv empfohlen...",
  "geo_factors": [
    {"name": "[Individueller Faktor 1]", "score": "Realistischer Wert basierend auf der Recherche", "status": "opt", "finding": "[Echte Beobachtung]", "tip": "[Spezifischer Tipp]"},
    {"name": "[Individueller Faktor 2]", "score": "Realistischer Wert basierend auf der Recherche", "status": "kritisch", "finding": "[Echte Beobachtung]", "tip": "[Spezifischer Tipp]"},
    {"name": "[Individueller Faktor 3]", "score": "Realistischer Wert basierend auf der Recherche", "status": "mittel", "finding": "[Echte Beobachtung]", "tip": "[Spezifischer Tipp]"},
    {"name": "[Individueller Faktor 4]", "score": "Realistischer Wert basierend auf der Recherche", "status": "opt", "finding": "[Echte Beobachtung]", "tip": "[Spezifischer Tipp]"},
    {"name": "[Individueller Faktor 5]", "score": "Realistischer Wert basierend auf der Recherche", "status": "gut", "finding": "[Echte Beobachtung]", "tip": "[Spezifischer Tipp]"}
  ],
  "competitors": [
    {"domain": "[echte-konkurrenz1.at]", "score": "Realistischer Wert basierend auf der Recherche", "top_factor": "[Grund für Ranking]", "ki": "Oft"},
    {"domain": "[echte-konkurrenz2.at]", "score": "Realistischer Wert basierend auf der Recherche", "top_factor": "[Grund für Ranking]", "ki": "Regelmäßig"}
  ],
  "comp_note": "Warum diese beiden Wettbewerber KI-technisch besser aufgestellt sind.",
  "lost_monthly": "[Realistische Schätzung, z.B. 4-8]",
  "lost_yearly": "[lost_monthly mal 12, z.B. ~70]",
  "actions": [
    {"name": "[Maßnahme 1]", "desc": "[Anleitung]", "priority": "hoch"},
    {"name": "[Maßnahme 2]", "desc": "[Anleitung]", "priority": "hoch"},
    {"name": "[Maßnahme 3]", "desc": "[Anleitung]", "priority": "hoch"},
    {"name": "[Maßnahme 4]", "desc": "[Anleitung]", "priority": "mittel"},
    {"name": "[Maßnahme 5]", "desc": "[Anleitung]", "priority": "mittel"},
    {"name": "[Maßnahme 6]", "desc": "[Anleitung]", "priority": "mittel"},
    {"name": "[Maßnahme 7]", "desc": "[Anleitung]", "priority": "mittel"},
    {"name": "[Maßnahme 8]", "desc": "[Anleitung]", "priority": "mittel"},
    {"name": "[Maßnahme 9]", "desc": "[Anleitung]", "priority": "mittel"},
    {"name": "[Maßnahme 10]", "desc": "[Anleitung]", "priority": "mittel"}
  ]
}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text;

    // Wir extrahieren das JSON sicherheitshalber
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Keine gültige JSON-Antwort generiert' });

    res.json(JSON.parse(match[0]));

  } catch (e) {
    res.status(500).json({ error: e.message || 'Interner Serverfehler' });
  }
});

// ─── HubSpot Contact erstellen ───
app.post('/api/subscribe', async (req, res) => {
  const { email, firstname, domain, score } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) return res.status(200).json({ ok: true, note: 'no hubspot key configured' });

  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        properties: {
          email: email,
          firstname: firstname || '',
          website: domain || ''
          // Keine Custom-Felder mehr, damit HubSpot die Anfrage 100% akzeptiert!
        }
      })
    });

    // 409 bedeutet, der Kontakt ist schon in deinem CRM. Das ist auch okay!
    if (response.ok || response.status === 409) {
      return res.json({ ok: true });
    }

    if (response.ok || response.status === 409) {
      return res.json({ ok: true });
    }
    res.status(200).json({ ok: false });
  } catch (e) {
    res.status(200).json({ ok: false });
  }
});

// Alle anderen Routen → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`KI-Sichtbarkeits-Check läuft auf Port ${PORT}`);
});
