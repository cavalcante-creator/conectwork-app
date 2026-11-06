/* Teste do app instalável (PWA): manifest, ícones, service worker ativo, abrir sem internet depois da primeira visita,
   faixa de offline e troca de VERSAO apagando o cache antigo.
   O service worker só funciona em https ou em localhost, então aqui os arquivos vêm de um servidor local de verdade
   (os outros testes usam um endereço falso e deixam o service worker bloqueado). O Firebase continua simulado. */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const H = require('./harness');
const { ok, fim } = H.placar('pwa');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-firebase.js'), 'utf8');
const TIPOS = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

let versaoNova = null;                     /* quando preenchido, o servidor entrega o sw.js com outra VERSAO */
const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1)) || 'index.html';
  if (p === 'vazio.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body>vazio</body></html>'); }
  const f = path.join(H.RAIZ, p);
  if (!f.startsWith(H.RAIZ) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(''); }
  let corpo = fs.readFileSync(f);
  if (p === 'sw.js' && versaoNova) corpo = Buffer.from(String(corpo).replace(/const VERSAO = '[^']*'/, `const VERSAO = '${versaoNova}'`));
  res.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(corpo);
});

(async () => {
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  const BASE = `http://localhost:${servidor.address().port}/`;
  const VERSAO = (fs.readFileSync(path.join(H.RAIZ, 'sw.js'), 'utf8').match(/const VERSAO = '([^']+)'/) || [])[1];

  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let semRede = false;                     /* com a "internet" desligada, o Firebase da CDN não chega */
  const externos = [];
  await ctx.route(u => !String(u).startsWith(BASE), route => {
    const u = route.request().url(); externos.push(u);
    if (semRede) return route.abort('internetdisconnected');
    if (u.includes('gstatic.com/firebasejs/')) return route.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? MOCK : '' });
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', e => erros.push(String(e && e.message || e)));
  const { d } = H.seed();
  const prepara = () => page.evaluate(b => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('__srv', JSON.stringify(b)); localStorage.setItem('__ctl', '{}'); }, d);

  // P1 manifest
  await page.goto(BASE + 'vazio.html'); await prepara();
  await page.goto(BASE); await page.waitForSelector('#lg-email', { timeout: 10000 });
  const p1 = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]'); if (!link) return { link: false };
    const r = await fetch(link.href); const m = await r.json();
    const icones = await Promise.all((m.icons || []).map(async i => { const x = await fetch(new URL(i.src, link.href)); return { src: i.src, ok: x.ok, tipo: x.headers.get('content-type'), purpose: i.purpose }; }));
    return { link: true, ok: r.ok, m, icones };
  });
  const m = p1.m || {};
  ok('P1 manifest carrega com nome, descrição, idioma, início, modo app e cores da tela de entrada',
    p1.ok && m.name === 'Conectwork' && m.short_name === 'Conectwork' && m.lang === 'pt-BR' && m.start_url === './' && m.scope === './' && m.display === 'standalone'
    && m.theme_color === '#081638' && m.background_color === '#081638'
    && m.description === 'Plataforma mais completa em outsourcing. Toda papelada e burocracia em um só lugar, na palma da sua mão.', JSON.stringify(m).slice(0, 300));
  ok('P2 ícones 192, 512 e maskable carregam (PNG)', (p1.icones || []).length === 3 && p1.icones.every(i => i.ok && /png/.test(i.tipo)) && p1.icones.some(i => i.purpose === 'maskable'), JSON.stringify(p1.icones));

  const p3 = await page.evaluate(() => {
    const a = s => (document.querySelector(s) || {}).getAttribute ? document.querySelector(s).getAttribute('content') || document.querySelector(s).getAttribute('href') : null;
    return { touch: a('link[rel="apple-touch-icon"]'), capaz: a('meta[name="apple-mobile-web-app-capable"]'), titulo: a('meta[name="apple-mobile-web-app-title"]'),
      barra: a('meta[name="apple-mobile-web-app-status-bar-style"]'), favicon: a('link[rel="icon"]'), tema: a('meta[name="theme-color"]') };
  });
  const touch = await page.evaluate(async h => (await fetch(h)).ok, p3.touch || 'x');
  ok('P3 iPhone: apple-touch-icon, tela cheia, título e barra de status; favicon e cor do tema',
    touch && p3.capaz === 'yes' && p3.titulo === 'Conectwork' && !!p3.barra && p3.favicon === 'icons/favicon-32.png' && p3.tema === '#081638', JSON.stringify(p3));

  // P4 service worker ativo e cache só com arquivos do app
  const p4 = await page.evaluate(async () => {
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 8000))]);
    return { estado: reg && reg.active && reg.active.state, escopo: reg && reg.scope };
  });
  ok('P4 service worker registrado e ativo no escopo do app', p4.estado === 'activated' && p4.escopo === BASE, JSON.stringify(p4));

  await page.reload(); await page.waitForSelector('#lg-email', { timeout: 10000 }); await H.dorme(400);
  const p5 = await page.evaluate(async () => {
    const chaves = await caches.keys(); const urls = [];
    for (const k of chaves) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
    return { controla: !!navigator.serviceWorker.controller, chaves, urls };
  });
  const precisa = ['index.html', 'css/app.css', 'js/sessao.js', 'js/pwa.js', 'config.js', 'modulos/inicio.js', 'manifest.webmanifest', 'icons/icon-192.png'];
  ok('P5 a página é controlada pelo service worker e o cache tem os arquivos do app (VERSAO ' + VERSAO + ')',
    p5.controla && p5.chaves.length === 1 && p5.chaves[0] === VERSAO && precisa.every(f => p5.urls.includes(BASE + f)), JSON.stringify({ c: p5.controla, k: p5.chaves, n: p5.urls.length }));
  ok('P6 nada de outra origem no cache (nem Firebase, nem fontes)', p5.urls.length > 0 && p5.urls.every(u => u.startsWith(BASE)) && externos.some(u => u.includes('gstatic.com/firebasejs/')),
    p5.urls.filter(u => !u.startsWith(BASE)).join(' ') || p5.urls.length + ' arquivos');

  // P7 a conexão cai com o app aberto: faixa aparece; volta: some
  await ctx.setOffline(true); await H.dorme(300);
  const faixa = () => page.evaluate(() => { const f = document.getElementById('offline'); return { vis: !!f && !f.hidden && getComputedStyle(f).display !== 'none', t: f ? f.innerText.trim() : '' }; });
  const f1 = await faixa();
  await ctx.setOffline(false); await H.dorme(300); const f2 = await faixa();
  ok('P7 conexão cai: faixa "Você está offline…" aparece; conexão volta: faixa some',
    f1.vis && f1.t === 'Você está offline. Nada é enviado ao servidor até a conexão voltar.' && !f2.vis, JSON.stringify([f1, f2]));

  // P8 sem internet, o app abre (depois da primeira visita) e explica que precisa da conexão para entrar
  await ctx.setOffline(true); semRede = true;
  await page.reload({ waitUntil: 'load' }).catch(() => {}); await H.dorme(800);
  const p8 = await page.evaluate(() => ({ marca: (document.querySelector('.brandpanel h1') || {}).innerText, css: getComputedStyle(document.querySelector('.login') || document.body).backgroundColor,
    tela: (document.getElementById('sem-conexao') || {}).innerText || '', faixa: !document.getElementById('offline').hidden, firebase: !!window.firebase }));
  ok('P8 sem internet o app abre do cache (visual completo) e mostra "Sem conexão", sem fingir login',
    p8.marca === 'Conectwork' && p8.css === 'rgb(8, 22, 56)' && /Sem conexão com a internet/.test(p8.tela) && p8.faixa && !p8.firebase, JSON.stringify(p8));
  ok('P9 sem internet o Firebase não vem de cache nenhum', !p8.firebase);

  // P10 a conexão volta: a faixa some e a tela de entrada aparece sozinha
  semRede = false; await ctx.setOffline(false);
  const voltou = await page.waitForSelector('#lg-email', { timeout: 10000 }).then(() => true).catch(() => false);
  const f3 = await faixa();
  ok('P10 conexão volta: a tela de entrada aparece sozinha e a faixa some', voltou && !f3.vis, JSON.stringify({ voltou, f3 }));

  // P11 VERSAO nova no sw.js: instala e apaga o cache antigo
  versaoNova = 'conectwork-teste-nova';
  const p11 = await page.evaluate(async nova => {
    const reg = await navigator.serviceWorker.getRegistration(); await reg.update();
    for (let i = 0; i < 50; i++) { const k = await caches.keys(); if (k.length === 1 && k[0] === nova) return k; await new Promise(r => setTimeout(r, 100)); }
    return caches.keys();
  }, versaoNova);
  ok('P11 trocar VERSAO no sw.js instala a versão nova e apaga o cache antigo', p11.length === 1 && p11[0] === versaoNova, JSON.stringify(p11));

  const code = fim(erros); await browser.close(); servidor.close(); process.exit(code);
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
