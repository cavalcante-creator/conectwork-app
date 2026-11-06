/* Conectwork · casca do app: registro de módulos, menu lateral, barra de baixo no celular e roteamento por hash.
   Rota: #modulo/tela/param1/param2… (ex.: #inicio, #usuarios/convites). Sem tela = primeira tela do módulo.

   Registro de módulo (um arquivo por módulo em modulos/, incluído em modulos/lista.js):
   CW.registrarModulo({
     id: 'usuarios', nome: 'Usuários e acessos', icone: 'users', ordem: 50,
     para: ['empresa'], livre: false, semAprovacao: false, contrato: 'equipe',   // ver js/permissoes.js
     telas: { lista: { nome: 'Usuários e acessos', sub: 'texto abaixo do título', render(el, ctx) { … } } },
     iniciar(ctx) { … ; return () => { // limpeza ao sair ou trocar de empresa } }
   });
   ctx = { modulo, tela, params, contexto (empresa ou master atual), sessao (estado), soLeitura } */
(function () {
  const CW = window.CW = window.CW || {};
  const U = () => CW.ui;
  const MODULOS = [];
  let montado = false, limpezas = [], ouvintes = {}, atual = null;

  function registrarModulo(m) {
    if (!m || !m.id || !m.nome || !m.telas || !Object.keys(m.telas).length) { console.error('registrarModulo: informe id, nome e telas', m); return; }
    if (MODULOS.some(x => x.id === m.id)) { console.error('registrarModulo: id repetido', m.id); return; }
    MODULOS.push(m); MODULOS.sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100));
  }

  const visiveis = () => { const ctx = CW.sessao.contexto(); return MODULOS.filter(m => CW.permissoes.podeVer(m, ctx)); };

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
    const mods = visiveis();
    const teste = CW.fb.ambiente() === 'teste' ? '<span class="env">Ambiente de testes</span>' : '';
    document.getElementById('app').innerHTML = `<div class="shell">
      <aside class="side">${CURVES}
        <div class="logo">${LOGO(32)}<span>Conect<b>work</b></span></div>
        <div class="navlabel">MENU</div>
        <nav class="nav" id="menu" aria-label="Principal">${mods.map(m => `<button data-mod="${esc(m.id)}">${ic(m.icone)}<span>${esc(m.nome)}</span></button>`).join('')}</nav>
        <div class="usercard">${avatar(nome, 'sm')}<div class="t"><strong id="quem-nome">${esc(nome)}</strong><small id="quem-sub">${esc(sub)}</small></div>
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
  }

  function desmontar() {
    window.removeEventListener('hashchange', desenhar);
    limpezas.forEach(f => { try { f(); } catch (e) { console.error(e); } }); limpezas = [];
    Object.values(ouvintes).forEach(f => { try { f(); } catch (e) { /* já desligado */ } }); ouvintes = {};
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    montado = false; atual = null;
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
    const { ic, esc } = U(), mods = visiveis(), resto = mods.length > 5 ? mods.slice(4) : [];
    let alvo = null;
    U().dialogo({ titulo: 'Mais opções', botoes: [], corpo: `<div class="escolhas">${resto.map(m => `<button class="maisbtn" data-mais="${esc(m.id)}">${ic(m.icone)}<span>${esc(m.nome)}</span>${ic('chev')}</button>`).join('')}</div>`,
      aoAbrir: d => d.querySelectorAll('[data-mais]').forEach(x => x.onclick = () => { alvo = x.dataset.mais; d.close(); }) }).then(() => { if (alvo) ir(alvo); });
  }

  /* ---------- rota → tela ---------- */
  async function desenhar() {
    if (!montado) return;
    const mods = visiveis(), r = lerRota(), { ic, esc } = U();
    let m = MODULOS.find(x => x.id === r.modulo);
    if (!m || !mods.includes(m)) {
      if (r.modulo && mods.length) U().toast('Você não tem acesso a essa tela. Abrimos o início.', 'erro');
      m = mods[0];
      if (!m) { document.getElementById('view').innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('lock')}</div><strong>Nenhuma tela liberada para você nesta empresa.</strong><span>Fale com o administrador da sua empresa.</span></div></div>`; return; }
      history.replaceState(null, '', '#' + m.id); return desenhar();
    }
    const ids = Object.keys(m.telas), telaId = m.telas[r.tela] ? r.tela : ids[0], tela = m.telas[telaId];
    atual = { modulo: m.id, tela: telaId };
    document.querySelectorAll('#menu [data-mod]').forEach(b => { if (b.dataset.mod === m.id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    barraBaixo(mods, m.id);
    document.getElementById('crumbs').innerHTML = `Conectwork ${ic('chev')} ${ids.length > 1 && telaId !== ids[0] ? `<span>${esc(m.nome)}</span> ${ic('chev')} <b>${esc(tela.nome)}</b>` : `<b>${esc(m.nome)}</b>`}`;
    document.getElementById('titulo').textContent = tela.titulo ? tela.titulo(baseCtx()) : (tela.nome || m.nome);
    document.getElementById('subtitulo').textContent = tela.sub || '';
    document.getElementById('acoes').innerHTML = '';
    const view = document.getElementById('view'); view.innerHTML = '';
    document.title = (tela.nome || m.nome) + ' · Conectwork';
    try { await tela.render(view, Object.assign({ modulo: m.id, tela: telaId, params: r.params }, baseCtx())); U().aplicarMascaras(view); }
    catch (e) { console.error(e); view.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível abrir esta tela.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; }
  }

  /* ---------- partida ---------- */
  function iniciar() { CW.sessao.iniciar(); }

  CW.registrarModulo = registrarModulo;
  CW.inscrever = inscrever;
  CW.ir = ir;
  CW.iniciar = iniciar;
  CW.app = { montar, desmontar, desenhar, modulos: () => MODULOS.slice(), visiveis, atual: () => atual };
})();
