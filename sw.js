/* Conectwork · service worker (app instalável).
   Troque VERSAO a cada publicação: o navegador percebe a mudança, instala a versão nova e apaga os caches antigos.
   Guarda só os arquivos do próprio app, para abrir sem internet. Estratégia: rede primeiro, cache se offline.
   NUNCA guarda Firebase (login e banco), fontes externas nem nada de outra origem: esses pedidos nem passam por aqui. */
const VERSAO = 'conectwork-v104';

const ARQUIVOS = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/ui.js', 'js/firebase.js', 'js/permissoes.js', 'js/log.js', 'js/sessao.js', 'js/app.js', 'js/pwa.js',
  'modulos/lista.js', 'modulos/inicio.js', 'modulos/avisar.js', 'modulos/logos.js', 'modulos/cadastro.js', 'modulos/cadastromei.js', 'modulos/cadastros-master.js', 'modulos/rede.js', 'modulos/mensalidades.js', 'modulos/equipe-cw.js', 'modulos/avisos.js', 'modulos/emissores.js', 'modulos/usuarios.js', 'modulos/convite.js', 'modulos/historico.js', 'modulos/minha-empresa.js', 'modulos/avaliacoes.js', 'modulos/triagem.js', 'modulos/dossie.js', 'modulos/contratos.js', 'modulos/ordens.js', 'modulos/negocio.js', 'modulos/medicoes.js', 'modulos/nfse.js', 'modulos/assistente.js', 'modulos/espelhos.js', 'modulos/repasse.js', 'modulos/emissaomei.js', 'modulos/painelcidade.js', 'modulos/cidade.js', 'modulos/servicos.js', 'modulos/cursos.js', 'modulos/ajuda.js', 'modulos/meudas.js', 'modulos/titulos.js', 'modulos/relatorios.js', 'modulos/documentos.js', 'modulos/autorizacoes.js', 'modulos/meusdados.js', 'modulos/agenda.js', 'modulos/assistentemei.js', 'modulos/dinheiro.js', 'modulos/meudas.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];

self.addEventListener('install', ev => {
  /* cada arquivo separado: se um faltar, os outros ainda entram no cache */
  ev.waitUntil(caches.open(VERSAO).then(c => Promise.all(ARQUIVOS.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('conectwork-') && k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const r = ev.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;          /* outra origem (Firebase, fontes…): segue direto, sem cache */
  ev.respondWith(
    fetch(r, { cache: 'no-cache' })
      .then(res => {
        if (res.ok && res.type === 'basic') { const copia = res.clone(); caches.open(VERSAO).then(c => c.put(r, copia)); }
        return res;
      })
      .catch(() => caches.open(VERSAO).then(c => c.match(r, { ignoreSearch: true })
        .then(x => x || (r.mode === 'navigate' ? c.match('index.html').then(i => i || c.match('./')) : undefined))
        .then(x => x || Response.error())))
  );
});
