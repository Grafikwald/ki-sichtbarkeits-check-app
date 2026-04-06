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

  try {
    const key = process.env.GOOGLE_PSI_KEY || '';
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=seo${key ? '&key=' + key : ''}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(200).json({ error: 'pagespeed_unavailable' });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(200).json({ error: 'pagespeed_unavailable' });
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

  const prompt = `Du bist GEO-Experte (Generative Engine Optimization). Analysiere die KI-Sichtbarkeit von: ${domain}

Bereits gemessene technische Werte: ${techSummary || 'keine Daten verfügbar'}

Nutze die Google Suche, um folgendes zu prüfen:
1. Wie bekannt ist ${domain} in Suchantworten?
2. Taucht die Website bei branchenrelevanten Fragen auf?
3. Lokale/regionale Präsenz?
4. Suche nach 2 echten direkten Wettbewerbern in derselben Branche und Region. ERFINDE NIEMALS Domains. Wenn du keine echten findest, lass das Array leer.

Antworte EXAKT in diesem JSON-Format (Ohne Markdown, ohne Backticks):
{"website_name":"Unternehmensname","website_desc":"2 Sätze was das Unternehmen macht","score":4.7,"rating":"kaum sichtbar","summary":"2 konkrete Sätze warum der Score so ist","competitor_warning":"Dein Hauptwettbewerber liegt in X von 10 Faktoren vor dir. domain.de wird von KI-Systemen bereits aktiv empfohlen. Jede Anfrage die dort landet fehlt dir.","geo_factors":[{"name":"Faktendichte","score":5.0,"status":"opt","finding":"Konkrete Beobachtung zur Domain","tip":"Konkreter Tipp"},{"name":"Aktualität & Frische","score":4.5,"status":"opt","finding":"Konkrete Beobachtung","tip":"Konkreter Tipp"},{"name":"Thematische Tiefe","score":6.0,"status":"mittel","finding":"Konkrete Beobachtung","tip":"Konkreter Tipp"},{"name":"Heading & Architektur","score":5.5,"status":"opt","finding":"Konkrete Beobachtung","tip":"Konkreter Tipp"},{"name":"Semantische Klarheit","score":5.0,"status":"opt","finding":"Konkrete Beobachtung","tip":"Konkreter Tipp"}],"competitors":[{"domain":"konkurrent1.at","score":7.4,"top_factor":"Schema Markup","ki":"Regelmäßig"},{"domain":"konkurrent2.at","score":6.8,"top_factor":"Answer-First Struktur","ki":"Oft"}],"comp_note":"Ein konkreter Satz warum diese Wettbewerber besser abschneiden.","lost_monthly":"6-9","lost_yearly":"~72","actions":[{"name":"Schema Markup","desc":"Implementiere Article, FAQPage, HowTo.","priority":"hoch"},{"name":"Answer-First Struktur","desc":"Stelle klare Antworten in den ersten 40–60 Wörtern.","priority":"hoch"},{"name":"KI-Crawlbarkeit","desc":"Erlaube KI-Crawler in robots.txt.","priority":"hoch"},{"name":"Externe Autorität","desc":"Aufbau von Erwähnungen.","priority":"mittel"},{"name":"E-E-A-T Signale","desc":"Zertifizierungen darstellen.","priority":"mittel"}]}

Scoring: score<3.5=kritisch, 3.5-4.9=opt (Optimierungsbedarf), 5-6.9=mittel, >=7=gut. Alles auf Deutsch. Sehr spezifisch zur Domain.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }] // <-- Hier war der Fehler, jetzt ist er korrigiert!
      }
    });

    const text = response.text;
    
    // Wir extrahieren das JSON sicherheitshalber
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'Keine gültige JSON-Antwort generiert' });

    res.json(JSON.parse(match[0]));

  } catch (e) {
    console.error("Gemini API Error:", e);
    res.status(500).json({ error: e.message || 'Interner Serverfehler' });
  }
});

// ─── HubSpot Contact erstellen ───
app.post('/api/subscribe', async (req, res) => {
  const { email, domain, score } = req.body;
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
          website: domain || '',
          hs_lead_source: 'KI-Sichtbarkeits-Check',
          description: 'KI-Score: ' + (score || '?') + '/10 via ki-check Tool'
        }
      })
    });
    if (!response.ok) {
      const err = await response.text();
      if (response.status === 409) return res.json({ ok: true });
      return res.status(200).json({ ok: false, error: err });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
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
