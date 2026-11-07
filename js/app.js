/* Conectwork · casca do app: registro de módulos, menu lateral, barra de baixo no celular e roteamento por hash.
   Rota: #modulo/tela/param1/param2… (ex.: #inicio, #usuarios/convites). Sem tela = primeira tela do módulo.

   Registro de módulo (um arquivo por módulo em modulos/, incluído em modulos/lista.js):
   CW.registrarModulo({
     id: 'usuarios', nome: 'Usuários e acessos', icone: 'users', ordem: 50,
     para: ['empresa'], livre: false, semAprovacao: false, contrato: 'equipe',   // ver js/permissoes.js
     telas: { lista: { nome: 'Usuários e acessos', sub: 'texto abaixo do título', render(el, ctx) { … } } },
     iniciar(ctx) { … ; return () => { // limpeza ao sair ou trocar de empresa } },
     pendencias(ctx) { return [{ txt: 'O que fazer', sub: 'detalhe', rota: 'modulo/tela/id' }] }   // opcional: "Precisa de você"
   });
   Quando os dados de um módulo mudam, ele chama CW.app.pendenciasMudaram(): o app recalcula o "Precisa de você" do Início,
   os contadores do menu e o número no ícone do app instalado.
   ctx = { modulo, tela, params, contexto (empresa ou master atual), sessao (estado), soLeitura } */
(function () {
  const CW = window.CW = window.CW || {};
  const U = () => CW.ui;
  const MODULOS = [];
  let montado = false, limpezas = [], ouvintes = {}, atual = null, pendTimer = null;

  function registrarModulo(m) {
    if (!m || !m.id || !m.nome || !m.telas || !Object.keys(m.telas).length) { console.error('registrarModulo: informe id, nome e telas', m); return; }
    if (MODULOS.some(x => x.id === m.id)) { console.error('registrarModulo: id repetido', m.id); return; }
    MODULOS.push(m); MODULOS.sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100));
  }

  const visiveis = () => { const ctx = CW.sessao.contexto(); return MODULOS.filter(m => CW.permissoes.podeVer(m, ctx)); };

  /* ---------- menu: módulos com menu:false abrem pela rota, mas não aparecem no menu (ex.: Minhas autorizações).
     Profissional MEI (empresa só prestadora, porte MEI): menu enxuto, com nomes do dia a dia dele e "Ver todas as telas". */
  const ENXUTO = ['inicio', 'negocio', 'ordens', 'espelhos', 'titulos', 'contratos', 'documentos', 'empresa'];
  const NOMES_MEI = { espelhos: 'Notas a emitir', titulos: 'A receber' };
  const ctxEmp = () => { const c = CW.sessao.contexto(); return c && c.tipo === 'empresa' ? c : null; };
  const chaveCompleto = () => 'cw.menu.completo.' + ((ctxEmp() || {}).empresaId || '');
  function porteMei() {
    const c = ctxEmp(); if (!c || (c.empresa || {}).tipo !== 'prestador') return false;
    let p = null; try { p = sessionStorage.getItem('cw.porte.' + c.empresaId); } catch (e) {}
    return String(p || '').startsWith('MEI');
  }
  const enxuto = () => { if (!porteMei()) return false; try { return localStorage.getItem(chaveCompleto()) !== '1'; } catch (e) { return true; } };
  function menuMods() {
    const vis = visiveis().filter(m => m.menu !== false);
    if (!enxuto()) return vis;
    return ENXUTO.map(id => vis.find(m => m.id === id)).filter(Boolean).map(m => NOMES_MEI[m.id] ? Object.assign({}, m, { nome: NOMES_MEI[m.id], nomeCurto: NOMES_MEI[m.id] }) : m);
  }
  /* descobre o porte (área privada da empresa) uma vez por sessão; se for MEI, refaz o menu */
  function conferirPorte() {
    const c = ctxEmp(); if (!c || (c.empresa || {}).tipo !== 'prestador') return;
    const k = 'cw.porte.' + c.empresaId; let ja = null; try { ja = sessionStorage.getItem(k); } catch (e) {}
    if (ja !== null) return;
    CW.fb.db().doc('empresas/' + c.empresaId + '/privado/cadastro').get().then(sn => {
      const porte = (((CW.fb.dados(sn) || {}).dados) || {}).porte || '';
      try { sessionStorage.setItem(k, porte); } catch (e) {}
      if (String(porte).startsWith('MEI') && montado) montar();
    }).catch(() => { try { sessionStorage.setItem(k, ''); } catch (e) {} });
  }
  function alternarMenu() { try { if (enxuto()) localStorage.setItem(chaveCompleto(), '1'); else localStorage.removeItem(chaveCompleto()); } catch (e) {} montar(); }

  /* listener do Firestore que é desligado sozinho ao sair ou trocar de empresa */
  function inscrever(chave, consulta, aoMudar, aoErro) {
    if (ouvintes[chave]) ouvintes[chave]();
    ouvintes[chave] = consulta().onSnapshot(aoMudar, e => { console.error(chave, e); (aoErro || (x => U().toast(CW.fb.mensagemErro(x), 'erro')))(e); });
  }

  function lerRota() {
    const partes = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
    return { modulo: partes[0] || '', tela: partes[1] || '', params: partes.slice(2) };
  }
  function ir(rota) { const h = '#' + rota; if (location.hash === h) desenhar(); else location.hash = h; }

  /* ---------- casca ---------- */
  function montar() {
    desmontar();
    const s = CW.sessao.estado(), ctx = s.contexto, { ic, esc, LOGO, CURVES, avatar } = U();
    const nome = (s.perfil && s.perfil.nome) || s.usuario.email;
    const sub = (ctx.tipo === 'master' ? 'Equipe Conectwork' : CW.permissoes.nomeCargo(ctx.acesso.cargo) + ' · ' + ctx.nome);
    const mods = menuMods(), mei = porteMei();
    const teste = CW.fb.ambiente() === 'teste' ? '<span class="env">Ambiente de testes</span>' : '';
    document.documentElement.classList.remove('entrada', 'wizpg'); document.documentElement.classList.add('casca');
    document.getElementById('app').innerHTML = `<div class="shell">
      <aside class="side">${CURVES}
        <div class="logo">${LOGO(32)}<span>Conect<b>work</b></span></div>
        <div class="navlabel">MENU</div>
        <nav class="nav" id="menu" aria-label="Principal">${mods.map(m => `<button data-mod="${esc(m.id)}">${ic(m.icone)}<span>${esc(m.nome)}</span></button>`).join('')}
          ${mei ? `<button class="nav-alt" id="menu-alt">${ic(enxuto() ? 'grid' : 'star')}<span>${enxuto() ? 'Ver todas as telas' : 'Menu simples'}</span></button>` : ''}</nav>
        <div class="usercard">${avatar(nome, 'sm')}<div class="t"><strong id="quem-nome">${esc(nome)}</strong><small id="quem-sub">${esc(sub)}</small></div>
          <button class="iconbtn" id="minhas-aut" aria-label="Minhas autorizações" title="Minhas autorizações">${ic('shield')}</button>
          <button class="iconbtn" id="sair" aria-label="Sair" title="Sair">${ic('logout')}</button></div>
      </aside>
      <div class="content">
        <div class="appbar"><div class="crumbs" id="crumbs"></div>
          ${CW.sessao.podeTrocar() ? `<button class="topobtn" id="trocar-empresa" title="Trocar de empresa">${ic('swap')}<span>${esc(ctx.nome)}</span></button>` : ''}
          <button class="topobtn tema" id="tema" title="Tema claro ou escuro">${ic('sun')}<span></span></button>${teste}</div>
        <div class="topbar"><div class="grow"><h1 id="titulo"></h1><p class="sub" id="subtitulo"></p></div><div id="acoes"></div></div>
        <main id="view"></main>
      </div></div>
      <nav class="bnav" id="bnav" aria-label="Navegação"></nav>`;
    document.getElementById('sair').onclick = () => CW.sessao.sair();
    document.getElementById('minhas-aut').onclick = () => ir('autorizacoes');
    const ma = document.getElementById('menu-alt'); if (ma) ma.onclick = alternarMenu;
    const tr = document.getElementById('trocar-empresa'); if (tr) tr.onclick = () => CW.sessao.trocar();
    const tb = document.getElementById('tema'); const rotTema = () => { const t = U().tema(); tb.innerHTML = ic(t === 'dark' ? 'moon' : 'sun') + `<span>${t === 'dark' ? 'Escuro' : t === 'light' ? 'Claro' : 'Automático'}</span>`; };
    tb.onclick = () => { U().trocarTema(); rotTema(); }; rotTema();
    document.getElementById('menu').addEventListener('click', e => { const b = e.target.closest('[data-mod]'); if (b) ir(b.dataset.mod); });
    document.getElementById('bnav').addEventListener('click', e => { const b = e.target.closest('[data-mod]'); if (b) ir(b.dataset.mod); else if (e.target.closest('#bnav-mais')) mais(); });
    montado = true;
    /* liga os módulos visíveis */
    const cbase = baseCtx();
    mods.forEach(m => { if (typeof m.iniciar !== 'function') return; try { const f = m.iniciar(Object.assign({ modulo: m.id }, cbase)); if (typeof f === 'function') limpezas.push(f); } catch (e) { console.error('iniciar ' + m.id, e); } });
    window.addEventListener('hashchange', desenhar);
    desenhar();
    conferirPorte();
  }

  function desmontar() {
    window.removeEventListener('hashchange', desenhar);
    limpezas.forEach(f => { try { f(); } catch (e) { console.error(e); } }); limpezas = [];
    Object.values(ouvintes).forEach(f => { try { f(); } catch (e) { /* já desligado */ } }); ouvintes = {};
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    montado = false; atual = null;
    document.documentElement.classList.remove('casca');
    try { if ('clearAppBadge' in navigator) navigator.clearAppBadge(); } catch (e) {}
  }

  /* ---------- "Precisa de você": junta as pendências de todos os módulos visíveis ---------- */
  function pendencias() {
    if (!montado) return [];
    const c = baseCtx(), out = [];
    visiveis().forEach(m => {
      if (typeof m.pendencias !== 'function') return;
      try { (m.pendencias(Object.assign({ modulo: m.id }, c)) || []).forEach(p => out.push(Object.assign({ mod: m.id, modNome: m.nome, icone: m.icone }, p))); }
      catch (e) { console.error('pendencias ' + m.id, e); }
    });
    return out;
  }
  function pendenciasMudaram() {
    clearTimeout(pendTimer);
    pendTimer = setTimeout(() => {
      if (!montado) return;
      const ps = pendencias(), por = {};
      ps.forEach(p => { por[p.mod] = (por[p.mod] || 0) + 1; });
      const marca = (b, n) => { let s = b.querySelector('.badge'); if (!n) { if (s) s.remove(); return; } if (!s) { s = document.createElement('span'); s.className = 'badge'; b.appendChild(s); } s.textContent = n > 99 ? '99+' : String(n); s.setAttribute('aria-label', n + (n === 1 ? ' pendência' : ' pendências')); };
      document.querySelectorAll('#menu [data-mod], #bnav [data-mod]').forEach(b => marca(b, por[b.dataset.mod] || 0));
      const mb = document.getElementById('bnav-mais');
      if (mb) { const vis = Array.from(document.querySelectorAll('#bnav [data-mod]')).map(b => b.dataset.mod); marca(mb, ps.filter(p => !vis.includes(p.mod)).length); }
      try { if ('setAppBadge' in navigator) { if (ps.length) navigator.setAppBadge(ps.length); else navigator.clearAppBadge(); } } catch (e) { /* sem número no ícone */ }
      document.title = document.title.replace(/^\(\d+\+?\) /, '');
      if (ps.length) document.title = `(${ps.length}) ` + document.title;
      window.dispatchEvent(new CustomEvent('cw:pendencias', { detail: ps }));
    }, 60);
  }

  function baseCtx() { const s = CW.sessao.estado(); return { contexto: s.contexto, sessao: s, soLeitura: CW.permissoes.soLeitura(s.contexto) }; }

  /* barra de baixo (celular): até 4 módulos + "Mais" */
  function barraBaixo(mods, ativo) {
    const { ic, esc } = U(), max = 4, prim = mods.length > max + 1 ? mods.slice(0, max) : mods, resto = mods.length > max + 1 ? mods.slice(max) : [];
    const b = document.getElementById('bnav');
    b.style.gridTemplateColumns = `repeat(${prim.length + (resto.length ? 1 : 0)},minmax(0,1fr))`;
    b.innerHTML = prim.map(m => `<button data-mod="${esc(m.id)}" ${m.id === ativo ? 'aria-current="page"' : ''}>${ic(m.icone)}<span>${esc(m.nomeCurto || m.nome)}</span></button>`).join('')
      + (resto.length ? `<button id="bnav-mais" ${resto.some(m => m.id === ativo) ? 'aria-current="page"' : ''}>${ic('more')}<span>Mais</span></button>` : '');
  }
  function mais() {
    const { ic, esc } = U(), mods = menuMods(), resto = mods.length > 5 ? mods.slice(4) : [];
    let alvo = null;
    U().dialogo({ titulo: 'Mais opções', botoes: [], corpo: `<div class="escolhas">${resto.map(m => `<button class="maisbtn" data-mais="${esc(m.id)}">${ic(m.icone)}<span>${esc(m.nome)}</span>${ic('chev')}</button>`).join('')}</div>`,
      aoAbrir: d => d.querySelectorAll('[data-mais]').forEach(x => x.onclick = () => { alvo = x.dataset.mais; d.close(); }) }).then(() => { if (alvo) ir(alvo); });
  }

  /* ---------- rota → tela ---------- */
  async function desenhar() {
    if (!montado) return;
    const mods = visiveis(), r = lerRota(), { ic, esc } = U();
    if (r.modulo === 'convite') return;   /* link de convite: a sessão cuida (modulos/convite.js) */
    let m = MODULOS.find(x => x.id === r.modulo);
    if (!m || !mods.includes(m)) {
      if (r.modulo && mods.length) U().toast('Você não tem acesso a essa tela. Abrimos o início.', 'erro');
      m = mods[0];
      if (!m) { document.getElementById('view').innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('lock')}</div><strong>Nenhuma tela liberada para você nesta empresa.</strong><span>Fale com o administrador da sua empresa.</span></div></div>`; return; }
      history.replaceState(null, '', '#' + m.id); return desenhar();
    }
    const ids = Object.keys(m.telas), telaId = m.telas[r.tela] ? r.tela : ids[0], tela = m.telas[telaId];
    const mudou = !atual || atual.modulo !== m.id || atual.tela !== telaId;
    atual = { modulo: m.id, tela: telaId };
    if (mudou) { const ap = document.getElementById('app'); if (ap) ap.scrollTop = 0; window.scrollTo(0, 0); }   /* outra tela começa do alto */
    document.querySelectorAll('#menu [data-mod]').forEach(b => { if (b.dataset.mod === m.id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    barraBaixo(menuMods(), m.id);
    document.getElementById('crumbs').innerHTML = `Conectwork ${ic('chev')} ${ids.length > 1 && telaId !== ids[0] ? `<span>${esc(m.nome)}</span> ${ic('chev')} <b>${esc(tela.nome)}</b>` : `<b>${esc(m.nome)}</b>`}`;
    document.getElementById('titulo').textContent = tela.titulo ? tela.titulo(baseCtx()) : (tela.nome || m.nome);
    document.getElementById('subtitulo').textContent = tela.sub || '';
    document.getElementById('acoes').innerHTML = '';
    const view = document.getElementById('view'); view.innerHTML = '';
    document.title = (tela.nome || m.nome) + ' · Conectwork';
    pendenciasMudaram();
    try { await tela.render(view, Object.assign({ modulo: m.id, tela: telaId, params: r.params }, baseCtx())); U().aplicarMascaras(view); }
    catch (e) { console.error(e); view.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível abrir esta tela.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; }
  }

  /* ---------- partida ---------- */
  function iniciar() { CW.sessao.iniciar(); }

  CW.registrarModulo = registrarModulo;
  CW.inscrever = inscrever;
  CW.ir = ir;
  CW.iniciar = iniciar;
  CW.app = { montar, desmontar, desenhar, modulos: () => MODULOS.slice(), visiveis, atual: () => atual, pendencias, pendenciasMudaram };
})();
