/* Conectwork · Meus profissionais e Equipes das prestadoras (13/11/2026, "a Zenith e a Nexus têm um vínculo com esses profissionais,
   são chamados de equipe; isso tem que dar mais credibilidade. E gerar para a Zenith e a Nexus um módulo Meus profissionais, um
   catálogo próprio. A Colafix não quer tratar direto com o MEI: ela acessa a Zenith e os profissionais dela").
   - equipe/{prestadora}_{CNPJ do MEI}: o profissional que presta serviço pela prestadora (vínculo de prestação de serviço, nunca
     emprego). Nome, CNPJ do MEI, função, cidade, desde quando, se tem conta no Conectwork (meiEmpresaId, pelo cnpjs/) e se aparece
     para os clientes (publico). Nada se apaga: o vínculo é encerrado (ativo:false, encerradoEm). Nunca CPF.
   - "Meus profissionais" (prestadora, não MEI): catálogo da equipe, acrescentar, trazer das medições, editar, encerrar, convidar.
   - "Equipes das prestadoras" (quem contrata): a equipe visível de cada prestadora com contrato. O contrato é com a prestadora:
     quem contrata não trata direto com o profissional.
   - O MEI vê o selo "Equipe <prestadora>" no Início (CW.profissionais.minhasEquipes). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const GRAVA = ['admin', 'operacional', 'rh', 'financeiro'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const casa = (t, q) => { const w = norm(q).split(/\s+/).filter(Boolean), n = norm(t); return w.every(x => n.includes(x)); };
  const dig = v => String(v || '').replace(/\D/g, '');
  const fmtCnpj = c => dig(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const desdeTxt = d => { const x = /^(\d{4})-(\d{2})/.exec(d || ''); return x ? MESES[+x[2] - 1] + '/' + x[1] : ''; };
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const tipo = ctx => ((ctx.contexto || ctx).empresa || {}).tipo || 'contratante';
  const cargo = ctx => ((ctx.contexto || ctx).acesso || {}).cargo;
  const ehMei = ctx => { let p = ''; try { p = sessionStorage.getItem('cw.porte.' + (ctx.contexto || ctx).empresaId) || ''; } catch (e) {} return String(p).startsWith('MEI'); };
  const pode = ctx => !ctx.soLeitura && GRAVA.includes(cargo(ctx));
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  function log(b, ctx, acao, texto, ref) { b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' }); }

  /* ---------- Meus profissionais (a prestadora) ---------- */
  let lista = null, F = { q: '', fn: '', enc: false };
  async function carregar(ctx) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId;
    lista = CW.fb.lista(await db.collection('equipe').where('prestadoraId', '==', emp).get());
    /* quem entrou no Conectwork depois: liga a conta do MEI pelo CNPJ (sem leitura a mais para quem já tem) */
    if (pode(ctx)) {
      const sem = lista.filter(x => !x.meiEmpresaId && x.ativo).slice(0, 30);
      await Promise.all(sem.map(async x => { try { const c = CW.fb.dados(await db.doc('cnpjs/' + x.cnpjNum).get()); if (c && c.empresaId) { await db.doc('equipe/' + x._id).update({ meiEmpresaId: c.empresaId, atualizadoEm: CW.fb.agora(), atualizadoPor: ctx.sessao.usuario.uid }); x.meiEmpresaId = c.empresaId; } } catch (e) { /* sem acesso */ } }));
    }
  }
  const convite = (ctx, x) => { const url = ((window.CONECTWORK_CONFIG || {}).urlApp) || location.origin + location.pathname, pn = String(x.nome).split(' ')[0];
    return `Olá, ${pn}! A ${ctx.contexto.nome} colocou você na equipe dela no Conectwork. Faça o cadastro do seu MEI (o CNPJ ${fmtCnpj(x.cnpjNum)} já vai preenchido): ${url.replace(/[?#].*$/, '')}?mei=${x.cnpjNum}&nome=${encodeURIComponent(pn)}`; };

  function cartao(x, ctx, gerencia) {
    const { esc, ic, avatar } = U();
    return `<div class="pf-it${x.ativo ? '' : ' enc'}" data-pf="${esc(x._id)}">
      <div class="pf-top">${avatar(x.nome, '', x.meiEmpresaId || '')}<div class="t"><strong>${esc(x.nome)}</strong><small>${esc(x.funcao || (gerencia ? 'Função não informada' : 'Profissional da equipe'))}</small></div></div>
      <div class="pf-meta">${x.cidade ? `<span>${ic('building')}${esc(x.cidade)}${x.uf ? '/' + esc(x.uf) : ''}</span>` : ''}${x.desde ? `<span>${ic('clock')}Na equipe desde ${esc(desdeTxt(x.desde))}</span>` : ''}${gerencia ? `<span>${ic('file')}MEI ${esc(fmtCnpj(x.cnpjNum))}</span>` : ''}</div>
      <div class="pf-selos">${x.meiEmpresaId ? `<span class="pf-selo ok">${ic('check')}MEI com conta no Conectwork</span>` : `<span class="pf-selo">${ic('file')}CNPJ do MEI conferido</span>`}
        ${gerencia ? (x.ativo ? (x.publico ? `<span class="pf-selo info">${ic('eye')}Os clientes veem</span>` : `<span class="pf-selo">${ic('eyeoff')}Só para vocês</span>`) : `<span class="pf-selo enc">Vínculo encerrado${x.encerradoEm ? ' em ' + esc(U().formatarData(x.encerradoEm)) : ''}</span>`) : ''}</div>
      ${gerencia && pode(ctx) ? `<div class="pf-a"><button class="btn sec sm" data-pf-ed="${esc(x._id)}">${ic('edit')}Editar</button>
        ${!x.meiEmpresaId && x.ativo ? `<button class="linkbtn" data-pf-conv="${esc(x._id)}" style="font-size:13px">${ic('copy')}Convidar</button>` : ''}
        ${x.ativo ? `<button class="linkbtn" data-pf-enc="${esc(x._id)}" style="font-size:13px;margin-left:auto">Encerrar vínculo</button>` : `<button class="linkbtn" data-pf-volta="${esc(x._id)}" style="font-size:13px;margin-left:auto">Voltou para a equipe</button>`}</div>` : ''}
    </div>`;
  }

  async function desenhar(el, ctx) {
    const { esc, ic } = U();
    const mst = !!(CW.sessao.estado() || {}).master && pode(ctx) && CW.cadastrosMaster;   /* "Colar lista": só a equipe Conectwork, para o cadastro inicial (13/11/2026) */
    document.getElementById('acoes').innerHTML = (mst ? `<button class="btn sec" id="pf-colar">${ic('clipboard')}Colar lista</button>` : '') + (pode(ctx) ? `<button class="btn sec" id="pf-trazer">${ic('list')}Trazer das medições</button><button class="btn" id="pf-novo">${ic('plus')}Adicionar profissional</button>` : '');
    if (!lista) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando a equipe…</span></div></div>`;
      try { await carregar(ctx); } catch (e) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível abrir a equipe.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; return; } }
    const ativos = lista.filter(x => x.ativo), fns = [...new Set(ativos.map(x => x.funcao).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    const xs = lista.filter(x => (F.enc || x.ativo) && (!F.fn || x.funcao === F.fn) && (!F.q || casa([x.nome, x.funcao, x.cidade, x.cnpjNum].join(' '), F.q)))
      .sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome, 'pt'));
    const n = { eq: ativos.length, conta: ativos.filter(x => x.meiEmpresaId).length, pub: ativos.filter(x => x.publico).length, enc: lista.length - ativos.length };
    el.innerHTML = `<section class="sv-topo pf-topo" id="pf-topo">
        <div class="sv-topo-t"><div><h2>Equipe da ${esc(ctx.contexto.nome)}</h2><p>Os profissionais que prestam serviço pela sua empresa. Os clientes veem a equipe (quem estiver marcado como visível) e contratam com a ${esc(ctx.contexto.nome)}, não direto com o profissional.</p></div>
          <div class="sv-res"><span><b>${n.eq}</b>na equipe</span><span><b>${n.conta}</b>com conta</span><span><b>${n.pub}</b>os clientes veem</span></div></div>
        <label class="sv-busca">${ic('busca')}<input id="pf-q" type="search" aria-label="Procurar profissional" placeholder="Procurar por nome, função, cidade ou CNPJ" value="${esc(F.q)}"></label>
        ${fns.length || n.enc ? `<div class="sv-chips"><button class="chip" data-pf-fn="" aria-pressed="${!F.fn}">Todas as funções</button>${fns.map(f => `<button class="chip" data-pf-fn="${esc(f)}" aria-pressed="${F.fn === f}">${esc(f)} <span>${ativos.filter(x => x.funcao === f).length}</span></button>`).join('')}
          ${n.enc ? `<label class="check" style="margin-left:auto"><input type="checkbox" id="pf-enc" ${F.enc ? 'checked' : ''}><span>Mostrar encerrados (${n.enc})</span></label>` : ''}</div>` : ''}
      </section>
      ${xs.length ? `<div class="pf-grade" id="pf-grade">${xs.map(x => cartao(x, ctx, true)).join('')}</div>`
        : `<div class="card"><div class="empty"><div class="ic">${ic('users')}</div><strong>${lista.length ? 'Nenhum profissional com esse filtro.' : 'A equipe ainda está vazia.'}</strong><span>${lista.length ? 'Tente outra palavra ou "Todas as funções".' : 'Acrescente os profissionais que prestam serviço pela sua empresa, ou traga de uma vez os que já vieram nas medições.'}</span>${!lista.length && pode(ctx) ? `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn sec" id="pf-trazer2">${ic('list')}Trazer das medições</button><button class="btn" id="pf-novo2">${ic('plus')}Adicionar profissional</button></div>` : ''}</div></div>`}
      <p class="hint" style="margin:16px 0 0;font-size:12px">Vínculo de prestação de serviço: o profissional é MEI e presta serviço pela ${esc(ctx.contexto.nome)}. Só nome, CNPJ do MEI, função e cidade; nada de CPF.</p>`;
    ligar(el, ctx);
  }

  function ligar(el, ctx) {
    const $ = id => document.getElementById(id);
    const q = $('pf-q'); if (q) q.oninput = () => { F.q = q.value; const p = q.selectionStart; desenhar(el, ctx).then(() => { const n = $('pf-q'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) {} } }); };
    el.querySelectorAll('[data-pf-fn]').forEach(b => b.onclick = () => { F.fn = b.dataset.pfFn; desenhar(el, ctx); });
    const en = $('pf-enc'); if (en) en.onchange = () => { F.enc = en.checked; desenhar(el, ctx); };
    ['pf-novo', 'pf-novo2'].forEach(id => { const b = $(id); if (b) b.onclick = () => editar(el, ctx, null); });
    ['pf-trazer', 'pf-trazer2'].forEach(id => { const b = $(id); if (b) b.onclick = () => trazer(el, ctx); });
    const cl = $('pf-colar'); if (cl) cl.onclick = () => colar(el, ctx);
    el.querySelectorAll('[data-pf-ed]').forEach(b => b.onclick = () => editar(el, ctx, lista.find(x => x._id === b.dataset.pfEd)));
    el.querySelectorAll('[data-pf-conv]').forEach(b => b.onclick = async () => { const x = lista.find(y => y._id === b.dataset.pfConv), t = convite(ctx, x);
      try { await navigator.clipboard.writeText(t); U().toast('Convite copiado. Mande para ' + x.nome.split(' ')[0] + ' (WhatsApp ou e-mail).'); } catch (e) { U().toast(t); } });
    el.querySelectorAll('[data-pf-enc]').forEach(b => b.onclick = () => encerrar(el, ctx, lista.find(x => x._id === b.dataset.pfEnc)));
    el.querySelectorAll('[data-pf-volta]').forEach(b => b.onclick = () => grava(el, ctx, lista.find(x => x._id === b.dataset.pfVolta), { ativo: true, encerradoEm: null }, 'equipe.voltou', 'voltou para a equipe'));
  }

  async function grava(el, ctx, x, mud, acao, txt) {
    const db = CW.fb.db(), b = db.batch();
    b.update(db.doc('equipe/' + x._id), Object.assign({}, mud, { atualizadoEm: CW.fb.agora(), atualizadoPor: ctx.sessao.usuario.uid }));
    log(b, ctx, acao, `${x.nome} (MEI ${fmtCnpj(x.cnpjNum)}) ${txt}.`, x._id);
    try { await b.commit(); Object.assign(x, mud); U().toast('Pronto.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    desenhar(el, ctx);
  }

  async function encerrar(el, ctx, x) {
    let data = null;
    await U().dialogo({ titulo: 'Encerrar o vínculo', sub: `${x.nome} deixa de aparecer na equipe para os clientes. O histórico fica guardado.`,
      corpo: `<label class="f"><span>Último dia de serviço pela ${U().esc(ctx.contexto.nome)}</span><input id="pf-dt" type="date" value="${hoje()}"></label><p class="err" id="pf-dt-e"></p>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Encerrar o vínculo', valor: 'ok', classe: 'dangerous', antes: d => { const v = d.querySelector('#pf-dt').value; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { d.querySelector('#pf-dt-e').textContent = 'Informe a data.'; return false; } data = v; return true; } }] });
    if (data) grava(el, ctx, x, { ativo: false, encerradoEm: data }, 'equipe.encerrar', 'teve o vínculo encerrado em ' + U().formatarData(data));
  }

  async function editar(el, ctx, x) {
    const { esc } = U(); let dados = null;
    const sug = ['Eletricista', 'Mecânico', 'Soldador', 'Operador de empilhadeira', 'Auxiliar de produção', 'Técnico de segurança', 'Pintor', 'Pedreiro', 'Encanador', 'Técnico de manutenção', 'Supervisor', 'Limpeza', 'Portaria'];
    await U().dialogo({ titulo: x ? 'Editar profissional' : 'Adicionar profissional', sub: 'Profissional MEI que presta serviço pela sua empresa.',
      corpo: `<div class="fgrid">
        <label class="f c12"><span>Nome completo</span><input id="pf-nome" maxlength="120" value="${esc(x ? x.nome : '')}" autocomplete="off"></label>
        <label class="f c6"><span>CNPJ do MEI</span><input id="pf-cnpj" inputmode="numeric" maxlength="18" value="${esc(x ? fmtCnpj(x.cnpjNum) : '')}" ${x ? 'disabled' : ''}></label>
        <label class="f c6"><span>Função</span><input id="pf-fn" maxlength="80" list="pf-fns" value="${esc(x ? x.funcao : '')}" placeholder="Ex.: Eletricista"><datalist id="pf-fns">${sug.map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
        <label class="f c6"><span>Cidade</span><input id="pf-cid" maxlength="60" value="${esc(x ? x.cidade : '')}"></label>
        <label class="f c2"><span>UF</span><input id="pf-uf" maxlength="2" value="${esc(x ? x.uf : '')}" style="text-transform:uppercase"></label>
        <label class="f c4"><span>Na equipe desde</span><input id="pf-desde" type="date" value="${esc(x ? x.desde || '' : hoje())}"></label>
        <label class="check c12"><input type="checkbox" id="pf-pub" ${!x || x.publico ? 'checked' : ''}><span>Os clientes da empresa podem ver este profissional na equipe</span></label>
        <p class="err c12" id="pf-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: x ? 'Salvar' : 'Adicionar', valor: 'ok', antes: d => {
        const g = s => d.querySelector(s).value.trim(), er = d.querySelector('#pf-erro');
        const v = { nome: g('#pf-nome').replace(/\s+/g, ' '), cnpjNum: x ? x.cnpjNum : dig(g('#pf-cnpj')), funcao: g('#pf-fn'), cidade: g('#pf-cid'), uf: g('#pf-uf').toUpperCase(), desde: g('#pf-desde'), publico: d.querySelector('#pf-pub').checked };
        if (v.nome.split(' ').length < 2 || v.nome.length < 5) { er.textContent = 'Escreva o nome e o sobrenome.'; return false; }
        if (!x && !U().validarCNPJ(v.cnpjNum)) { er.textContent = 'Esse CNPJ não é válido. Confira os números do CNPJ do MEI.'; return false; }
        if (!x && lista.some(y => y.cnpjNum === v.cnpjNum)) { er.textContent = 'Esse CNPJ já está na equipe.'; return false; }
        if (v.uf && !/^[A-Z]{2}$/.test(v.uf)) { er.textContent = 'Use a sigla do estado (ex.: RS).'; return false; }
        dados = v; return true; } }] });
    if (!dados) return;
    const db = CW.fb.db(), emp = ctx.contexto.empresaId, id = emp + '_' + dados.cnpjNum, agora = CW.fb.agora, b = db.batch();
    let mei = x ? x.meiEmpresaId || null : null;
    if (!mei) { try { const c = CW.fb.dados(await db.doc('cnpjs/' + dados.cnpjNum).get()); mei = (c && c.empresaId) || null; } catch (e) { mei = null; } }
    const base = { prestadoraId: emp, prestadoraNome: ctx.contexto.nome, cnpj: fmtCnpj(dados.cnpjNum), cnpjNum: dados.cnpjNum, nome: dados.nome, funcao: dados.funcao, cidade: dados.cidade, uf: dados.uf, desde: dados.desde, meiEmpresaId: mei, publico: dados.publico };
    if (x) b.update(db.doc('equipe/' + id), Object.assign(base, { atualizadoEm: agora(), atualizadoPor: ctx.sessao.usuario.uid }));
    else b.set(db.doc('equipe/' + id), Object.assign(base, { ativo: true, encerradoEm: null, criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora(), atualizadoPor: ctx.sessao.usuario.uid }));
    log(b, ctx, x ? 'equipe.mudar' : 'equipe.entrar', x ? `Dados de ${dados.nome} na equipe atualizados.` : `${dados.nome} (MEI ${fmtCnpj(dados.cnpjNum)}) entrou na equipe${dados.funcao ? ' como ' + dados.funcao : ''}.`, id);
    try { await b.commit(); U().toast(x ? 'Salvo.' : `${dados.nome.split(' ')[0]} está na equipe.`); lista = null; } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    desenhar(el, ctx);
  }

  /* traz de uma vez os profissionais com CNPJ que já vieram nas medições da prestadora (do painel do RH ou lançadas aqui) */
  async function trazer(el, ctx) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId; let meds = [];
    try { meds = CW.fb.lista(await db.collection('medicoes').where('prestadorId', '==', emp).get()).filter(m => m.status !== 'cancelada'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); return; }
    const novos = new Map();
    meds.sort((a, b) => String(a.periodo).localeCompare(String(b.periodo))).forEach(m => (m.memoria || []).forEach(p => { const c = dig(p.cnpj);
      if (c.length === 14 && U().validarCNPJ(c) && !lista.some(x => x.cnpjNum === c) && !novos.has(c)) { const per = String(m.periodo); novos.set(c, { nome: String(p.nome || '').trim(), cnpjNum: c, desde: per.length === 7 ? per + '-01' : per.slice(0, 7) + (per.endsWith('-2') ? '-16' : '-01') }); } }));
    const xs = [...novos.values()].filter(x => x.nome.length >= 3);
    if (!xs.length) { await U().dialogo({ titulo: 'Trazer das medições', corpo: `<p style="margin:0">Nenhum profissional novo com CNPJ nas medições da ${U().esc(ctx.contexto.nome)}. Quem vem nas medições sem o CNPJ do MEI precisa ser acrescentado à mão.</p>` }); return; }
    const ok = await U().confirmar('Trazer das medições', `${xs.length} profissiona${xs.length === 1 ? 'l' : 'is'} com CNPJ nas medições ainda não ${xs.length === 1 ? 'está' : 'estão'} na equipe: ${xs.slice(0, 8).map(x => x.nome).join(', ')}${xs.length > 8 ? '…' : ''}. Colocar na equipe (visíveis para os clientes)? Depois você completa a função de cada um.`, 'Colocar na equipe');
    if (!ok) return;
    const agora = CW.fb.agora; let feitos = 0;
    for (let i = 0; i < xs.length; i += 200) {
      const b = db.batch();
      for (const x of xs.slice(i, i + 200)) {
        let mei = null; try { const c = CW.fb.dados(await db.doc('cnpjs/' + x.cnpjNum).get()); mei = (c && c.empresaId) || null; } catch (e) { mei = null; }
        b.set(db.doc('equipe/' + emp + '_' + x.cnpjNum), { prestadoraId: emp, prestadoraNome: ctx.contexto.nome, cnpj: fmtCnpj(x.cnpjNum), cnpjNum: x.cnpjNum, nome: x.nome, funcao: '', cidade: '', uf: '', desde: x.desde, meiEmpresaId: mei,
          ativo: true, publico: true, encerradoEm: null, criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora(), atualizadoPor: ctx.sessao.usuario.uid });
      }
      log(b, ctx, 'equipe.trazer', `${Math.min(200, xs.length - i)} profissionais trazidos das medições para a equipe.`, '');
      try { await b.commit(); feitos += Math.min(200, xs.length - i); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); break; }
    }
    if (feitos) U().toast(`${feitos} profissiona${feitos === 1 ? 'l' : 'is'} na equipe. Complete a função de cada um.`);
    lista = null; desenhar(el, ctx);
  }

  /* ---------- Colar lista (13/11/2026, "quero já fazer os cadastros e deixar tudo certo"; botão só da equipe Conectwork) ----------
     Uma pessoa por linha: Nome; CNPJ do MEI; Função; Cidade; UF; Celular; E-mail (`;` ou tab, cabeçalho ignorado; só nome e CNPJ são
     obrigatórios; nunca CPF). Quem não tem cadastro no Conectwork é pré-cadastrado como MEI (com convite de admin, se tiver e-mail);
     todos entram na equipe, visíveis para os clientes. Quem já está na equipe fica como está. */
  function lerColar(txt) {
    const out = [];
    String(txt || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach((l, i) => {
      const c = l.split(/\t|;/).map(x => x.trim()), ci = c.findIndex(x => dig(x).length === 14);
      if (ci < 0) { if (i === 0 || /cnpj/i.test(l)) return; out.push({ linha: l, erro: 'sem CNPJ' }); return; }
      const resto = c.filter((x, j) => j !== ci && x), nome = (c[0] && 0 !== ci ? c[0] : '').replace(/\s+/g, ' ');
      const email = (resto.find(x => /@/.test(x)) || '').toLowerCase(), telR = dig(resto.find(x => !/@/.test(x) && dig(x).length >= 10 && dig(x).length <= 13) || '');
      const uf = (resto.find(x => /^[A-Za-z]{2}$/.test(x)) || '').toUpperCase(), txts = resto.filter(x => x !== c[0] && !/@/.test(x) && dig(x).length < 8 && !/^[A-Za-z]{2}$/.test(x));
      const r = { linha: l, nome, num: dig(c[ci]), cnpj: fmtCnpj(c[ci]), funcao: txts[0] || '', cidade: txts[1] || '', uf, email, tel: telR.length > 11 && telR.startsWith('55') ? telR.slice(2) : telR };
      if (!U().validarCNPJ(r.num)) r.erro = 'CNPJ inválido'; else if (nome.split(' ').length < 2) r.erro = 'falta o nome e sobrenome';
      else if (email && !U().validarEmail(email)) r.erro = 'e-mail inválido'; else if (out.some(o => o.num === r.num)) r.erro = 'CNPJ repetido na lista';
      out.push(r);
    });
    return out;
  }
  async function colar(el, ctx) {
    const { esc } = U(); let itens = null;
    const previa = d => { const xs = lerColar(d.querySelector('#pf-cl-t').value), bons = xs.filter(x => !x.erro), ja = bons.filter(x => lista.some(y => y.cnpjNum === x.num)), ruins = xs.filter(x => x.erro);
      d.querySelector('#pf-cl-p').innerHTML = !xs.length ? '' : `<b>${bons.length - ja.length}</b> entram na equipe${ja.length ? ` · ${ja.length} já estão` : ''}${ruins.length ? ` · <span style="color:var(--danger)">${ruins.length} com problema</span>` : ''}`
        + (ruins.length ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:12.5px;color:var(--danger)">${ruins.slice(0, 8).map(x => `<li>${esc(x.linha.slice(0, 60))}: ${esc(x.erro)}</li>`).join('')}</ul>` : ''); return bons.filter(x => !ja.includes(x)); };
    await U().dialogo({ titulo: 'Colar lista de profissionais', sub: `Entram na equipe da ${ctx.contexto.nome}. Quem ainda não tem cadastro no Conectwork é pré-cadastrado como MEI.`,
      corpo: `<p class="hint" style="margin:0 0 8px;font-size:12.5px">Uma pessoa por linha: <b>Nome; CNPJ do MEI; Função; Cidade; UF; Celular; E-mail</b> (ou colado do Excel). Só nome e CNPJ são obrigatórios. Nada de CPF.</p>
        <textarea id="pf-cl-t" rows="9" style="width:100%;font-size:14px" placeholder="Carlos Ramos; 33.000.167/0001-01; Eletricista; Gravataí; RS; 51999990000; carlos@email.com"></textarea><p id="pf-cl-p" style="margin:8px 0 0;font-size:13.5px"></p><p class="err" id="pf-cl-e"></p>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Cadastrar todos', valor: 'ok', antes: d => { const xs = previa(d); if (!xs.length) { d.querySelector('#pf-cl-e').textContent = 'Nenhuma pessoa nova para cadastrar.'; return false; } itens = xs; return true; } }],
      aoAbrir: d => { const t = d.querySelector('#pf-cl-t'); t.oninput = () => previa(d); t.focus(); } });
    if (!itens) return;
    const db = CW.fb.db(), emp = ctx.contexto.empresaId, u = CW.fb.auth().currentUser, st = CW.sessao.estado(), qn = (st.perfil && st.perfil.nome) || u.email, agora = CW.fb.agora;
    let feitos = 0, preCad = 0; const erros = [];
    U().toast(`Cadastrando ${itens.length}…`);
    for (const x of itens) {
      try {
        let mei = null; try { const c = CW.fb.dados(await db.doc('cnpjs/' + x.num).get()); mei = (c && c.empresaId) || null; } catch (e) { mei = null; }
        if (!mei) { const r = await CW.cadastrosMaster.preCadMei({ nome: x.nome, cnpj: x.cnpj, num: x.num, email: x.email, tel: x.tel, prest: ctx.contexto.nome }, u, qn, 'lista colada em Meus profissionais'); mei = r.empresaId; preCad++; }
        const b = db.batch();
        b.set(db.doc('equipe/' + emp + '_' + x.num), { prestadoraId: emp, prestadoraNome: ctx.contexto.nome, cnpj: x.cnpj, cnpjNum: x.num, nome: x.nome, funcao: x.funcao.slice(0, 80), cidade: x.cidade.slice(0, 60), uf: x.uf, desde: hoje(), meiEmpresaId: mei,
          ativo: true, publico: true, encerradoEm: null, criadoPor: u.uid, criadoPorNome: qn, criadoEm: agora(), atualizadoEm: agora(), atualizadoPor: u.uid });
        log(b, ctx, 'equipe.entrar', `${x.nome} (MEI ${x.cnpj}) entrou na equipe pela lista colada${x.funcao ? ' como ' + x.funcao : ''}.`, emp + '_' + x.num);
        await b.commit(); feitos++;
      } catch (e) { erros.push(`${x.nome}: ${CW.fb.mensagemErro(e)}`); }
    }
    lista = null; await desenhar(el, ctx);
    await U().dialogo({ titulo: 'Lista cadastrada', corpo: `<p style="margin:0">${feitos} profissiona${feitos === 1 ? 'l' : 'is'} na equipe da ${esc(ctx.contexto.nome)}${preCad ? `; ${preCad} MEI${preCad === 1 ? '' : 's'} pré-cadastrado${preCad === 1 ? '' : 's'} no Conectwork (quem tinha e-mail recebeu o convite)` : ''}.</p>${erros.length ? `<ul style="margin:10px 0 0;padding-left:18px;color:var(--danger);font-size:13px">${erros.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}` });
  }

  /* ---------- Equipes das prestadoras (quem contrata) ---------- */
  async function desenharEquipes(el, ctx, so) {
    const { esc, ic, avatar } = U(), db = CW.fb.db(), emp = ctx.contexto.empresaId;
    document.getElementById('acoes').innerHTML = '';
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando as equipes…</span></div></div>`;
    let cts = [];
    try { cts = CW.fb.lista(await db.collection('contratos').where('tomadorId', '==', emp).get()).filter(c => !['cancelado', 'encerrado'].includes(c.status)); } catch (e) { cts = []; }
    const prest = new Map(); cts.forEach(c => { if (!prest.has(c.prestadorId)) prest.set(c.prestadorId, { id: c.prestadorId, nome: c.prestadorNome, contrato: c }); });
    if (so && !prest.has(so)) prest.set(so, { id: so, nome: '', contrato: null });
    const ps = [...prest.values()].filter(p => !so || p.id === so);
    await Promise.all(ps.map(async p => { try { p.eq = CW.fb.lista(await db.collection('equipe').where('prestadoraId', '==', p.id).where('publico', '==', true).where('ativo', '==', true).get()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt')); if (!p.nome && p.eq[0]) p.nome = p.eq[0].prestadoraNome; } catch (e) { p.eq = []; } }));
    const tot = ps.reduce((s, p) => s + p.eq.length, 0);
    const bloco = p => `<section class="pf-emp" data-pf-emp="${esc(p.id)}"><div class="pf-emp-h">${avatar(p.nome, '', p.id)}<div class="t"><h3>${esc(p.nome || 'Prestadora')}</h3><small>${p.eq.length} profissiona${p.eq.length === 1 ? 'l' : 'is'} na equipe${p.contrato ? ' · contrato ' + (p.contrato.status === 'ativo' ? 'ativo' : 'em andamento') : ''}</small></div>
        <span class="pf-selo ok" style="margin-left:auto">${ic('shield')}Equipe da ${esc(p.nome || 'prestadora')}</span>${p.contrato ? `<a class="btn sec sm" href="#contratos/ver/${esc(p.contrato._id)}">${ic('file')}Ver o contrato</a>` : ''}</div>
      ${p.eq.length ? `<div class="pf-grade">${p.eq.filter(x => !F.q || casa([x.nome, x.funcao, x.cidade].join(' '), F.q)).map(x => cartao(x, ctx, false)).join('')}</div>` : `<p class="hint" style="margin:0">A ${esc(p.nome || 'prestadora')} ainda não mostrou a equipe no Conectwork.</p>`}</section>`;
    el.innerHTML = `<section class="sv-topo pf-topo"><div class="sv-topo-t"><div><h2>Equipes das prestadoras</h2><p>Os profissionais de cada prestadora com quem a sua empresa tem contrato. Você contrata e trata com a prestadora; ela responde pela equipe dela.</p></div>
        <div class="sv-res"><span><b>${ps.length}</b>prestadora${ps.length === 1 ? '' : 's'}</span><span><b>${tot}</b>profissionais</span></div></div>
        <label class="sv-busca">${ic('busca')}<input id="pf-q2" type="search" aria-label="Procurar profissional" placeholder="Procurar por nome, função ou cidade" value="${esc(F.q)}"></label></section>
      ${ps.length ? ps.map(bloco).join('') : `<div class="card"><div class="empty"><div class="ic">${ic('users')}</div><strong>Nenhuma prestadora com contrato.</strong><span>Quando a sua empresa tiver contrato com uma prestadora, a equipe dela aparece aqui.</span></div></div>`}`;
    const q = document.getElementById('pf-q2'); if (q) q.oninput = () => { F.q = q.value; const pos = q.selectionStart;
      el.querySelectorAll('.pf-it').forEach(c => { c.hidden = !!F.q && !casa(c.innerText, F.q); }); const n = document.getElementById('pf-q2'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } };
  }

  /* ---------- selo do MEI: de quais equipes ele faz parte ---------- */
  async function minhasEquipes(empresaId) {
    try { return CW.fb.lista(await CW.fb.db().collection('equipe').where('meiEmpresaId', '==', empresaId).get()).filter(x => x.ativo); } catch (e) { return []; }
  }

  CW.registrarModulo({
    id: 'profissionais', nome: 'Meus profissionais', icone: 'users', ordem: 27.1,
    para: ['empresa'], contrato: ['profissionais', 'contratos', 'cobrancas'],
    mostrar: ctx => tipo(ctx) !== 'contratante' && !ehMei(ctx),
    iniciar() { lista = null; F = { q: '', fn: '', enc: false }; return () => { lista = null; }; },
    telas: { lista: { nome: 'Meus profissionais', sub: 'A equipe da sua empresa: os profissionais que prestam serviço por ela.', render: (el, ctx) => desenhar(el, ctx) } }
  });
  CW.registrarModulo({
    id: 'equipes', nome: 'Equipes das prestadoras', icone: 'handshake', ordem: 27.15, livre: true,
    para: ['empresa'], contrato: ['contratos', 'cobrancas'],
    mostrar: ctx => tipo(ctx) !== 'prestador' && ['admin', 'solicitante', 'aprovador', 'operacional', 'rh', 'financeiro'].includes(cargo(ctx)),
    telas: {
      lista: { nome: 'Equipes das prestadoras', sub: 'Os profissionais de cada prestadora com quem você tem contrato.', render: (el, ctx) => desenharEquipes(el, ctx, null) },
      de: { nome: 'Equipe da prestadora', sub: 'Os profissionais desta prestadora.', render: (el, ctx) => desenharEquipes(el, ctx, ctx.params[0]) }
    }
  });
  CW.profissionais = { minhasEquipes };
})();
