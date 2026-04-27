import express from 'express';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import cors from 'cors';

// Hebrew / Aramaic Nikkud constants
const NIKKUD_START = 0x05B0;
const NIKKUD_END = 0x05C7;
const CANTILLATION_START = 0x0591;
const CANTILLATION_END = 0x05AF;

function stripNikkud(text: string): string {
  return text.split('').filter(ch => {
    const cp = ch.charCodeAt(0);
    return !(
      (cp >= NIKKUD_START && cp <= NIKKUD_END) ||
      (cp >= CANTILLATION_START && cp <= CANTILLATION_END)
    );
  }).join('');
}

// Helper to get a window of words around a target
function getWordWindow(text: string, targetWordStrip: string, windowSize: number = 10) {
  const words = text.split(/\s+/);
  const matches: string[][] = [];
  
  if (!targetWordStrip) return [];

  for (let i = 0; i < words.length; i++) {
    const raw = words[i];
    const stripped = stripNikkud(raw);
    
    if (stripped && (stripped.includes(targetWordStrip) || targetWordStrip.includes(stripped))) {
      const start = Math.max(0, i - windowSize);
      const end = Math.min(words.length, i + windowSize + 1);
      matches.push(words.slice(start, end));
      if (matches.length >= 5) break; // Limit to 5 matches per page
    }
  }

  // Fallback: If no match, just take a window from the start of the text
  if (matches.length === 0 && words.length > 0) {
    matches.push(words.slice(0, windowSize * 2));
  }

  return matches;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  const BASE_URL = 'https://daf-yomi.com';

  // --- API Routes for Scraping ---

  // 1. Autocomplete Proxy
  app.get('/api/scrape/autocomplete', async (req, res) => {
    try {
      const { term } = req.query;
      const response = await axios.get(`${BASE_URL}/AramicDictionary_Autocomplete.ashx`, {
        params: { term, lang: 'arc' },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      res.json(response.data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch autocomplete' });
    }
  });

  // 2. Gemara Search
  app.get('/api/scrape/search', async (req, res) => {
    try {
      const { word, page = 1 } = req.query;
      console.log(`[Scrape] Searching for: ${word}`);
      
      // Try to use a very standard browser profile
      const response = await axios.get(`${BASE_URL}/PageSearchPlain.aspx`, {
        params: {
          Word1: word,
          SearchType: 2,
          Relationship: 1,
          CharDistance: 100,
          Source: 1,
          page: page
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://daf-yomi.com/',
          'DNT': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results: any[] = [];
      const seen = new Set();

      $('a').each((i, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/massechet=(\d+)&amud=(\d+)/i);
        if (m) {
          const key = `${m[1]}-${m[2]}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              massechet: m[1],
              amud: m[2],
              label: $(el).text().trim() || `דף ${m[2]}`,
              url_nikkud: `${BASE_URL}/Dafyomi_Page.aspx?vt=3&massechet=${m[1]}&amud=${m[2]}&fs=0`,
              url_explain: `${BASE_URL}/Dafyomi_Page.aspx?vt=5&massechet=${m[1]}&amud=${m[2]}&fs=0`
            });
          }
        }
      });

      console.log(`[Scrape] Found ${results.length} results for ${word}`);
      res.json(results);
    } catch (error: any) {
      console.error('[Scrape] Search error (likely 403):', error.message);
      // Return empty array instead of 500 so frontend can fallback to AI references
      res.json([]);
    }
  });

  // 3. Detailed Context Fetcher
  app.get('/api/scrape/context', async (req, res) => {
    try {
      const { massechet, amud, word } = req.query;
      console.log(`[Scrape] Detailed context for ${massechet}/${amud} (Word: ${word})`);
      
      const strippedWord = stripNikkud((word as string) || "");

      const axiosConfig = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Referer': 'https://daf-yomi.com/'
        },
        timeout: 15000
      };

      // Fetch Nikkud (vt=3) and Explain (vt=5) in parallel
      const [resNikkud, resExplain] = await Promise.all([
        axios.get(`${BASE_URL}/Dafyomi_Page.aspx?vt=3&massechet=${massechet}&amud=${amud}&fs=0`, axiosConfig),
        axios.get(`${BASE_URL}/Dafyomi_Page.aspx?vt=5&massechet=${massechet}&amud=${amud}&fs=0`, axiosConfig)
      ]);

      const $n = cheerio.load(resNikkud.data);
      const $e = cheerio.load(resExplain.data);

      const getText = ($: any) => {
        let content = '';
        const selectors = ['.daf-text', '.page-text', '#PageText', '#dafText', 'div[class*="text"]'];
        for (const sel of selectors) {
          if ($(sel).length) {
            content = $(sel).text().trim();
            break;
          }
        }
        return content || $('body').text();
      };

      const textNikkud = getText($n);
      const textExplain = getText($e);

      // Extract bold words from explanation page as anchors
      const boldWords: string[] = [];
      $e('b').each((i, el) => {
        boldWords.push($e(el).text().trim());
      });

      res.json({
        nikkudWindows: getWordWindow(textNikkud, strippedWord, 10),
        explainWindows: getWordWindow(textExplain, strippedWord, 10),
        boldWords
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch context' });
    }
  });

  // --- Vite Middleware Server ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
