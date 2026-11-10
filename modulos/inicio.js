/* Módulo Início: mostra quem entrou, em qual empresa e com qual cargo, o "Precisa de você" e os avisos da equipe Conectwork.
   Para a equipe Conectwork, o Início é o Painel da rede (modulos/rede.js). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  /* "Precisa de você": tudo o que a pessoa tem para fazer, de todos os módulos (CW.app.pendencias) */
  /* 09/11/2026: 3 ou mais pendências do mesmo módulo viram um item só ("6 pendências em Documentos e certidões"), que abre
     a lista ao tocar; os números do dia (ao lado) contam as pendências de cada módulo e levam direto para a tela. */
  const item = p => { const { esc, ic } = U(); return `<button class="pv-it" data-pv="${esc(p.rota)}"><span class="ic">${ic(p.icone)}</span><span class="t"><strong>${esc(p.txt)}</strong><small>${esc(p.sub || '')}</small></span><span class="tag gray">${esc(p.modNome)}</span></button>`; };
  function pvHtml(ps) {
    const { esc, ic } = U();
    if (!ps.length) return `<div class="pv-ok" id="ini-pv-ok">${ic('check')}Tudo em dia. Quando houver algo para você fazer, aparece aqui.</div>`;
    const por = {}, ordem = [];
    ps.forEach(p => { if (!por[p.mod]) { por[p.mod] = []; ordem.push(p.mod); } por[p.mod].push(p); });
    return `<div class="pv-lista">${ordem.map(m => { const l = por[m];
      if (l.length < 3) return l.map(item).join('');
      const verbo = l.every(p => /^Enviar:/.test(p.txt)) ? `${l.length} documentos para enviar` : `${l.length} pendências em ${l[0].modNome}`;
      const nomes = l.slice(0, 2).map(p => p.txt.replace(/^[^:]+:\s*/, '')).join(' · ') + (l.length > 2 ? ` e mais ${l.length - 2}` : '');
      return `<details class="pv-g" data-pvg="${esc(m)}"><summary><span class="ic">${ic(l[0].icone)}</span><span class="t"><strong>${esc(verbo)}</strong><small>${esc(nomes)}</small></span>
        <span class="pv-ver">Ver ${l.length}${ic('chev')}</span></summary><div class="pv-sub">${l.map(item).join('')}</div></details>`; }).join('')}</div>`;
  }
  function numeros(ps) {
    const { esc, ic } = U(), por = {};
    ps.forEach(p => { por[p.mod] = (por[p.mod] || 0) + 1; });
    const mods = CW.app.visiveis().filter(m => m.menu !== false && m.id !== 'inicio' && typeof m.pendencias === 'function');
    const pref = ['medicoes', 'espelhos', 'titulos', 'documentos', 'ordens', 'contratos'];
    const lista = pref.map(id => mods.find(m => m.id === id)).filter(Boolean).slice(0, 4);
    if (!lista.length) return '';
    const maior = Math.max(0, ...lista.map(m => por[m.id] || 0));
    let marcou = false;   /* o número com mais pendências ganha destaque (tema escuro, versão 2) */
    return lista.map(m => { const n = por[m.id] || 0, dest = n && n === maior && !marcou ? (marcou = true) : false;
      return `<button class="ini-num ${n ? 'tem' : ''}${dest ? ' dest' : ''}" data-ir="${esc(m.id)}" data-cor="${n ? 'atencao' : 'ok'}"><span class="ic">${ic(m.icone)}</span><b>${n}</b><span>${esc(m.nome)}</span><small>${n ? (n === 1 ? 'pendência para você' : 'pendências para você') : 'nada pendente'}</small></button>`; }).join('');
  }
  function vencHtml() {
    const { esc } = U(), ctx = Object.assign({}, { contexto: CW.sessao.contexto(), sessao: CW.sessao.estado() });
    const l = CW.titulos && CW.titulos.proximos(ctx, 5);
    if (l === null || l === undefined) return `<div class="ini-vz">Carregando…</div>`;
    if (!l.length) return `<div class="ini-vz">Nenhum vencimento em aberto.</div>`;
    return l.map(t => `<button class="ini-vc" data-vc="${esc(t.id)}"><span>${esc(t.nome)}<small>${esc(t.venc)} · ${t.lado === 'tomador' ? 'a pagar' : 'a receber'}${t.vencido ? ' · <b class="ini-atr">vencido</b>' : ''}</small></span><b>${esc(t.valor)}</b></button>`).join('');
  }
  function pvDesenha(ps) {
    const vc = document.getElementById('ini-venc-b');
    if (vc) { vc.innerHTML = vencHtml(); vc.querySelectorAll('[data-vc]').forEach(x => x.onclick = () => CW.ir('titulos/ver/' + x.dataset.vc)); }
    const b = document.getElementById('ini-pv-b');
    if (b) {
      const abertos = Array.from(b.querySelectorAll('details[open]')).map(d => d.dataset.pvg);
      b.innerHTML = pvHtml(ps);
      abertos.forEach(m => { const d = b.querySelector(`details[data-pvg="${m}"]`); if (d) d.open = true; });
      const n = document.getElementById('ini-pv-n'); if (n) { n.textContent = ps.length; n.hidden = !ps.length; }
      b.querySelectorAll('[data-pv]').forEach(x => x.onclick = () => CW.ir(x.dataset.pv));
    }
    const k = document.getElementById('ini-nums');
    if (k) { k.innerHTML = numeros(ps); k.hidden = !k.innerHTML; k.querySelectorAll('[data-ir]').forEach(x => x.onclick = () => CW.ir(x.dataset.ir)); }
  }
  window.addEventListener('cw:pendencias', e => { pvDesenha(e.detail || []); meiAtualiza(e.detail || []); });

  /* ---------- Início do MEI (10/11/2026): faixa azul com nome e CNPJ, alerta do DAS, demandas, "Serviços pra você",
     o mês, o limite e "Dados do seu MEI" (layout inspirado na referência que a usuária aprovou; marca e cores do Conectwork) ---------- */
  const SERV = [
    { id: 'das', mod: 'mei', rota: 'mei/das', t: 'DAS', ic: 'receipt', prim: true },
    { id: 'checkup', mod: 'mei', rota: 'mei/checkup', t: 'Check-up', ic: 'shield' },
    { id: 'negocio', mod: 'negocio', rota: 'negocio', t: 'Declaração', ic: 'file' },
    { id: 'dinheiro', mod: 'dinheiro', rota: 'dinheiro', t: 'Dinheiro', ic: 'bank' },
    { id: 'agenda', mod: 'agenda', rota: 'agenda', t: 'Agenda', ic: 'clock' },
    { id: 'espelhos', mod: 'espelhos', rota: 'espelhos', t: 'Emitir nota', ic: 'receipt' },
    { id: 'assistentemei', mod: 'assistentemei', rota: 'assistentemei', t: 'Dúvidas', ic: 'help' }
  ];
  const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const CARTAO_CNPJ = 'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp';
  const isoHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ctxAgora = () => Object.assign({}, { contexto: CW.sessao.contexto(), sessao: CW.sessao.estado(), soLeitura: CW.permissoes.soLeitura(CW.sessao.contexto()) });
  function hojeLinhas() { const h = isoHoje(); return CW.agenda ? CW.agenda.linhas(ctxAgora(), h, h).filter(l => !l.feito) : []; }
  const fiscal = () => CW.negocio && CW.negocio.fiscal && CW.negocio.fiscal();
  const dasVencidos = () => { const fd = CW.negocio && CW.negocio.fiscalDoc && CW.negocio.fiscalDoc();
    if (fd && CW.meuDas) return CW.meuDas.vencidosDe(fd, CW.negocio.inicioMei());   /* desde a abertura do MEI, igual à tela DAS do ano */
    const f = fiscal(); return f ? f.das.filter(x => !x.pago && x.vencido) : []; };
  function subServ(id, n) {
    const ctx = ctxAgora();
    if (id === 'das') { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); const v = dasVencidos().length; return v ? (v === 1 ? '1 vencido' : v + ' vencidos') : `${MES3[d.getMonth()][0].toUpperCase() + MES3[d.getMonth()].slice(1)}/${d.getFullYear()}`; }
    if (id === 'checkup') return 'CNPJ MEI';
    if (id === 'negocio') return 'DASN e limite';
    if (id === 'agenda') { const k = hojeLinhas().length; return k ? `${k} hoje` : 'Nada hoje'; }
    if (id === 'dinheiro') { if (!CW.dinheiro || !CW.dinheiro.pronto()) return 'Entrou e saiu'; const r = CW.dinheiro.doMes(ctx, isoHoje().slice(0, 7)); return r.entrou || r.saiu ? (r.sobrou < 0 ? 'Faltou ' : 'Sobrou ') + U().formatarDinheiro(Math.abs(r.sobrou)) + ' no mês' : 'Registre o que entra'; }
    if (id === 'espelhos') return n ? `${n} esperando` : 'Nenhuma agora';
    return 'Assistente';
  }
  function hojeHtml() {
    const { esc, ic } = U(), l = hojeLinhas()[0], f = fiscal();
    const das = f && f.das.find(x => !x.pago && !x.vencido), dasTxt = das ? `e o DAS vence dia ${das.venc.slice(8, 10)}` : '';
    if (!l) return `<span class="mei-bola sol">${ic('clock')}</span><div><small>Hoje</small><b>Nada marcado para hoje</b>${dasTxt ? `<small>${esc(dasTxt[0].toUpperCase() + dasTxt.slice(1))}</small>` : ''}</div>`;
    const o = l.x || l.a, hora = l.hora ? `às ${l.hora.replace(':', 'h').replace('h00', 'h')}` : '';
    return `<span class="mei-bola sol">${ic('clock')}</span><div><small>Hoje ${esc(hora)}</small><b>${esc(o.titulo)}${l.x && l.x.cliente ? ' · ' + esc(l.x.cliente) : ''}</b>${dasTxt ? `<small>${esc(dasTxt)}</small>` : ''}</div>`;
  }
  function meiAtualiza(ps) {
    const g = document.getElementById('mei-servicos'); if (!g) return;
    const { esc, ic } = U(), lista = ps || CW.app.pendencias(), por = {}; lista.forEach(p => { por[p.mod] = (por[p.mod] || 0) + 1; });
    const vis = CW.app.visiveis().map(m => m.id);
    g.innerHTML = SERV.filter(x => vis.includes(x.mod)).map(x => { const n = x.id === 'das' ? dasVencidos().length : x.id === 'checkup' ? 0 : (por[x.mod] || 0);
      return `<button class="mh-serv${x.prim ? ' prim' : ''}" data-ir="${esc(x.rota)}" data-tile="${esc(x.id)}">${n && x.id !== 'agenda' ? `<span class="mh-num" aria-label="${n} para ver">${n > 9 ? '9+' : n}</span>` : ''}<span class="mh-serv-ic">${ic(x.ic)}</span><b>${esc(x.t)}</b><small>${esc(subServ(x.id, n))}</small></button>`; }).join('');
    g.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => CW.ir(b.dataset.ir));
    const h = document.getElementById('mei-hoje'); if (h) h.innerHTML = hojeHtml();
    /* alerta do DAS vencido e "Acompanhe suas demandas" */
    const al = document.getElementById('mh-alerta'), v = dasVencidos().length;
    if (al) { al.hidden = !v || !vis.includes('mei'); al.innerHTML = `<span class="mh-alerta-ic">${ic('alert')}</span><span class="t"><b>Você tem ${v === 1 ? 'DAS vencido' : v + ' DAS vencidos'}</b><small>Regularize e fique em dia</small></span><span class="mh-num est">${v}</span>${ic('chev')}`; }
    const dm = document.getElementById('mh-demandas'); if (dm) { const n = por.ordens || 0;
      dm.innerHTML = `<span class="t"><b>Acompanhe suas demandas</b><small>${n ? (n === 1 ? 'Você tem 1 demanda para responder' : `Você tem ${n} demandas para responder`) : 'Nenhuma demanda esperando você'}</small></span>${n ? `<span class="mh-num est">${n}</span>` : ''}${ic('chev')}`; }
    /* selo "Prestador em dia": nenhum DAS vencido e nenhuma declaração anual atrasada (CW.meuDas.selo) */
    const se = document.getElementById('mh-selo'), fdoc = CW.negocio && CW.negocio.fiscalDoc && CW.negocio.fiscalDoc();
    if (se) se.hidden = !(fdoc && CW.meuDas && CW.meuDas.selo(fdoc, CW.negocio.inicioMei()));
    const sino = document.getElementById('mh-sino-n'); if (sino) { sino.textContent = lista.length > 9 ? '9+' : String(lista.length); sino.hidden = !lista.length; }
    meiMes();
  }
  /* "Este mês": entrou, saiu e sobrou (as mesmas contas da tela Dinheiro) */
  function meiMes() {
    const b = document.getElementById('mei-mes'); if (!b) return;
    if (!CW.dinheiro || !CW.dinheiro.ligado() || !CW.dinheiro.pronto()) { b.hidden = true; return; }
    const { esc } = U(), r = CW.dinheiro.doMes(ctxAgora(), isoHoje().slice(0, 7)), brl = c => U().formatarDinheiro(c).replace(/,00$/, '');
    b.innerHTML = `<p class="mei-rot">Este mês</p><div class="mei-mes-n"><div><small>Entrou</small><b class="ent">${esc(brl(r.entrou))}</b></div><div><small>Saiu</small><b class="sai">${esc(brl(r.saiu))}</b></div><div><small>${r.sobrou < 0 ? 'Faltou' : 'Sobrou'}</small><b>${esc(brl(Math.abs(r.sobrou)))}</b></div></div>`;
    b.hidden = false; b.onclick = () => CW.ir('dinheiro');
  }
  window.addEventListener('cw:dinheiro', () => { if (document.getElementById('mei-home')) meiAtualiza(); });
  async function meiLimite(ctx) {
    const box = document.getElementById('mei-lim'); if (!box || !CW.negocio || !CW.negocio.carregar) return;
    try {
      const D = await CW.negocio.carregar(ctx), K = CW.negocio.contas(D), L = CW.negocio.LIMITE_MEI, p = Math.min(1, K.noAno / L), brl = U().formatarDinheiro;
      const est = p >= 1 ? ['passou', 'passou do limite'] : p >= 0.8 ? ['perto', 'perto do limite'] : ['ok', 'tudo certo'];
      box.innerHTML = `<p class="mei-rot">Seu MEI em ${new Date().getFullYear()}</p><div class="mei-prog ${est[0]}"><i style="width:${Math.round(p * 100)}%"></i></div>
        <p class="mei-lim-t"><b>${brl(K.noAno).replace(/,00$/, '')}</b> de ${brl(L).replace(/,00$/, '')} · ${est[1]}</p>`;
      box.hidden = false; box.onclick = () => CW.ir('negocio');
    } catch (e) { box.hidden = true; }
  }
  function meiInicio(el, ctx) {
    const { esc, ic, mascara } = U(), s = ctx.sessao, c = ctx.contexto, e = c.empresa || {}, nome = String((s.perfil && s.perfil.nome) || '').split(' ')[0];
    const tb = document.querySelector('.topbar'); if (tb) tb.hidden = true;
    const cnpj = e.cnpj ? mascara.cnpj(e.cnpj) : '';
    /* cadastro rápido do MEI: convite para completar o cadastro e receber pedidos da rede */
    const CONV = { mei: ['star', 'Quer receber pedidos de empresas?', 'Complete o cadastro com os documentos. A equipe Conectwork confere e você passa a receber demandas e contratos pela rede.', 'Completar cadastro'],
      analise: ['clock', 'Seu cadastro completo está em análise', 'A equipe Conectwork está conferindo os documentos. Enquanto isso, o dinheiro, a agenda e os impostos continuam liberados.', 'Ver situação'],
      pendencia: ['alert', 'A equipe pediu um ajuste no cadastro', 'Veja o que falta e reenvie. O resto do Conectwork continua liberado.', 'Ver o ajuste'] }[e.status];
    const convite = CONV ? `<button class="mei-convite" id="mei-rede"><span class="mei-bola ceu">${ic(CONV[0])}</span><span class="t"><b>${esc(CONV[1])}</b><small>${esc(CONV[2])}</small></span><span class="mei-convite-bt">${esc(CONV[3])}</span></button>` : '';
    const vis = CW.app.visiveis().map(m => m.id);
    el.innerHTML = `<div id="ini-avisos" class="stack" style="gap:10px"></div>
      <div class="mei-home mh" id="mei-home">
        <div class="mh-topo"><div class="t"><h2 id="mh-ola">Olá${nome ? ', ' + esc(nome) : ''}</h2>${cnpj ? `<p id="mh-cnpj">${esc(cnpj)}</p>` : ''}<span class="selo-dia mh-selo" id="mh-selo" hidden>${ic('shield')}Prestador em dia</span></div>
          <button class="mh-sino" id="mh-sino" type="button" aria-label="O que precisa de você">${ic('bolt')}<span class="mh-num" id="mh-sino-n" hidden></span></button></div>
        <button class="mh-alerta" id="mh-alerta" type="button" hidden></button>
        ${convite}
        ${vis.includes('ordens') ? `<button class="mh-card mh-demandas" id="mh-demandas" type="button"></button>` : ''}
        <button class="mei-hoje" id="mei-hoje" data-ir="agenda"></button>
        <section class="mh-sec"><div class="mh-sec-h"><h3>Serviços pra você</h3></div><div class="mh-servicos" id="mei-servicos"></div></section>
        <button class="mei-mes" id="mei-mes" hidden></button>
        <button class="mei-lim" id="mei-lim" hidden></button>
        <section class="mh-sec" id="mh-dados"><div class="mh-sec-h"><h3>Dados do seu MEI</h3>${cnpj ? `<a class="linkbtn" href="${CARTAO_CNPJ}" target="_blank" rel="noopener">cartão CNPJ ${ic('chev')}</a>` : ''}</div>
          <div class="mh-card mh-dados-c"><span class="mh-logo">${CW.ui.avatar(c.nome, 'sm', c.empresaId)}</span><span class="t"><small>Nome do negócio</small><b>${esc(e.razao || e.nome || c.nome)}</b>${cnpj ? `<small>CNPJ ${esc(cnpj)}</small>` : ''}</span>
            ${cnpj ? `<button class="iconbtn" id="mh-copiar" type="button" aria-label="Copiar o CNPJ" title="Copiar o CNPJ">${ic('copy')}</button>` : ''}</div></section>
        <section class="card" id="ini-pv" hidden><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Para fazer</h3><span class="count" id="ini-pv-n" hidden></span></div><div class="card-b" id="ini-pv-b"></div></section>
      </div>`;
    document.getElementById('mei-hoje').onclick = () => CW.ir('agenda');
    document.getElementById('mh-alerta').onclick = () => CW.ir('mei/das');
    const dm = document.getElementById('mh-demandas'); if (dm) dm.onclick = () => CW.ir('ordens');
    document.getElementById('mh-sino').onclick = () => { const pv = document.getElementById('ini-pv'); if (pv && !pv.hidden) pv.scrollIntoView({ behavior: 'smooth', block: 'start' }); else U().toast('Nada esperando você agora.'); };
    const cp = document.getElementById('mh-copiar'); if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(U().dig(e.cnpj)); U().toast('CNPJ copiado.'); } catch (x) { U().toast('CNPJ: ' + cnpj); } };
    const rede = document.getElementById('mei-rede'); if (rede) rede.onclick = () => CW.ir('meucadastro');
    const ps = CW.app.pendencias(); meiAtualiza(ps); pvDesenha(ps); mostraPv(ps);
    meiLimite(ctx);
    if (CW.avisos) CW.avisos.bloco(document.getElementById('ini-avisos'), ctx);
  }
  function mostraPv(ps) { const c = document.getElementById('ini-pv'); if (c && document.getElementById('mei-home')) c.hidden = !ps.length; }
  window.addEventListener('cw:pendencias', e => mostraPv(e.detail || []));
  const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };

  CW.registrarModulo({
    id: 'inicio', nome: 'Início', icone: 'home', ordem: 0,
    para: ['empresa', 'master'], livre: true, semAprovacao: true,
    telas: {
      inicio: {
        nome: 'Início',
        titulo: ctx => { const p = ctx.sessao.perfil; const n = String((p && p.nome) || '').split(' ')[0]; return saudacao() + (n ? ', ' + n : ''); },
        render(el, ctx) {
          if (ctx.contexto.tipo === 'master' && CW.rede) return CW.rede.painel(el, ctx);   /* equipe Conectwork: Painel da rede */
          if (CW.app.mei && CW.app.mei() && ctx.contexto.empresa && ['aprovado', 'mei', 'analise', 'pendencia'].includes(ctx.contexto.empresa.status)) return meiInicio(el, ctx);   /* perfil MEI (também no cadastro rápido) */
          const { esc, ic, avatar } = CW.ui, s = ctx.sessao, c = ctx.contexto;
          const nome = (s.perfil && s.perfil.nome) || s.usuario.email;
          const master = c.tipo === 'master';
          const cargo = master ? null : CW.permissoes.cargo(c.acesso.cargo);
          const ajuste = !master && ((c.acesso.extras || []).length || (c.acesso.sem || []).length);
                    const aviso = !master && c.empresa.status === 'suspenso'
            ? `<div class="banner danger" id="ini-suspensa">${ic('lock')}<span><strong>O acesso da empresa está suspenso</strong>${esc(c.empresa.motivo || '')} Os dados continuam guardados. Para voltar a usar, fale com a equipe Conectwork.</span></div>`
            : !master && c.empresa.status !== 'aprovado'
            ? `<div class="banner warn" id="ini-analise">${ic('clock')}<span><strong>Cadastro da empresa ainda não aprovado</strong>Enquanto a equipe Conectwork analisa o cadastro, só algumas telas ficam liberadas.</span></div>` : '';
          const leitura = ctx.soLeitura ? `<div class="banner info" id="ini-leitura">${ic('shield')}<span><strong>Acesso só de leitura</strong>Você pode consultar as telas liberadas, mas não altera nada.</span></div>` : '';
          const pv = !master && c.empresa.status === 'aprovado' ? `<section class="card" id="ini-pv"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Precisa de você</h3><span class="count" id="ini-pv-n" hidden></span></div><div class="card-b" id="ini-pv-b"></div></section>` : '';
          el.innerHTML = `<div id="ini-avisos" class="stack" style="gap:10px"></div>${aviso}${leitura}
            <div class="ini-grade">
              <div class="ini-principal">
                ${pv ? `<div class="ini-nums" id="ini-nums"></div>` : ''}${pv}
              </div>
              <aside class="ini-lado">
                ${!master && CW.titulos && CW.app.visiveis().some(m => m.id === 'titulos') ? `<section class="card" id="ini-venc"><div class="card-h"><h3>Próximos vencimentos</h3><a class="linkbtn" href="#titulos" style="margin-left:auto;font-size:13px">Ver todos</a></div><div class="card-b" id="ini-venc-b"></div></section>` : ''}
                <section class="card" id="ini-quem"><div class="card-b">
                  <div class="ini-eu">${avatar(nome, '')}<div class="t"><h2 id="ini-nome">${esc(nome)}</h2><small>${esc(s.usuario.email)}</small></div></div>
                  <dl class="ini-dl">
                    <div><dt>${master ? 'Equipe' : 'Empresa'}</dt><dd id="ini-empresa">${esc(c.nome)}</dd></div>
                    <div><dt>Cargo</dt><dd id="ini-cargo">${master ? 'Equipe Conectwork' : esc(CW.permissoes.nomeCargo(c.acesso.cargo))}${ajuste ? ' <span class="tag">ajustado</span>' : ''}</dd></div>
                    ${master ? '' : `<div><dt>Situação</dt><dd>${CW.sessao.pillStatus(c.empresa.status)}</dd></div>`}
                  </dl>
                  <p class="ini-pode">${master ? 'Analisa cadastros, libera módulos e acompanha toda a rede.' : esc(cargo ? cargo.desc : 'Cargo não reconhecido. Fale com o administrador da empresa.')}</p>
                  <a class="linkbtn" href="#autorizacoes" id="ini-aut">${ic('shield')}Minhas autorizações</a>
                </div></section>
              </aside>
            </div>`;
          pvDesenha(CW.app.pendencias());
          if (CW.avisos) CW.avisos.bloco(document.getElementById('ini-avisos'), ctx);
        }
      }
    }
  });
})();
