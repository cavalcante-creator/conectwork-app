/* Base dos testes de tela (mesmo jeito do painel de referência): abre o app num Chromium do Playwright,
   serve os arquivos do repositório num endereço falso e troca o Firebase da CDN pelo simulado (mock-firebase.js). */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const RAIZ = process.env.RAIZ || path.join(__dirname, '..');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-firebase.js'), 'utf8');
const BASE = 'http://conectwork.test/';
const TIPOS = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

async function abrir(op) {
  op = op || {};
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  /* service worker bloqueado aqui: os arquivos vêm do endereço falso; o teste-pwa.js testa o service worker num servidor de verdade */
  const ctx = await browser.newContext({ viewport: op.viewport || { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('gstatic.com/firebasejs/')) return route.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? MOCK : '' });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (u.startsWith(BASE)) {
      const p = decodeURIComponent(new URL(u).pathname.slice(1)) || 'index.html';
      if (p === 'vazio.html') return route.fulfill({ contentType: 'text/html', body: '<html><body>vazio</body></html>' });
      if (p === 'config.js' && op.config !== undefined) return route.fulfill({ contentType: 'text/javascript', body: op.config });
      if (p === 'config.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(RAIZ, p), 'utf8') + (op.microsoft === false ? '' : '\nwindow.CONECTWORK_CONFIG.loginMicrosoft = true;') });
      const f = path.join(RAIZ, p);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ body: fs.readFileSync(f), contentType: TIPOS[path.extname(p)] });
      return route.fulfill({ status: 404, body: '' });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e && e.message || e)));
  page.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  return { browser, ctx, page, erros };
}

/* banco inicial (só dados de teste, nunca vão para produção):
   Ana (admin da Alfa, aprovada), Bruno (financeiro na Alfa e contador na Beta), Carla (sem acesso),
   Duda (bloqueada na Alfa), Iasmyn (equipe Conectwork), Gil (admin da Gama, em análise) */
function seed(extra) {
  const uid = { ana: 'uANA', bruno: 'uBRUNO', carla: 'uCARLA', duda: 'uDUDA', iasmyn: 'uIASMYN', gil: 'uGIL' };
  const ac = (u, emp, cargo, x) => Object.assign({ uid: u, empresaId: emp, cargo, extras: [], sem: [], ativo: true }, x || {});
  const d = {
    users: {
      'ana@alfa.com.br': { uid: uid.ana, pass: 'senha123' },
      'bruno@alfa.com.br': { uid: uid.bruno, pass: 'senha123' },
      'carla@outra.com.br': { uid: uid.carla, pass: 'senha123' },
      'duda@alfa.com.br': { uid: uid.duda, pass: 'senha123' },
      'iasmyn@conectwork.com.br': { uid: uid.iasmyn, pass: 'senha123' },
      'gil@gama.com.br': { uid: uid.gil, pass: 'senha123' },
      'parado@alfa.com.br': { uid: 'uPARADO', pass: 'senha123', disabled: true }
    },
    docs: {
      'master/uIASMYN': { nome: 'Iasmyn' },
      'usuarios/uANA': { nome: 'Ana Souza', email: 'ana@alfa.com.br' },
      'usuarios/uBRUNO': { nome: 'Bruno Lima', email: 'bruno@alfa.com.br' },
      'usuarios/uIASMYN': { nome: 'Iasmyn', email: 'iasmyn@conectwork.com.br' },
      'empresas/alfa': { nome: 'Alfa Serviços', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: uid.ana },
      'empresas/beta': { nome: 'Beta Indústria', status: 'aprovado', tipo: 'contratante', modulos: ['cobrancas'], criadoPor: 'uX' },
      'empresas/gama': { nome: 'Gama Logística', status: 'analise', tipo: 'contratante', criadoPor: uid.gil },
      ['acessos/alfa_' + uid.ana]: ac(uid.ana, 'alfa', 'admin'),
      ['acessos/alfa_' + uid.bruno]: ac(uid.bruno, 'alfa', 'financeiro'),
      ['acessos/beta_' + uid.bruno]: ac(uid.bruno, 'beta', 'contador'),
      ['acessos/alfa_' + uid.duda]: ac(uid.duda, 'alfa', 'operacional', { ativo: false }),
      ['acessos/gama_' + uid.gil]: ac(uid.gil, 'gama', 'admin')
    }
  };
  if (extra) extra(d, uid);
  return { d, uid };
}

async function preparar(page, banco, ctl) {
  await page.goto(BASE + 'vazio.html');
  await page.evaluate(([b, c]) => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('__srv', JSON.stringify(b)); localStorage.setItem('__ctl', JSON.stringify(c || {})); }, [banco, ctl]);
}
const ctlSet = (page, c) => page.evaluate(c => localStorage.setItem('__ctl', JSON.stringify(c)), c);
async function entrar(page, email, senha) {
  await page.waitForSelector('#lg-email', { timeout: 8000 });
  await page.fill('#lg-email', email); await page.fill('#lg-senha', senha); await page.click('#lg-entrar');
}
const txt = (page, sel) => page.$eval(sel, e => e.innerText).catch(() => null);
const dorme = ms => new Promise(r => setTimeout(r, ms));

/* placar no padrão do painel: PASSOU/FALHOU por linha e arquivo resultado-<nome>.json */
function placar(nome) {
  const res = [];
  const ok = (n, cond, det) => { res.push({ n, ok: !!cond, det }); console.log((cond ? 'PASSOU ' : 'FALHOU ') + n + (det ? ' — ' + String(det).slice(0, 300) : '')); };
  const fim = (erros) => {
    if (erros) ok('Sem erros de JavaScript na página', !erros.length, erros.slice(0, 5).join(' | '));
    const f = res.filter(r => !r.ok).length;
    console.log(`\n${res.length - f} de ${res.length} testes de ${nome} passaram.`);
    fs.writeFileSync(path.join(__dirname, 'resultado-' + nome + '.json'), JSON.stringify({ res, erros: erros || [] }, null, 1));
    return f ? 1 : 0;
  };
  return { ok, fim };
}

module.exports = { abrir, seed, preparar, ctlSet, entrar, txt, dorme, placar, BASE, RAIZ };
