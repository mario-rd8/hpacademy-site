// Servidor sem dependências: serve a landing e envia leads via Evolution API.
// A API key fica só no servidor (nunca exposta no navegador).
const http = require('http');
const fs = require('fs');
const path = require('path');

// Carrega .env local (em produção, use as variáveis do Coolify)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  });
} catch {}

const SHEET_WEBHOOK = process.env.SHEET_WEBHOOK_URL || '';
const PORT = process.env.PORT || 3000;
const EVO_URL = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || '';
const EVO_KEY = process.env.EVOLUTION_API_KEY || '';
const DESTINOS = (process.env.WHATSAPP_DESTINOS || '5581988090458,5581985008282').split(',');

const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.css': 'text/css', '.js': 'text/javascript' };
const ROOT = __dirname;

async function enviar(nome, telefone) {
  const text = `📝 *Nova Pré-Matrícula – HP Academy*\n\n*Nome:* ${nome}\n*Telefone:* ${telefone}`;
  const res = await Promise.all(DESTINOS.map(number =>
    fetch(`${EVO_URL}/message/sendText/${EVO_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number: number.trim(), text })
    })
  ));
  if (res.some(r => !r.ok)) throw new Error('Falha Evolution API');
}

async function salvarPlanilha(nome, telefone) {
  if (!SHEET_WEBHOOK) return;
  const data = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife' });
  try {
    await fetch(SHEET_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, nome, telefone }) });
  } catch (e) { console.error('Falha planilha', e); }
}

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/lead') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5000) req.destroy(); });
    req.on('end', async () => {
      try {
        const { nome, telefone } = JSON.parse(body);
        const n = String(nome || '').trim().slice(0, 100);
        const t = String(telefone || '').trim().slice(0, 20);
        if (!n || t.replace(/\D/g, '').length < 10) { res.writeHead(400); return res.end(); }
        await Promise.all([enviar(n, t), salvarPlanilha(n, t)]);
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
      } catch (e) { console.error(e); res.writeHead(500); res.end(); }
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = p.startsWith('/assets/') ? path.join(ROOT, p) : path.join(ROOT, 'public', p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`HP Academy em http://localhost:${PORT}`));
