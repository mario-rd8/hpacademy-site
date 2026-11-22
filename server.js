// Servidor Node.js sem dependências externas:
// 1. Serve o site estático da HP Academy (public/ e assets/)
// 2. Recebe leads em POST /api/lead (todos os formulários do site)
// 3. Dispara notificação para o WhatsApp via Evolution API
// 4. Envia o lead diretamente para o HP Academy CRM (https://crm.hpacademy.com.br/api/webhooks/lead)

const http = require('http');
const fs = require('fs');
const path = require('path');

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

// Configuração HP Academy CRM
const CRM_WEBHOOK_URL = (process.env.CRM_WEBHOOK_URL || 'https://crm.hpacademy.com.br/api/webhooks/lead').trim();
const CRM_WEBHOOK_SECRET = (process.env.CRM_WEBHOOK_SECRET || '').trim();

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

function extrairTags({ origem, professor }) {
  const texto = `${origem || ''} ${professor || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const tags = [];
  if (texto.includes('enem')) tags.push('enem');
  if (texto.includes('ssa') || texto.includes('upe')) tags.push('ssa');
  if (texto.includes('paulista') || /\bsp\b/.test(texto)) tags.push('sp');
  if (texto.includes('f2') || texto.includes('fundamental')) tags.push('F2');
  return tags;
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

async function enviarParaCrm({ nome, telefone, origem, professor }) {
  if (!CRM_WEBHOOK_URL) {
    console.warn('CRM_WEBHOOK_URL não configurada; envio para o CRM ignorado.');
    return;
  }

  const origemFormatada = professor
    ? `${origem || 'Site HP Academy'} (${professor})`
    : (origem || 'Site HP Academy');

  const headers = { 'Content-Type': 'application/json' };
  if (CRM_WEBHOOK_SECRET) {
    headers['x-webhook-secret'] = CRM_WEBHOOK_SECRET;
  }

  const res = await fetch(CRM_WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      nome,
      telefone,
      origem: origemFormatada,
      tags: extrairTags({ origem, professor })
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HP Academy CRM erro ${res.status}: ${errText}`);
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
          enviarParaCrm(lead)
        ]);

        results.forEach((r, idx) => {
          if (r.status === 'rejected') {
            console.error(idx === 0 ? 'Erro WhatsApp:' : 'Erro CRM:', r.reason);
          }
        });

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
