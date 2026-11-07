/* Conectwork · Etapa 2, parte 4: espelho da nota (faturamento). Plano: docs/PLANO-COBRANCA-NOTAS.md.
   - Quando a medição é aprovada, o Financeiro (ou o admin) do tomador prepara o espelho: dados do tomador (razão social,
     CNPJ, inscrição municipal, endereço), contrato, competência, descrição sugerida da nota, valor aprovado,
     retenções informadas à mão (ISS, INSS, IR, PIS/COFINS/CSLL), líquido e vencimento previsto.
   - O vencimento vem do contrato (dias depois da nota válida) e não muda no espelho.
   - A prestadora vê em "Notas a emitir": "Serviço aprovado: confira os dados e envie sua nota fiscal", com botões de copiar.
     A nota é emitida fora do app (Emissor Nacional ou prefeitura); o envio do XML é a próxima parte.
   - Id = id da medição: uma medição tem um espelho só. Correção é permitida até a nota chegar (versão + histórico).
   - O dinheiro não passa pelo Conectwork. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const PREPARA = ['admin', 'financeiro'];
  const RET = [['iss', 'ISS'], ['inss', 'INSS'], ['ir', 'IR'], ['pcc', 'PIS/COFINS/CSLL']];
  const ST = { aguardando_nota: ['warn', 'Esperando a nota'] };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  let espT = [], espP = [], medsAprov = [], pronto = false;
  const brl = c => U().formatarDinheiro(c);
  const pill = s => { const x = ST[s] || ['info', s]; return `<span class="pill ${x[0]}">${U().esc(x[1])}</span>`; };
  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const pode = ctx => !ctx.soLeitura && PREPARA.includes(cargo(ctx));
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const lado = (x, ctx) => x.tomadorId === ctx.contexto.empresaId ? 'tomador' : 'prestador';
  const periodoTxt = p => CW.medicoes ? CW.medicoes.periodoTxt(p) : p;
  const competencia = p => String(p || '').slice(0, 7);
  const compTxt = c => { const m = /^(\d{4})-(\d{2})$/.exec(c || ''); return m ? MESES[+m[2] - 1] + '/' + m[1] : c; };
  const vencTxt = n => n === 0 ? 'No mesmo dia da nota válida' : `${n} dia${n === 1 ? '' : 's'} depois da nota válida`;
  const somaRet = r => RET.reduce((s, [k]) => s + ((r || {})[k] || 0), 0);
  const log = (b, ctx, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });
  const endTxt = en => { en = en || {}; return [[en.logradouro, en.numero].filter(Boolean).join(', ') + (en.compl ? ' · ' + en.compl : ''), en.bairro, en.cep ? 'CEP ' + en.cep : ''].filter(Boolean).join(' · '); };
  const sugestao = (c, m) => `Prestação de serviços: ${String((c && c.objeto) || '').replace(/\.\s*$/, '')}. Período: ${periodoTxt(m.periodo)}. Conforme contrato de equipe contínua e medição aprovada.`;

  /* copiar para a área de transferência (com reserva para navegadores sem a API) */
  async function copiar(txt) {
    try { await navigator.clipboard.writeText(txt); }
    catch (e) { const t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) {} t.remove(); }
    U().toast('Copiado.');
  }

  /* ---------- lista ---------- */
  function desenharLista(el, ctx) {
    const { esc, ic, avatar } = U();
    document.getElementById('acoes').innerHTML = '';
    if (!pronto) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando os espelhos…</span></div></div>`; return; }
    const todos = espT.concat(espP).sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)));
    const comEsp = new Set(espT.map(x => x._id));
    const preparar = pode(ctx) ? medsAprov.filter(m => !comEsp.has(m._id)) : [];
    const emitir = espP.filter(x => x.status === 'aguardando_nota');
    const outro = x => lado(x, ctx) === 'tomador' ? x.prestadorNome : x.tomadorNome;
    const linhaEsp = x => `<tr class="click" data-abrir="${esc(x._id)}" tabindex="0"><td class="m-full"><div class="cell">${avatar(outro(x))}<div style="min-width:0"><strong>${esc(periodoTxt(x.periodo))}</strong><small>${esc(outro(x))} · ${lado(x, ctx) === 'tomador' ? 'você paga' : 'você emite a nota'}</small></div></div></td>
      <td class="r"><b>${esc(brl(x.valorCentavos))}</b><br><small class="hint">líquido ${esc(brl(x.liquidoCentavos))}</small></td><td>${pill(x.status)}</td></tr>`;
    const tab = (xs, id) => `<div class="scroll"><table class="resp" id="${id}"><thead><tr><th>Período</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${xs.map(linhaEsp).join('')}</tbody></table></div>`;
    el.innerHTML = `
      ${preparar.length ? `<section class="card" id="es-preparar" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Espelhos para preparar</h3><span class="count">${preparar.length}</span></div>
        <div class="scroll"><table class="resp" id="es-tab-preparar"><thead><tr><th>Medição aprovada</th><th class="r">Valor</th><th></th></tr></thead><tbody>
        ${preparar.map(m => `<tr><td class="m-full"><div class="cell">${avatar(m.prestadorNome)}<div style="min-width:0"><strong>${esc(periodoTxt(m.periodo))}</strong><small>${esc(m.prestadorNome)} · aprovada${m.aprovacao && m.aprovacao.nome ? ' por ' + esc(m.aprovacao.nome) : ''}</small></div></div></td>
          <td class="r"><b>${esc(brl(m.valorCentavos))}</b></td><td class="r"><button class="btn sm" data-preparar="${esc(m._id)}">${ic('edit')}Preparar espelho</button></td></tr>`).join('')}
        </tbody></table></div></section>` : ''}
      ${emitir.length ? `<section class="card" id="es-emitir" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Notas a emitir</h3><span class="count">${emitir.length}</span></div>
        <div class="card-b" style="padding-bottom:0"><div class="banner ok">${ic('check')}<span><strong>Serviço aprovado: confira os dados e envie sua nota fiscal</strong>Abra o espelho, copie os dados e emita a NFS-e no Emissor Nacional (gov.br) ou na prefeitura.</span></div></div>
        ${tab(emitir, 'es-tab-emitir')}</section>` : ''}
      <section class="card" id="es-lista"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Espelhos da nota</h3><span class="count">${todos.length}</span></div>
        ${todos.length ? tab(todos, 'es-tab') : `<div class="empty"><div class="ic">${ic('receipt')}</div><strong>Nenhum espelho ainda.</strong><span>Quando uma medição for aprovada, o financeiro de quem contrata prepara o espelho com os dados da nota.</span></div>`}</section>`;
    el.querySelectorAll('[data-preparar]').forEach(b => b.onclick = () => CW.ir('espelhos/preparar/' + b.dataset.preparar));
    el.querySelectorAll('[data-abrir]').forEach(r => { const ir = () => CW.ir('espelhos/ver/' + r.dataset.abrir); r.onclick = ir; r.onkeydown = e => { if (e.key === 'Enter') ir(); }; });
  }

  /* ---------- preparar / corrigir ---------- */
  async function desenharPreparar(el, ctx, id) {
    const { esc, ic, formatarDinheiro } = U(), db = CW.fb.db();
    const fim = (tipo, t, txt) => { el.innerHTML = `<div class="banner ${tipo}" id="es-msg">${ic('alert')}<span><strong>${esc(t)}</strong>${esc(txt)}</span></div><div style="margin-top:14px"><button class="btn sec" id="es-volta">${ic('back')}Voltar para os espelhos</button></div>`; document.getElementById('es-volta').onclick = () => CW.ir('espelhos'); };
    if (!pode(ctx)) return fim('warn', 'Quem prepara o espelho é o Financeiro', 'Peça ao financeiro ou ao administrador da empresa.');
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando a medição…</span></div></div>`;
    let m, e, ja, c, emp, pv;
    try {
      const [a, b] = await Promise.all([db.doc('medicoes/' + id).get(), db.doc('espelhos/' + id).get()]);
      m = CW.fb.dados(a); e = CW.fb.dados(b);
      if (!m) return fim('danger', 'Medição não encontrada', 'Ela pode ter sido aberta por um link antigo.');
      if (m.tomadorId !== ctx.contexto.empresaId) return fim('warn', 'Esta medição não é para a sua empresa pagar', 'Só quem contrata prepara o espelho.');
      if (!e && m.status !== 'aprovada') return fim('warn', 'A medição ainda não foi aprovada', 'O espelho só é preparado depois que o aprovador técnico aprova a medição.');
      if (e && e.status !== 'aguardando_nota') return fim('warn', 'Este espelho não pode mais ser corrigido', 'A nota já foi enviada.');
      const [cc, ee, pp] = await Promise.all([db.doc('contratos/' + m.contratoId).get(), db.doc('empresas/' + m.tomadorId).get(), db.doc('empresas/' + m.tomadorId + '/privado/cadastro').get()]);
      c = CW.fb.dados(cc) || {}; emp = CW.fb.dados(ee) || ctx.contexto.empresa || {}; pv = CW.fb.dados(pp) || {};
    } catch (err) { return fim('danger', 'Não foi possível abrir a medição', CW.fb.mensagemErro(err)); }
    m._id = id; ja = e;
    document.getElementById('titulo').textContent = (ja ? 'Corrigir espelho · ' : 'Espelho · ') + periodoTxt(m.periodo);
    const en = pv.end || {};
    const tom = ja ? ja.tomador : { razao: emp.razao || emp.nome || '', cnpj: emp.cnpj || '', im: (pv.dados || {}).im || '', endereco: endTxt(en), cidade: en.cidade || '', uf: en.uf || '' };
    const venc = ja ? ja.vencimentoDias : c.vencimentoDias;
    const r0 = (ja && ja.retencoes) || {};
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="es-voltar">${ic('back')}Voltar</button></div>
      ${ja ? `<div class="banner info">${ic('edit')}<span><strong>Corrigindo o espelho (versão ${ja.versao})</strong>A prestadora vê a versão nova e a correção fica no histórico.</span></div>` : ''}
      <div class="grid-main"><div class="stack">
        <section class="card" id="es-tomador"><div class="card-h"><span class="ic">${ic('building')}</span><h3>Quem toma o serviço (vai na nota)</h3></div><div class="card-b"><dl class="dl">
          <div class="full"><dt>Razão social</dt><dd>${esc(tom.razao)}</dd></div><div><dt>CNPJ</dt><dd>${esc(tom.cnpj)}</dd></div><div><dt>Inscrição municipal</dt><dd>${esc(tom.im || '—')}</dd></div>
          <div class="full"><dt>Endereço</dt><dd>${esc(tom.endereco || '—')}${tom.cidade ? ' · ' + esc(tom.cidade + '/' + tom.uf) : ''}</dd></div></dl>
          <p class="hint" style="margin:12px 0 0;font-size:12.5px">Vêm do cadastro da sua empresa (Minha empresa).</p></div></section>
        <section class="card"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Nota</h3></div><div class="card-b"><form class="stack" id="es-form" style="gap:14px" novalidate>
          <dl class="dl"><div><dt>Prestadora</dt><dd>${esc(m.prestadorNome)}</dd></div><div><dt>Competência</dt><dd>${esc(compTxt(competencia(m.periodo)))}</dd></div>
            <div><dt>Período</dt><dd>${esc(periodoTxt(m.periodo))}</dd></div><div><dt>Valor aprovado</dt><dd style="font-size:18px" id="es-bruto">${esc(brl(m.valorCentavos))}</dd></div></dl>
          <label class="f"><span>Descrição sugerida da nota</span><textarea id="es-desc" rows="3" maxlength="1000">${esc(ja ? ja.descricao : sugestao(c, m))}</textarea></label>
          <div><p style="margin:0 0 4px;font-size:13px;font-weight:500">Retenções</p><p class="hint" style="margin:0 0 10px;font-size:12.5px">Informe o valor de cada retenção (deixe em branco o que não tem). As regras de retenção ainda serão definidas com o contador.</p>
            <div class="fgrid">${RET.map(([k, n]) => `<label class="f c6"><span>${n}</span><input id="es-r-${k}" data-mascara="dinheiro" inputmode="numeric" placeholder="0,00" value="${r0[k] ? formatarDinheiro(r0[k], false) : ''}"></label>`).join('')}</div></div>
          <div class="md-total"><span>Líquido a pagar</span><b id="es-liq">${esc(brl(m.valorCentavos))}</b></div>
          <dl class="dl"><div class="full"><dt>Vencimento previsto</dt><dd id="es-venc">${esc(vencTxt(venc))}</dd></div></dl>
          <p class="hint" style="margin:-6px 0 0;font-size:12.5px">O vencimento vem do contrato e não muda no espelho. Para mudar, proponha no contrato: só vale com o aceite da prestadora.</p>
          <label class="f"><span>Observação para a prestadora <i>(opcional)</i></span><input id="es-obs" maxlength="300" value="${esc((ja && ja.obs) || '')}"></label>
          <p class="err" id="es-erro" role="alert"></p>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit" class="btn" id="es-salvar">${ic('send')}${ja ? 'Salvar correção' : 'Enviar para a prestadora'}</button></div>
        </form></div></section>
      </div><div class="stack">
        <section class="card"><div class="card-h"><span class="ic">${ic('users')}</span><h3>Memória da medição</h3><span class="count">${(m.memoria || []).length}</span></div>
          <div class="scroll"><table><tbody>${(m.memoria || []).map(x => `<tr><td>${esc(x.nome)}</td><td class="r">${esc(brl(x.valorCentavos))}</td></tr>`).join('')}</tbody></table></div></section>
      </div></div>`;
    U().aplicarMascaras(el);
    const g = x => document.getElementById(x);
    const ler = () => { const r = {}; RET.forEach(([k]) => { r[k] = U().lerDinheiro(g('es-r-' + k).value) || 0; }); return r; };
    const atualiza = () => { const liq = m.valorCentavos - somaRet(ler()); g('es-liq').textContent = brl(liq); g('es-liq').style.color = liq > 0 ? '' : 'var(--danger)'; g('es-erro').textContent = ''; };
    g('es-form').addEventListener('input', atualiza); atualiza();
    g('es-voltar').onclick = () => CW.ir(ja ? 'espelhos/ver/' + id : 'espelhos');
    g('es-form').onsubmit = async ev => {
      ev.preventDefault();
      const er = g('es-erro'), desc = g('es-desc').value.trim().replace(/\s+/g, ' '), ret = ler(), liq = m.valorCentavos - somaRet(ret), obs = g('es-obs').value.trim();
      if (desc.length < 10) { er.textContent = 'Escreva a descrição da nota (pelo menos 10 letras).'; g('es-desc').focus(); return; }
      if (!(liq > 0)) { er.textContent = 'As retenções somam mais que o valor aprovado. Confira os valores.'; return; }
      if (!tom.cnpj || !tom.razao) { er.textContent = 'Faltam a razão social ou o CNPJ da sua empresa. Confira em Minha empresa.'; return; }
      const b = db.batch(), agora = CW.fb.agora, ref = db.doc('espelhos/' + id), retTxt = RET.filter(([k]) => ret[k]).map(([k, n]) => `${n} ${brl(ret[k])}`).join(', ') || 'sem retenções';
      if (ja) {
        b.update(ref, { descricao: desc, retencoes: ret, liquidoCentavos: liq, obs, versao: ja.versao + 1, atualizadoPor: ctx.sessao.usuario.uid, atualizadoPorNome: quem(ctx), atualizadoEm: agora() });
        log(b, ctx, 'espelho.corrigir', `Espelho de ${periodoTxt(m.periodo)} (${m.prestadorNome}) corrigido (versão ${ja.versao + 1}): ${retTxt}; líquido ${brl(liq)} (antes ${brl(ja.liquidoCentavos)}).`, id);
      } else {
        b.set(ref, { medicaoId: id, contratoId: m.contratoId, tomadorId: m.tomadorId, prestadorId: m.prestadorId, partes: [m.tomadorId, m.prestadorId],
          tomadorNome: m.tomadorNome, prestadorNome: m.prestadorNome, prestadorCnpj: c.prestadorCnpj || '', tomador: tom,
          periodo: m.periodo, competencia: competencia(m.periodo), descricao: desc, valorCentavos: m.valorCentavos, retencoes: ret, liquidoCentavos: liq,
          vencimentoDias: venc, obs, status: 'aguardando_nota', versao: 1,
          criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoPor: ctx.sessao.usuario.uid, atualizadoPorNome: quem(ctx), atualizadoEm: agora() });
        log(b, ctx, 'espelho.preparar', `Espelho de ${periodoTxt(m.periodo)} preparado para ${m.prestadorNome}: ${brl(m.valorCentavos)}, ${retTxt}; líquido ${brl(liq)}.`, id);
      }
      g('es-salvar').disabled = true;
      try { await b.commit(); U().toast(ja ? 'Espelho corrigido. A prestadora vê a versão nova.' : 'Espelho enviado. Agora a prestadora emite a nota.'); CW.ir('espelhos/ver/' + id); }
      catch (err) { g('es-salvar').disabled = false; er.textContent = CW.fb.mensagemErro(err); }
    };
  }

  /* ---------- ver ---------- */
  async function desenharVer(el, ctx, id) {
    const { esc, ic, formatarDataHora, formatarDinheiro } = U();
    let x;
    try { x = CW.fb.dados(await CW.fb.db().doc('espelhos/' + id).get()); } catch (e) { x = null; }
    if (!x) { el.innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('receipt')}</div><strong>Espelho não encontrado.</strong><button class="btn sec sm" id="es-volta">${ic('back')}Voltar</button></div></div>`; document.getElementById('es-volta').onclick = () => CW.ir('espelhos'); return; }
    const l = lado(x, ctx), t = x.tomador || {};
    document.getElementById('titulo').textContent = 'Espelho · ' + periodoTxt(x.periodo);
    document.getElementById('acoes').innerHTML = '';
    const cp = (rot, v, chave, cheio) => `<div class="${cheio ? 'full' : ''}"><dt>${rot}</dt><dd class="es-cp"><span>${esc(v || '—')}</span>${v ? `<button class="iconbtn sm" data-copiar="${esc(chave)}" aria-label="Copiar ${esc(rot)}" title="Copiar">${ic('copy')}</button>` : ''}</dd></div>`;
    const copias = { razao: t.razao, cnpj: U().dig(t.cnpj), im: t.im, end: [t.endereco, t.cidade && t.cidade + '/' + t.uf].filter(Boolean).join(' · '), desc: x.descricao, valor: formatarDinheiro(x.valorCentavos, false) };
    RET.forEach(([k]) => { copias['r_' + k] = formatarDinheiro((x.retencoes || {})[k] || 0, false); });
    const temRet = somaRet(x.retencoes) > 0;
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="es-voltar">${ic('back')}Voltar para os espelhos</button></div>
      ${l === 'prestador' && x.status === 'aguardando_nota' ? `<div class="banner ok" id="es-aviso">${ic('check')}<span><strong>Serviço aprovado: confira os dados e envie sua nota fiscal</strong>Emita a NFS-e no Emissor Nacional (gov.br) ou no site da prefeitura com os dados abaixo. Use os botões para copiar. O envio do arquivo da nota (XML) pelo Conectwork entra na próxima parte.</span></div>` : ''}
      ${l === 'tomador' && x.status === 'aguardando_nota' ? `<div class="banner info" id="es-aviso">${ic('clock')}<span><strong>Esperando a nota da ${esc(x.prestadorNome)}</strong>A prestadora já vê o espelho. A nota é conferida com o contrato, a medição e este espelho.</span></div>` : ''}
      <div class="grid-main"><div class="stack">
        <section class="card" id="es-tom"><div class="card-h"><span class="ic">${ic('building')}</span><h3>Tomador do serviço</h3><span style="margin-left:auto">${pill(x.status)}</span></div><div class="card-b"><dl class="dl">
          ${cp('Razão social', t.razao, 'razao', 1)}${cp('CNPJ', t.cnpj, 'cnpj')}${cp('Inscrição municipal', t.im, 'im')}${cp('Endereço', copias.end, 'end', 1)}</dl></div></section>
        <section class="card" id="es-nota"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Dados da nota</h3></div><div class="card-b"><dl class="dl">
          <div><dt>Prestadora</dt><dd>${esc(x.prestadorNome)}${x.prestadorCnpj ? '<br><span class="hint">' + esc(x.prestadorCnpj) + '</span>' : ''}</dd></div>
          <div><dt>Competência</dt><dd>${esc(compTxt(x.competencia))}</dd></div>
          ${cp('Descrição do serviço', x.descricao, 'desc', 1)}
          ${cp('Valor do serviço', brl(x.valorCentavos), 'valor')}<div><dt>Período da medição</dt><dd>${esc(periodoTxt(x.periodo))}</dd></div>
          ${x.obs ? `<div class="full"><dt>Observação</dt><dd>${esc(x.obs)}</dd></div>` : ''}</dl></div></section>
      </div><div class="stack">
        <section class="card" id="es-valores"><div class="card-h"><span class="ic">${ic('wallet')}</span><h3>Valores</h3></div><div class="card-b stack" style="gap:12px">
          <div class="scroll"><table><tbody><tr><td>Valor aprovado</td><td class="r"><b>${esc(brl(x.valorCentavos))}</b></td></tr>
          ${RET.map(([k, n]) => `<tr><td>${n}</td><td class="r">${(x.retencoes || {})[k] ? '− ' + esc(brl(x.retencoes[k])) + ` <button class="iconbtn sm" data-copiar="r_${k}" aria-label="Copiar ${n}" title="Copiar">${ic('copy')}</button>` : '<span class="hint">—</span>'}</td></tr>`).join('')}</tbody></table></div>
          ${temRet ? '' : '<p class="hint" style="margin:0;font-size:12.5px">Sem retenções informadas.</p>'}
          <div class="md-total"><span>Líquido a pagar</span><b id="es-liq">${esc(brl(x.liquidoCentavos))}</b></div>
          <dl class="dl"><div class="full"><dt>Vencimento previsto</dt><dd id="es-venc">${esc(vencTxt(x.vencimentoDias))}</dd></div></dl>
          <p class="hint" style="margin:0;font-size:12.5px">Vem do contrato. O dinheiro sai de quem contrata direto para a prestadora; não passa pelo Conectwork.</p>
        </div></section>
        <section class="card" id="es-andamento"><div class="card-h"><span class="ic">${ic('clock')}</span><h3>Andamento</h3></div><div class="card-b stack" style="gap:14px">
          <ul class="tl"><li class="done"><span class="dot">${ic('check')}</span>Medição aprovada<small><a href="#medicoes/ver/${esc(x.medicaoId)}" class="linkbtn" style="font-size:12px">ver a medição</a></small></li>
            <li class="done"><span class="dot">${ic('check')}</span>Espelho preparado${x.versao > 1 ? ` (versão ${x.versao})` : ''}<small>${esc(formatarDataHora(x.criadoEm))} · ${esc(x.criadoPorNome || '')}${x.versao > 1 ? ` · corrigido ${esc(formatarDataHora(x.atualizadoEm))} por ${esc(x.atualizadoPorNome || '')}` : ''}</small></li>
            <li class="${x.status === 'aguardando_nota' ? 'now' : ''}"><span class="dot"></span>Nota fiscal enviada pela prestadora<small>esperando</small></li>
            <li><span class="dot"></span>Conferência: contrato + medição + nota<small></small></li></ul>
          ${l === 'tomador' && x.status === 'aguardando_nota' && pode(ctx) ? `<div><button class="btn sec" id="es-corrigir">${ic('edit')}Corrigir o espelho</button></div>` : ''}
        </div></section></div></div>`;
    document.getElementById('es-voltar').onclick = () => CW.ir('espelhos');
    el.querySelectorAll('[data-copiar]').forEach(b => b.onclick = () => copiar(copias[b.dataset.copiar] || ''));
    const co = document.getElementById('es-corrigir'); if (co) co.onclick = () => CW.ir('espelhos/preparar/' + x._id);
  }

  /* bloco no detalhe da medição aprovada: "Preparar espelho" ou "Ver espelho" */
  async function blocoMedicao(box, ctx, m) {
    if (!box) return;
    const { ic } = U();
    let e = null;
    try { e = CW.fb.dados(await CW.fb.db().doc('espelhos/' + m._id).get()); } catch (err) { e = null; }
    const visivel = CW.app.visiveis().some(x => x.id === 'espelhos');
    if (e) box.innerHTML = visivel ? `<button class="btn sec" id="md-espelho-ver">${ic('receipt')}Ver o espelho da nota</button>` : `<p class="hint" style="margin:0;font-size:12.5px">Espelho da nota preparado.</p>`;
    else if (lado(m, ctx) === 'tomador' && pode(ctx) && visivel) box.innerHTML = `<button class="btn" id="md-espelho-prep">${ic('edit')}Preparar o espelho da nota</button>`;
    else box.innerHTML = `<p class="hint" style="margin:0;font-size:12.5px">Próximo passo: o financeiro de ${lado(m, ctx) === 'tomador' ? 'sua empresa' : m.tomadorNome} prepara o espelho da nota.</p>`;
    const a = document.getElementById('md-espelho-ver'), b = document.getElementById('md-espelho-prep');
    if (a) a.onclick = () => CW.ir('espelhos/ver/' + m._id);
    if (b) b.onclick = () => CW.ir('espelhos/preparar/' + m._id);
  }

  CW.registrarModulo({
    id: 'espelhos', nome: 'Espelhos da nota', nomeCurto: 'Espelhos', icone: 'receipt', ordem: 27,
    para: ['empresa'], contrato: ['contratos', 'cobrancas'],
    iniciar(ctx) {
      espT = []; espP = []; medsAprov = []; pronto = false;
      const db = CW.fb.db(), emp = ctx.contexto.empresaId, ok = { t: false, p: false, m: false };
      const redesenha = () => {
        if (!(ok.t && ok.p && ok.m)) return; pronto = true;
        const el = document.getElementById('view'), at = CW.app.atual();
        if (el && at && at.modulo === 'espelhos' && at.tela === 'lista') desenharLista(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() }));
      };
      CW.inscrever('espelhos-t', () => db.collection('espelhos').where('tomadorId', '==', emp), s => { espT = CW.fb.lista(s); ok.t = true; redesenha(); });
      CW.inscrever('espelhos-p', () => db.collection('espelhos').where('prestadorId', '==', emp), s => { espP = CW.fb.lista(s); ok.p = true; redesenha(); });
      if (pode(ctx)) CW.inscrever('espelhos-m', () => db.collection('medicoes').where('tomadorId', '==', emp), s => { medsAprov = CW.fb.lista(s).filter(m => m.status === 'aprovada'); ok.m = true; redesenha(); });
      else ok.m = true;
      return () => { pronto = false; };
    },
    telas: {
      lista: { nome: 'Espelhos da nota', sub: 'Dados da nota fiscal de cada medição aprovada: quem contrata prepara, a prestadora emite.', render: (el, ctx) => desenharLista(el, ctx) },
      preparar: { nome: 'Preparar espelho', sub: 'Confira os dados, informe as retenções e envie para a prestadora emitir a nota.', render: (el, ctx) => desenharPreparar(el, ctx, ctx.params[0]) },
      ver: { nome: 'Espelho da nota', sub: 'Os dados para emitir a nota fiscal, as retenções e o líquido.', render: (el, ctx) => desenharVer(el, ctx, ctx.params[0]) }
    }
  });
  CW.espelhos = { blocoMedicao, sugestao, vencTxt };
})();
