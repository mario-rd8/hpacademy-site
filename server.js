// Servidor Node.js sem dependências externas:
// 1. Serve o site estático da HP Academy (public/ e assets/)
// 2. Recebe leads em POST /api/lead (todos os formulários do site)
// 3. Dispara mensagem para o WhatsApp via Evolution API
// 4. Grava diretamente no Google Sheets via API v4 (Service Account, sem n8n)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Carrega .env local (em produção, use as variáveis de ambiente do Coolify)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
  });
} catch {}

const PORT = process.env.PORT || 3000;
const EVO_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || '';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const DESTINOS = (process.env.WHATSAPP_DESTINOS || '5581988090458,5581985008282').split(',').map(s => s.trim()).filter(Boolean);

// Configuração Google Sheets (Service Account — sem n8n)
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '1_owQtLlbedfDoM5UM4UndAStRnRCJf6Ut0y6HLeinGU';
const GOOGLE_SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || 'A:F';

function getGoogleCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      return { email: parsed.client_email, key: (parsed.private_key || '').replace(/\\n/g, '\n') };
    } catch (e) {
      console.error('GOOGLE_SERVICE_ACCOUNT_JSON inválido:', e.message);
    }
  }
  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      email: process.env.GOOGLE_CLIENT_EMAIL.trim(),
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }
  return null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

const ROOT = __dirname;

// Cache simples do token OAuth2 do Google (válido ~55 min)
let cachedToken = { token: null, exp: 0 };

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getGoogleAccessToken() {
  const creds = getGoogleCredentials();
  if (!creds || !creds.email || !creds.key) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken.token && cachedToken.exp > now + 60) {
    return cachedToken.token;
  }

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: creds.email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));

  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(creds.key).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth erro ${res.status}: ${errText}`);
  }

  const data = await res.json();
  cachedToken = { token: data.access_token, exp: now + (data.expires_in || 3500) };
  return data.access_token;
}

async function enviarWhatsApp({ nome, telefone, email, origem, professor }) {
  if (!EVO_URL || !EVO_INSTANCE || !EVO_KEY) {
    console.warn('Evolution API não configurada; envio de WhatsApp ignorado.');
    return;
  }
  const linhas = [
    `📝 *Novo Lead – HP Academy*`,
    ``,
    `*Nome:* ${nome}`,
    `*Telefone:* ${telefone}`
  ];
  if (email) linhas.push(`*E-mail:* ${email}`);
  if (professor) linhas.push(`*Professor:* ${professor}`);
  if (origem) linhas.push(`*Origem:* ${origem}`);

  const text = linhas.join('\n');
  const res = await Promise.all(DESTINOS.map(number =>
    fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number, text })
    })
  ));
  if (res.some(r => !r.ok)) {
    throw new Error('Falha ao enviar mensagem na Evolution API');
  }
}

async function salvarPlanilha({ nome, telefone, email, origem, professor }) {
  const token = await getGoogleAccessToken();
  if (!token) {
    console.warn('Google Service Account não configurada; gravação na planilha ignorada.');
    return;
  }
  const dataHora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife' });
  const range = encodeURIComponent(GOOGLE_SHEET_RANGE);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${GOOGLE_SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      values: [[nome, telefone, email || '', origem || 'Site HP Academy', professor || '', dataHora]]
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Sheets erro ${res.status}: ${errText}`);
  }
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/lead') {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 10000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const raw = JSON.parse(body || '{}');
        const lead = {
          nome: String(raw.nome || '').trim().slice(0, 120),
          telefone: String(raw.telefone || '').trim().slice(0, 25),
          email: String(raw.email || '').trim().slice(0, 120),
          origem: String(raw.origem || 'Hero - Pré-Matrícula').trim().slice(0, 80),
          professor: String(raw.professor || '').trim().slice(0, 80)
        };

        if (!lead.nome || lead.telefone.replace(/\D/g, '').length < 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end('{"ok":false,"error":"Dados inválidos"}');
        }

        const results = await Promise.allSettled([
          enviarWhatsApp(lead),
          salvarPlanilha(lead)
        ]);

        results.forEach((r, idx) => {
          if (r.status === 'rejected') {
            console.error(idx === 0 ? 'Erro WhatsApp:' : 'Erro Planilha:', r.reason);
          }
        });

        // Se o WhatsApp falhou e a planilha também falhou, retorna 500
        if (results.every(r => r.status === 'rejected')) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end('{"ok":false,"error":"Falha no processamento"}');
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (e) {
        console.error('Erro /api/lead:', e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"ok":false}');
      }
    });
    return;
  }

  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = p.startsWith('/assets/') ? path.join(ROOT, p) : path.join(ROOT, 'public', p);
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(ROOT))) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(resolved).toLowerCase();
    const isMedia = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'].includes(ext);
    const cacheControl = isMedia
      ? 'public, max-age=604800'
      : (ext === '.css' || ext === '.js' ? 'public, max-age=3600' : 'no-cache');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cacheControl
    });
    res.end(data);
  });
}).listen(PORT, () => console.log(`HP Academy rodando em http://localhost:${PORT}`));
