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
  const ST = { aguardando_nota: ['warn', 'Esperando a nota'], nota_enviada: ['info', 'Nota para conferir'], nota_ok: ['ok', 'Nota conferida'] };
  const ENVIA = ['admin', 'financeiro', 'operacional'];   /* quem da prestadora emite e envia a nota */
  const EMISSOR = 'https://www.nfse.gov.br/EmissorNacional';
  const MAX_ARQ = 3 * 1024 * 1024, PEDACO = 700000;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  let espT = [], espP = [], medsAprov = [], osAprov = [], pronto = false, ultimoCtx = null;
  /* ordem de serviço aceita vira a "medição" do espelho: valor aceito, competência = mês do aceite */
  const msDe = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
  function deOs(o, id) {
    const d = new Date(msDe(o.aceite && o.aceite.em) || Date.now()), per = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { _id: id || o._id, origem: 'os', numero: o.numero, titulo: o.titulo, contratoId: o.contratoId, tomadorId: o.tomadorId, prestadorId: o.prestadorId, tomadorNome: o.tomadorNome, prestadorNome: o.prestadorNome,
      periodo: per, valorCentavos: (o.aceite || {}).valorAceito || 0, status: ['aceita_total', 'aceita_parcial'].includes(o.status) ? 'aprovada' : o.status, aprovacao: o.aceite || null,
      memoria: [{ nome: `OS ${o.numero} · ${o.titulo}`, valorCentavos: (o.aceite || {}).valorAceito || 0 }] };
  }
  const brl = c => U().formatarDinheiro(c);
  const pill = s => { const x = ST[s] || ['info', s]; return `<span class="pill ${x[0]}">${U().esc(x[1])}</span>`; };
  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const pode = ctx => !ctx.soLeitura && PREPARA.includes(cargo(ctx));
  const podeEnviar = ctx => !ctx.soLeitura && ENVIA.includes(cargo(ctx));
  /* site para emitir a nota, escolhido sozinho: 1) o que a própria empresa definiu (Minha empresa › área privada, admin);
     2) o da cidade da empresa na tabela da equipe Conectwork (config/emissores); 3) o Emissor Nacional (gov.br). */
  const chaveCidade = (uf, cid) => (String(uf || '').toUpperCase() + '|' + String(cid || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim());
  let emissorCache = null;
  async function resolverEmissor(ctx) {
    const emp = ctx.contexto.empresaId;
    if (emissorCache && emissorCache.emp === emp) return emissorCache;
    const db = CW.fb.db(); let pv = {}, tab = {};
    try { pv = CW.fb.dados(await db.doc('empresas/' + emp + '/privado/cadastro').get()) || {}; } catch (e) {}
    try { tab = (CW.fb.dados(await db.doc('config/emissores').get()) || {}).cidades || {}; } catch (e) {}
    const en = pv.end || {}, cid = en.cidade || '', uf = en.uf || '', t = tab[chaveCidade(uf, cid)];
    let r;
    if (pv.emissor && pv.emissor.url) r = { url: pv.emissor.url, origem: 'empresa', nome: pv.emissor.nome || 'site da prefeitura' };
    else if (t && t.url) r = { url: t.url, origem: 'cidade', nome: t.nome || 'site da prefeitura' };
    else r = { url: EMISSOR, origem: 'padrao', nome: 'Emissor Nacional' };
    emissorCache = Object.assign(r, { emp, cidade: cid, uf });
    return emissorCache;
  }
  const emissorDe = () => (emissorCache && emissorCache.url) || EMISSOR;
  const tamTxt = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const lado = (x, ctx) => x.tomadorId === ctx.contexto.empresaId ? 'tomador' : 'prestador';
  const periodoTxt = p => CW.medicoes ? CW.medicoes.periodoTxt(p) : p;
  const competencia = p => String(p || '').slice(0, 7);
  const compTxt = c => { const m = /^(\d{4})-(\d{2})$/.exec(c || ''); return m ? MESES[+m[2] - 1] + '/' + m[1] : c; };
  const vencTxt = n => n === 0 ? 'No mesmo dia da nota válida' : `${n} dia${n === 1 ? '' : 's'} depois da nota válida`;
  const somaRet = r => RET.reduce((s, [k]) => s + ((r || {})[k] || 0), 0);
  const log = (b, ctx, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });
  const endTxt = en => { en = en || {}; return [[en.logradouro, en.numero].filter(Boolean).join(', ') + (en.compl ? ' · ' + en.compl : ''), en.bairro, en.cep ? 'CEP ' + en.cep : ''].filter(Boolean).join(' · '); };
  const sugestao = (c, m) => m.origem === 'os' ? `Prestação de serviços: ordem de serviço nº ${m.numero} · ${m.titulo}. Conforme contrato de serviço por entrega e entrega aceita em ${periodoTxt(m.periodo)}.` : `Prestação de serviços: ${String((c && c.objeto) || '').replace(/\.\s*$/, '')}. Período: ${periodoTxt(m.periodo)}. Conforme contrato de equipe contínua e medição aprovada.`;

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
    const preparar = pode(ctx) ? medsAprov.concat(osAprov).filter(m => !comEsp.has(m._id)) : [];
    const emitir = espP.filter(x => x.status === 'aguardando_nota');
    const conferir = pode(ctx) ? espT.filter(x => x.status === 'nota_enviada') : [];
    const outro = x => lado(x, ctx) === 'tomador' ? x.prestadorNome : x.tomadorNome;
    const linhaEsp = x => `<tr class="click" data-abrir="${esc(x._id)}" tabindex="0"><td class="m-full"><div class="cell">${avatar(outro(x), '', lado(x, ctx) === 'tomador' ? x.prestadorId : x.tomadorId)}<div style="min-width:0"><strong>${esc(periodoTxt(x.periodo))}</strong><small>${esc(outro(x))} · ${lado(x, ctx) === 'tomador' ? 'você paga' : 'você emite a nota'}</small></div></div></td>
      <td class="r"><b>${esc(brl(x.valorCentavos))}</b><br><small class="hint">líquido ${esc(brl(x.liquidoCentavos))}</small></td><td>${pill(x.status)}</td></tr>`;
    const tab = (xs, id) => `<div class="scroll"><table class="resp" id="${id}"><thead><tr><th>Período</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${xs.map(linhaEsp).join('')}</tbody></table></div>`;
    el.innerHTML = `
      ${preparar.length ? `<section class="card" id="es-preparar" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Espelhos para preparar</h3><span class="count">${preparar.length}</span></div>
        <div class="scroll"><table class="resp" id="es-tab-preparar"><thead><tr><th>Medição aprovada</th><th class="r">Valor</th><th></th></tr></thead><tbody>
        ${preparar.map(m => `<tr><td class="m-full"><div class="cell">${avatar(m.prestadorNome, '', m.prestadorId)}<div style="min-width:0"><strong>${esc(m.origem === 'os' ? 'OS ' + m.numero + ' · ' + m.titulo : periodoTxt(m.periodo))}</strong><small>${esc(m.prestadorNome)} · ${m.origem === 'os' ? 'entrega aceita' : 'aprovada'}${m.aprovacao && m.aprovacao.nome ? ' por ' + esc(m.aprovacao.nome) : ''}</small></div></div></td>
          <td class="r"><b>${esc(brl(m.valorCentavos))}</b></td><td class="r"><button class="btn sm" data-preparar="${esc(m._id)}">${ic('edit')}Preparar espelho</button></td></tr>`).join('')}
        </tbody></table></div></section>` : ''}
      ${conferir.length ? `<section class="card" id="es-conferir" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Notas para conferir</h3><span class="count">${conferir.length}</span></div>${tab(conferir, 'es-tab-conferir')}</section>` : ''}
      ${emitir.length ? `<section class="card" id="es-emitir" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Notas a emitir</h3><span class="count">${emitir.length}</span></div>
        <div class="card-b" style="padding-bottom:0"><div class="banner ok">${ic('check')}<span><strong>Serviço aprovado: confira os dados e envie sua nota fiscal</strong>Abra o espelho: o botão leva ao emissor da nota e, quando você voltar, o Conectwork pede o PDF da nota.</span></div></div>
        ${tab(emitir, 'es-tab-emitir')}</section>` : ''}
      <section class="card" id="es-lista"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Espelhos da nota</h3><span class="count">${todos.length}</span></div>
        ${todos.length ? tab(todos, 'es-tab') : `<div class="empty"><div class="ic">${ic('receipt')}</div><strong>Nenhum espelho ainda.</strong><span>Quando uma medição for aprovada, o financeiro de quem contrata prepara o espelho com os dados da nota.</span>${U().passos(['Contrato ativo entre as duas empresas', 'Medição ou entrega aprovada', 'O financeiro prepara o espelho e a prestadora emite a nota'])}</div>`}</section>`;
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
      const [a, b] = await Promise.all([db.doc('medicoes/' + id).get().catch(() => null), db.doc('espelhos/' + id).get()]);
      m = a ? CW.fb.dados(a) : null; e = CW.fb.dados(b);
      if (!m) { const o = CW.fb.dados(await db.doc('ordens/' + id).get().catch(() => null) || { exists: false, data: () => null }); if (o) { m = deOs(o, id); if (e) m.periodo = e.periodo; } }
      if (!m) return fim('danger', 'Medição ou ordem de serviço não encontrada', 'Ela pode ter sido aberta por um link antigo.');
      if (m.tomadorId !== ctx.contexto.empresaId) return fim('warn', 'Esta medição não é para a sua empresa pagar', 'Só quem contrata prepara o espelho.');
      if (!e && m.status !== 'aprovada') return fim('warn', m.origem === 'os' ? 'A entrega ainda não foi aceita' : 'A medição ainda não foi aprovada', m.origem === 'os' ? 'O espelho só é preparado depois que quem contrata aceita a entrega da OS.' : 'O espelho só é preparado depois que o aprovador técnico aprova a medição.');
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
        <section class="card"><div class="card-h"><span class="ic">${ic('users')}</span><h3>${m.origem === 'os' ? 'Ordem de serviço' : 'Memória da medição'}</h3><span class="count">${(m.memoria || []).length}</span></div>
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
          periodo: m.periodo, competencia: competencia(m.periodo), descricao: desc, origem: m.origem === 'os' ? 'os' : 'medicao', osNumero: m.origem === 'os' ? m.numero : null, valorCentavos: m.valorCentavos, retencoes: ret, liquidoCentavos: liq,
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
    if (l === 'prestador' && x.status === 'aguardando_nota') await resolverEmissor(ctx);
    document.getElementById('titulo').textContent = 'Espelho · ' + periodoTxt(x.periodo);
    document.getElementById('acoes').innerHTML = '';
    const cp = (rot, v, chave, cheio) => `<div class="${cheio ? 'full' : ''}"><dt>${rot}</dt><dd class="es-cp"><span>${esc(v || '—')}</span>${v ? `<button class="iconbtn sm" data-copiar="${esc(chave)}" aria-label="Copiar ${esc(rot)}" title="Copiar">${ic('copy')}</button>` : ''}</dd></div>`;
    const copias = { razao: t.razao, cnpj: U().dig(t.cnpj), im: t.im, end: [t.endereco, t.cidade && t.cidade + '/' + t.uf].filter(Boolean).join(' · '), desc: x.descricao, valor: formatarDinheiro(x.valorCentavos, false) };
    RET.forEach(([k]) => { copias['r_' + k] = formatarDinheiro((x.retencoes || {})[k] || 0, false); });
    const temRet = somaRet(x.retencoes) > 0;
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="es-voltar">${ic('back')}Voltar para os espelhos</button></div>
      ${avisos(x, ctx)}
      ${l === 'prestador' && x.status === 'aguardando_nota' && podeEnviar(ctx) ? '<div id="es-assist"></div>' : ''}
      <div class="grid-main"><div class="stack">
        <section class="card" id="es-tom"><div class="card-h"><span class="ic">${ic('building')}</span><h3>Tomador do serviço</h3><span style="margin-left:auto">${pill(x.status)}</span></div><div class="card-b"><dl class="dl">
          ${cp('Razão social', t.razao, 'razao', 1)}${cp('CNPJ', t.cnpj, 'cnpj')}${cp('Inscrição municipal', t.im, 'im')}${cp('Endereço', copias.end, 'end', 1)}</dl></div></section>
        <section class="card" id="es-nota"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Dados da nota</h3></div><div class="card-b"><dl class="dl">
          <div><dt>Prestadora</dt><dd>${esc(x.prestadorNome)}${x.prestadorCnpj ? '<br><span class="hint">' + esc(x.prestadorCnpj) + '</span>' : ''}</dd></div>
          <div><dt>Competência</dt><dd>${esc(compTxt(x.competencia))}</dd></div>
          ${cp('Descrição do serviço', x.descricao, 'desc', 1)}
          ${cp('Valor do serviço', brl(x.valorCentavos), 'valor')}<div><dt>Período da medição</dt><dd>${esc(periodoTxt(x.periodo))}</dd></div>
          ${x.obs ? `<div class="full"><dt>Observação</dt><dd>${esc(x.obs)}</dd></div>` : ''}</dl></div></section>
        ${x.nota ? cartaoNota(x, ctx) : ''}
        ${zapEsp(x, ctx)}
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
          <ul class="tl"><li class="done"><span class="dot">${ic('check')}</span>${x.origem === 'os' ? 'Entrega aceita (OS ' + esc(x.osNumero) + ')' : 'Medição aprovada'}<small><a href="#${x.origem === 'os' ? 'ordens' : 'medicoes'}/ver/${esc(x.medicaoId)}" class="linkbtn" style="font-size:12px">${x.origem === 'os' ? 'ver a OS' : 'ver a medição'}</a></small></li>
            <li class="done"><span class="dot">${ic('check')}</span>Espelho preparado${x.versao > 1 ? ` (versão ${x.versao})` : ''}<small>${esc(formatarDataHora(x.criadoEm))} · ${esc(x.criadoPorNome || '')}${x.versao > 1 ? ` · corrigido ${esc(formatarDataHora(x.atualizadoEm))} por ${esc(x.atualizadoPorNome || '')}` : ''}</small></li>
            <li class="${x.nota ? 'done' : x.status === 'aguardando_nota' ? 'now' : ''}"><span class="dot">${x.nota ? ic('check') : ''}</span>Nota fiscal enviada pela prestadora<small>${x.nota ? esc(formatarDataHora(x.nota.enviadoEm) + ' · ' + (x.nota.enviadoPorNome || '')) : x.emissao ? 'emissor aberto ' + esc(formatarDataHora(x.emissao.em)) : 'esperando'}</small></li>
            <li class="${x.status === 'nota_ok' ? 'done' : x.status === 'nota_enviada' ? 'now' : ''}"><span class="dot">${x.status === 'nota_ok' ? ic('check') : ''}</span>Conferência: contrato + medição + nota<small>${x.conferenciaNota ? esc(formatarDataHora(x.conferenciaNota.em) + ' · ' + x.conferenciaNota.nome) : ''}</small></li></ul>
          ${l === 'tomador' && x.status === 'aguardando_nota' && pode(ctx) ? `<div><button class="btn sec" id="es-corrigir">${ic('edit')}Corrigir o espelho</button></div>` : ''}
        </div></section></div></div>`;
    document.getElementById('es-voltar').onclick = () => CW.ir('espelhos');
    el.querySelectorAll('[data-copiar]').forEach(b => b.onclick = () => copiar(copias[b.dataset.copiar] || ''));
    const co = document.getElementById('es-corrigir'); if (co) co.onclick = () => CW.ir('espelhos/preparar/' + x._id);
    ultimoCtx = ctx; ligarNota(el, ctx, x); if (CW.avisar) CW.avisar.ligar(el);
    if (CW.assistente && document.getElementById('es-assist')) CW.assistente.bloco(document.getElementById('es-assist'), ctx, x);
  }

  /* ---------- nota fiscal: emitir fora, voltar e anexar (PDF ou XML), conferir ---------- */
  function avisos(x, ctx) {
    const { esc, ic, formatarDataHora } = U(), l = lado(x, ctx), rec = (x.recusadas || [])[(x.recusadas || []).length - 1];
    const recTxt = rec ? `<div class="banner danger" id="es-recusa">${ic('alert')}<span><strong>${l === 'prestador' ? 'A ' + esc(x.tomadorNome) + ' recusou a nota' : 'Nota recusada'}${rec.numero ? ' nº ' + esc(rec.numero) : ''}</strong>${esc(rec.motivo)}${l === 'prestador' && x.status === 'aguardando_nota' ? ' · Cancele essa nota no emissor, emita outra e anexe aqui.' : ''}</span></div>` : '';
    if (l === 'prestador' && x.status === 'aguardando_nota') {
      const E = emissorCache || { origem: 'padrao', nome: 'Emissor Nacional' }, onde = E.cidade ? E.cidade + '/' + E.uf : '';
      const porque = E.origem === 'empresa' ? 'Site definido pela sua empresa.' : E.origem === 'cidade' ? `Site da prefeitura de ${onde}, escolhido pela cidade da sua empresa.` : `Emissor Nacional (gov.br)${onde ? ', o padrão para ' + onde : ''}.`;
      return recTxt + `<div class="banner ok" id="es-aviso">${ic('check')}<span><strong>Serviço aprovado: confira os dados e envie sua nota fiscal</strong>1. Toque em "Emitir a nota" e preencha com os dados abaixo (use os botões de copiar). 2. Volte para o Conectwork e anexe o PDF da nota (ou o XML).</span></div>
        ${podeEnviar(ctx) ? `<section class="card" id="es-passos" style="margin:14px 0 22px"><div class="card-b stack" style="gap:12px">
          ${x.emissao ? `<p style="margin:0;font-size:13.5px" id="es-voltou">${ic('clock')} Emissor aberto ${esc(formatarDataHora(x.emissao.em))} por ${esc(x.emissao.nome)}. <b>Já emitiu? Anexe a nota.</b></p>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ${x.emissao ? 'sec' : ''}" id="es-emitir-bt">${ic('send')}Emitir a nota ${E.origem === 'padrao' ? 'no Emissor Nacional' : 'no site da prefeitura'}</button>
            <button class="btn ${x.emissao ? '' : 'sec'}" id="es-anexar">${ic('upload')}Anexar a nota (PDF ou XML)</button></div>
          <p class="hint" style="margin:0;font-size:12.5px" id="es-site">${esc(porque)} <button class="linkbtn" id="es-outro-site" style="font-size:12.5px;display:inline">Não é esse o site?</button></p></div></section>` : ''}`;
    }
    if (l === 'tomador' && x.status === 'aguardando_nota') return recTxt + `<div class="banner info" id="es-aviso">${ic('clock')}<span><strong>Esperando a nota da ${esc(x.prestadorNome)}</strong>${x.emissao ? 'A prestadora abriu o emissor em ' + esc(formatarDataHora(x.emissao.em)) + '. ' : 'A prestadora já vê o espelho. '}A nota é conferida com o contrato, a medição e este espelho.</span></div>`;
    if (x.status === 'nota_enviada') return `<div class="banner ${l === 'tomador' ? 'warn' : 'info'}" id="es-aviso">${ic(l === 'tomador' ? 'alert' : 'clock')}<span><strong>${l === 'tomador' ? 'Nota chegou: confira' : 'Nota enviada'}</strong>${l === 'tomador' ? 'Veja a conferência abaixo, abra o arquivo se precisar e marque "Nota conferida" ou recuse com o motivo.' : 'A ' + esc(x.tomadorNome) + ' confere a nota com o contrato, a medição e o espelho.'}</span></div>`;
    if (x.status === 'nota_ok') return `<div class="banner ok" id="es-aviso">${ic('check')}<span><strong>Nota conferida</strong>Contrato, medição e nota batem. O título foi para Pagar e receber. <a href="#titulos/ver/${esc(x._id)}" class="linkbtn" id="es-titulo">Ver o título</a></span></div>`;
    return '';
  }

  function zapEsp(x, ctx) {
    const A = CW.avisar, l = lado(x, ctx); if (!A || ctx.soLeitura) return '';
    const fr = `${periodoTxt(x.periodo)} (${brl(x.valorCentavos)})`, rota = 'espelhos/ver/' + x._id;
    const b = l === 'tomador' && x.status === 'aguardando_nota' && pode(ctx) ? A.botao(ctx, { frase: (x.recusadas || []).length ? `recusamos a nota de ${fr}; o motivo está no Conectwork. Pode enviar outra?` : `o espelho da nota de ${fr} está pronto. Emita a nota e anexe no Conectwork.`, rota, contratoId: x.contratoId, para: 'prestador' })
      : l === 'prestador' && x.status === 'nota_enviada' && podeEnviar(ctx) ? A.botao(ctx, { frase: `enviamos a nota fiscal de ${fr}. Falta a conferência de vocês.`, rota }) : '';
    return b ? `<div id="es-zap">${b}</div>` : '';
  }

  function cartaoNota(x, ctx) {
    const { esc, ic, formatarDataHora } = U(), n = x.nota, cf = n.conferencia || {}, N = CW.nfse;
    const itens = (cf.itens || []).map(i => `<li class="${i.ok ? 'ok' : 'no'}">${ic(i.ok ? 'check' : 'alert')}<span>${esc(i.txt)}</span></li>`).join('');
    const pr = N ? N.fmtCnpj(x.prestadorCnpj) : x.prestadorCnpj;
    const tripla = `<ul class="es-cf" id="es-tripla"><li class="ok">${ic('check')}<span>Contrato ativo com ${esc(x.prestadorNome)} (${esc(pr)})</span></li><li class="ok">${ic('check')}<span>Medição aprovada: ${esc(brl(x.valorCentavos))}</span></li>
      <li class="${cf.ok ? 'ok' : 'no'}">${ic(cf.ok ? 'check' : 'alert')}<span>${cf.ok ? 'A nota bate com o espelho' : cf.manual ? 'Nota para conferir à mão' : 'A nota tem diferenças'}</span></li></ul>`;
    const botoes = lado(x, ctx) === 'tomador' && x.status === 'nota_enviada' && pode(ctx)
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ok" id="es-nf-ok">${ic('check')}Nota conferida</button><button class="btn dangerous" id="es-nf-recusar">${ic('x')}Recusar a nota</button></div>` : '';
    return `<section class="card" id="es-nf"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Nota fiscal${n.numero ? ' nº ' + esc(n.numero) : ''}</h3><span style="margin-left:auto">${pill(x.status)}</span></div><div class="card-b stack" style="gap:14px">
      ${tripla}
      <dl class="dl"><div><dt>Arquivo</dt><dd>${esc(n.nomeArquivo)} · ${esc(n.tipo.toUpperCase())} · ${esc(tamTxt(n.tam || 0))}</dd></div><div><dt>Enviada</dt><dd>${esc(formatarDataHora(n.enviadoEm))} · ${esc(n.enviadoPorNome || '')}</dd></div>
        ${n.chave ? `<div class="full"><dt>Chave de acesso</dt><dd style="font-size:12.5px">${esc(n.chave)}</dd></div>` : ''}${n.emissao ? `<div><dt>Emitida em</dt><dd>${esc(U().formatarData(n.emissao))}</dd></div>` : ''}</dl>
      ${itens ? `<div><p style="margin:0 0 6px;font-size:13px;font-weight:500">O que o Conectwork conferiu</p><ul class="es-cf" id="es-cf">${itens}</ul></div>` : ''}
      ${cf.manual && lado(x, ctx) === 'tomador' ? `<p class="hint" style="margin:0;font-size:12.5px;color:var(--warn)">Não deu para conferir tudo pelo arquivo: abra a nota e confira o CNPJ de quem emitiu, o CNPJ da sua empresa, o valor e a competência.</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" id="es-nf-baixar">${ic('file')}Abrir o arquivo da nota</button></div>
      ${botoes}</div></section>`;
  }

  function ligarNota(el, ctx, x) {
    const $ = id => document.getElementById(id), db = CW.fb.db(), ref = db.doc('espelhos/' + x._id), agora = CW.fb.agora;
    const grava = async (fn, msg) => { const b = db.batch(); fn(b); try { await b.commit(); if (msg) U().toast(msg); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); } desenharVer(el, ctx, x._id); };
    const em = $('es-emitir-bt');
    if (em) em.onclick = () => {
      const url = emissorDe(ctx);
      try { window.open(url, '_blank', 'noopener'); } catch (e) {}
      try { sessionStorage.setItem('cw.emissao', JSON.stringify({ id: x._id, em: Date.now() })); } catch (e) {}
      const b = db.batch(); b.update(ref, { emissao: { uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: agora() }, atualizadoEm: agora() });
      log(b, ctx, 'espelho.emissao', `Emissor da nota aberto para o espelho de ${periodoTxt(x.periodo)} (${x.tomadorNome}).`, x._id);
      b.commit().then(() => desenharVer(el, ctx, x._id)).catch(() => {});
    };
    const os = $('es-outro-site');
    if (os) os.onclick = async () => {
      const E = emissorCache || {}, admin = cargo(ctx) === 'admin' && !ctx.soLeitura;
      if (!admin) { await U().dialogo({ titulo: 'Site para emitir a nota', corpo: `<p style="margin:0">Quem muda o site é o administrador da sua empresa: no espelho, em "Não é esse o site?". Se a sua cidade ainda não usa o Emissor Nacional, ele informa o site da prefeitura e vale para todos da empresa.</p>` }); return; }
      let res = null;
      await U().dialogo({ titulo: 'Site para emitir a nota', sub: `Vale para todos da sua empresa.${E.cidade ? ' Cidade do cadastro: ' + E.cidade + '/' + E.uf + '.' : ''}`,
        corpo: `<p style="margin:0 0 12px;font-size:13.5px">Hoje: <b>${U().esc(E.nome || 'Emissor Nacional')}</b>. Se a sua cidade ainda emite a nota no site da prefeitura, informe o endereço.</p>
          <label class="f"><span>Endereço do site da prefeitura</span><input id="eo-url" type="url" inputmode="url" placeholder="https://..." maxlength="300" value="${E.origem === 'empresa' ? U().esc(E.url) : ''}"></label><p class="err" id="eo-erro"></p>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }].concat(E.origem === 'empresa' ? [{ texto: 'Voltar ao automático', valor: 'auto', classe: 'sec', antes: () => { res = { auto: true }; return true; } }] : [])
          .concat([{ texto: 'Guardar', valor: 'ok', antes: d => { const v = d.querySelector('#eo-url').value.trim(); if (!/^https:\/\/[^\s.]+\.[^\s]+$/i.test(v)) { d.querySelector('#eo-erro').textContent = 'Informe o endereço completo, começando com https://'; return false; } res = { url: v }; return true; } }]) });
      if (!res) return;
      const b = db.batch();
      b.update(db.doc('empresas/' + ctx.contexto.empresaId + '/privado/cadastro'), { emissor: res.auto ? null : { url: res.url, nome: 'site da prefeitura', por: quem(ctx), em: agora() } });
      log(b, ctx, 'empresa.emissor', res.auto ? 'Site para emitir a nota voltou ao automático (pela cidade).' : 'Site para emitir a nota definido: ' + res.url, '');
      try { await b.commit(); emissorCache = null; U().toast(res.auto ? 'Voltou ao automático.' : 'Site guardado para toda a empresa.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
      desenharVer(el, ctx, x._id);
    };
    const an = $('es-anexar'); if (an) an.onclick = () => anexar(el, ctx, x, false);
    const bx = $('es-nf-baixar'); if (bx) bx.onclick = () => abrirArquivo(x);
    const ok = $('es-nf-ok');
    if (ok) ok.onclick = async () => {
      const manual = !((x.nota.conferencia || {}).ok);
      let sim = false;
      await U().dialogo({ titulo: 'Nota conferida?', sub: `Nota${x.nota.numero ? ' nº ' + x.nota.numero : ''} da ${x.prestadorNome} · ${brl(x.valorCentavos)}`,
        corpo: `<p style="margin:0 0 12px">Você confere que a nota bate com o contrato, a medição aprovada e o espelho. Depois disso, ela vira um título em Pagar e receber, com o vencimento do contrato.</p>
          ${manual ? `<label class="check"><input type="checkbox" id="nc-chk"> <span>Abri o arquivo e conferi: CNPJ de quem emitiu, CNPJ da minha empresa, valor e competência.</span></label><p class="err" id="nc-erro"></p>` : ''}`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Nota conferida', valor: 'ok', classe: 'ok', antes: d => { const c = d.querySelector('#nc-chk'); if (c && !c.checked) { d.querySelector('#nc-erro').textContent = 'Marque que conferiu o arquivo.'; return false; } sim = true; return true; } }] });
      if (!sim) return;
      grava(b => { b.update(ref, { status: 'nota_ok', conferenciaNota: { uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: agora(), manual }, atualizadoEm: agora() });
        if (CW.titulos) CW.titulos.criarNoLote(b, ctx, x);
        log(b, ctx, 'nota.conferir', `Nota${x.nota.numero ? ' nº ' + x.nota.numero : ''} de ${x.prestadorNome} (${periodoTxt(x.periodo)}) conferida${manual ? ' à mão' : ''}: ${brl(x.valorCentavos)}.`, x._id); }, 'Nota conferida.');
    };
    const rc = $('es-nf-recusar');
    if (rc) rc.onclick = async () => {
      let mot = null;
      await U().dialogo({ titulo: 'Recusar a nota', sub: `A ${x.prestadorNome} vê o motivo, cancela essa nota no emissor e envia outra.`,
        corpo: `<label class="f"><span>Por que a nota não pode ser aceita?</span><textarea id="rn-mot" rows="4" maxlength="500" placeholder="Ex.: A nota saiu com a competência de setembro; o certo é outubro."></textarea></label><p class="err" id="rn-erro"></p>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Recusar a nota', valor: 'ok', classe: 'dangerous', antes: d => { const t = d.querySelector('#rn-mot').value.trim(); if (t.length < 10) { d.querySelector('#rn-erro').textContent = 'Explique o motivo (pelo menos 10 letras).'; return false; } mot = t; return true; } }] });
      if (!mot) return;
      const n = x.nota, item = { numero: n.numero || '', chaveUnica: n.chaveUnica, nomeArquivo: n.nomeArquivo, envio: n.envio, partes: n.partes, tipo: n.tipo, enviadoPorNome: n.enviadoPorNome || '', motivo: mot, uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: new Date().toISOString() };
      grava(b => { b.update(ref, { status: 'aguardando_nota', nota: null, emissao: null, recusadas: (x.recusadas || []).concat([item]), atualizadoEm: agora() });
        log(b, ctx, 'nota.recusar', `Nota${n.numero ? ' nº ' + n.numero : ''} de ${x.prestadorNome} (${periodoTxt(x.periodo)}) recusada: ${mot}`, x._id); }, 'Nota recusada. A prestadora vê o motivo.');
    };
  }

  /* abre o arquivo da nota (junta os pedaços guardados no banco) */
  async function abrirArquivo(x) {
    const n = x.nota; if (!n) return;
    try {
      const db = CW.fb.db(), ps = await Promise.all(Array.from({ length: n.partes }, (_, k) => db.doc(`espelhos/${x._id}/arquivos/${n.envio}-${k}`).get()));
      const b64 = ps.map(p => (CW.fb.dados(p) || {}).d || '').join(''), bin = atob(b64), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u8], { type: n.tipo === 'pdf' ? 'application/pdf' : 'application/xml' }));
      const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; if (n.tipo !== 'pdf') a.download = n.nomeArquivo || 'nota.xml';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { U().toast('Não foi possível abrir o arquivo: ' + CW.fb.mensagemErro(e), 'erro'); }
  }

  const lerComo = (f, modo) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => erro(r.error); r[modo](f); });

  /* janela para anexar: lê o arquivo, mostra a conferência e envia */
  async function anexar(el, ctx, x, voltou) {
    const { esc, ic } = U(), N = CW.nfse;
    let st = null, enviar = null;
    const desenhaRes = d => {
      const box = d.querySelector('#an-res'), num = d.querySelector('#an-num-l'), bt = d.querySelector('[data-dlg-b="1"]');
      if (!st) { box.innerHTML = ''; num.hidden = true; return; }
      if (st.lendo) { box.innerHTML = `<div class="empty" style="padding:14px"><div class="giro"></div><span>Lendo a nota…</span></div>`; return; }
      const c = st.conf, bloqueia = st.bloqueia;
      box.innerHTML = `<p style="margin:0 0 6px;font-size:13px;font-weight:500">${esc(st.nome)} · ${esc(tamTxt(st.tam))}</p>
        <ul class="es-cf" id="an-cf">${c.itens.map(i => `<li class="${i.ok ? 'ok' : 'no'}">${ic(i.ok ? 'check' : 'alert')}<span>${esc(i.txt)}</span></li>`).join('')}</ul>
        ${bloqueia ? `<div class="banner danger" style="margin-top:10px" id="an-bloq">${ic('alert')}<span><strong>Essa nota não bate com o espelho</strong>Cancele a nota no emissor, emita outra com os dados do espelho e anexe a nova.</span></div>`
          : c.ok ? `<p class="hint" style="margin:8px 0 0;color:var(--ok)" id="an-okmsg">Tudo certo. Toque em "Enviar a nota".</p>`
          : `<p class="hint" style="margin:8px 0 0;color:var(--warn)" id="an-manual">Nem tudo pôde ser conferido pelo arquivo. Dá para enviar: a ${esc(x.tomadorNome)} confere à mão e pode recusar.</p>`}`;
      num.hidden = bloqueia || !!c.chaveUnica;
      if (bt) bt.disabled = !!bloqueia;
    };
    const ler = async (f, d) => {
      if (f.size > MAX_ARQ) { st = null; desenhaRes(d); d.querySelector('#an-erro').textContent = 'O arquivo passa de 3 MB. Baixe o PDF da nota de novo no emissor (o PDF da nota costuma ter menos de 200 KB).'; return; }
      const xml = /\.xml$/i.test(f.name) || /xml/.test(f.type), pdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      if (!xml && !pdf) { st = null; desenhaRes(d); d.querySelector('#an-erro').textContent = 'Escolha o PDF ou o XML da nota.'; return; }
      st = { lendo: true }; desenhaRes(d);
      let r = null, aviso = '';
      try {
        if (xml) r = N.lerXml(await lerComo(f, 'readAsText'));
        else r = N.lerTextoPdf(await N.textoPdf(await lerComo(f, 'readAsArrayBuffer')));
      } catch (e) { r = null; aviso = e && e.message; }
      const conf = N.conferir(x, r);
      if (aviso && conf.manual) conf.itens[0].txt = aviso + ' A empresa que contrata confere à mão.';
      const b64 = String(await lerComo(f, 'readAsDataURL')).replace(/^data:[^,]*,/, '');
      st = { nome: f.name.slice(0, 120), tam: f.size, tipo: xml ? 'xml' : 'pdf', r, conf, b64, bloqueia: xml && !!r && !conf.ok };
      desenhaRes(d);
    };
    await U().dialogo({ titulo: 'Anexar a nota fiscal', sub: voltou ? 'Voltou do emissor? Se a nota já saiu, anexe o PDF (ou o XML) dela.' : `Espelho de ${periodoTxt(x.periodo)} · ${brl(x.valorCentavos)}`,
      corpo: `<div class="stack" style="gap:12px">
        <label class="up" style="cursor:pointer"><input type="file" id="an-arq" accept=".pdf,.xml,application/pdf,application/xml,text/xml" style="position:absolute;opacity:0;width:1px;height:1px">
          <span class="ic">${ic('upload')}</span><span class="t"><strong>Escolher o PDF ou o XML da nota</strong><small>No Emissor Nacional: Notas emitidas › baixar PDF ou XML.</small></span></label>
        <div id="an-res"></div>
        <label class="f" id="an-num-l" hidden><span>Número da nota</span><input id="an-num" inputmode="numeric" maxlength="15" placeholder="Ex.: 123"><em class="hint">Não achamos a chave de acesso no arquivo: o número evita que a mesma nota seja usada duas vezes.</em></label>
        <p class="err" id="an-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Agora não', valor: null, classe: 'sec' }, { texto: 'Enviar a nota', valor: 'ok', icone: 'send', antes: d => {
        const er = d.querySelector('#an-erro');
        if (!st || st.lendo) { er.textContent = st ? 'Espere terminar de ler a nota.' : 'Escolha o arquivo da nota.'; return false; }
        if (st.bloqueia) return false;
        let chave = st.conf.chaveUnica, numero = (st.r && st.r.numero) || '';
        if (!chave) { const nn = U().dig(d.querySelector('#an-num').value).replace(/^0+(?=\d)/, ''); if (!nn) { er.textContent = 'Informe o número da nota.'; d.querySelector('#an-num').focus(); return false; } numero = nn; chave = U().dig(x.prestadorCnpj) + '_' + nn; }
        enviar = Object.assign({}, st, { chave, numero }); return true; } }],
      aoAbrir: d => { const inp = d.querySelector('#an-arq'); inp.onchange = () => { d.querySelector('#an-erro').textContent = ''; if (inp.files[0]) ler(inp.files[0], d); }; }
    });
    if (!enviar) return;
    const db = CW.fb.db(), agora = CW.fb.agora, e = enviar, r = e.r || {};
    try {
      const ja = await db.doc('notaschave/' + e.chave).get();
      if (ja.exists) { U().toast('Esta nota já foi enviada no Conectwork. Cada nota vale para um espelho só.', 'erro'); return; }
    } catch (err) { /* a gravação confere de novo */ }
    const envio = Math.random().toString(36).slice(2, 10), partes = Math.max(1, Math.ceil(e.b64.length / PEDACO)), b = db.batch();
    for (let k = 0; k < partes; k++) b.set(db.doc(`espelhos/${x._id}/arquivos/${envio}-${k}`), { d: e.b64.slice(k * PEDACO, (k + 1) * PEDACO), k, envio, em: agora() });
    b.set(db.doc('notaschave/' + e.chave), { espelhoId: x._id, prestadorId: x.prestadorId, tomadorId: x.tomadorId, em: agora() });
    const nota = { tipo: e.tipo, nomeArquivo: e.nome, tam: e.tam, envio, partes, chaveUnica: e.chave, chave: r.chave || '', numero: e.numero || '',
      emitenteCnpj: r.emitenteCnpj || '', valorCentavos: r.valorCentavos == null ? null : r.valorCentavos, competencia: r.competencia || '', emissao: r.emissao || '',
      conferencia: { ok: !!e.conf.ok, manual: !e.conf.ok, itens: e.conf.itens }, enviadoPor: ctx.sessao.usuario.uid, enviadoPorNome: quem(ctx), enviadoEm: agora() };
    b.update(db.doc('espelhos/' + x._id), { status: 'nota_enviada', nota, atualizadoEm: agora() });
    log(b, ctx, 'nota.enviar', `Nota${nota.numero ? ' nº ' + nota.numero : ''} enviada para ${x.tomadorNome} (${periodoTxt(x.periodo)}, ${brl(x.valorCentavos)})${nota.conferencia.ok ? '' : ' para conferência à mão'}.`, x._id);
    try { await b.commit(); try { sessionStorage.removeItem('cw.emissao'); } catch (er) {} U().toast('Nota enviada. Agora a ' + x.tomadorNome + ' confere.'); }
    catch (err) { U().toast(/permission/i.test(String(err && (err.code || err.message))) ? 'Não foi possível enviar: a nota pode já ter sido usada em outro espelho, ou o espelho mudou. Atualize a tela.' : CW.fb.mensagemErro(err), 'erro'); }
    desenharVer(el, ctx, x._id);
  }

  /* ao voltar do emissor (aba ou app de novo na frente), pede a nota */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !ultimoCtx) return;
    let v = null; try { v = JSON.parse(sessionStorage.getItem('cw.emissao') || 'null'); } catch (e) {}
    if (!v || Date.now() - v.em < 2000 || location.hash !== '#espelhos/ver/' + v.id) return;
    if (document.querySelector('dialog[open]')) return;
    try { sessionStorage.removeItem('cw.emissao'); } catch (e) {}
    CW.fb.db().doc('espelhos/' + v.id).get().then(s => { const x = CW.fb.dados(s); if (x && x.status === 'aguardando_nota') { x._id = v.id; anexar(document.getElementById('view'), Object.assign({}, ultimoCtx, { sessao: CW.sessao.estado() }), x, true); } }).catch(() => {});
  });

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
      espT = []; espP = []; medsAprov = []; osAprov = []; pronto = false; emissorCache = null;
      const db = CW.fb.db(), emp = ctx.contexto.empresaId, ok = { t: false, p: false, m: false };
      const redesenha = () => {
        if (!(ok.t && ok.p && ok.m)) return; pronto = true;
        const el = document.getElementById('view'), at = CW.app.atual();
        if (el && at && at.modulo === 'espelhos' && at.tela === 'lista') desenharLista(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() }));
        CW.app.pendenciasMudaram();
      };
      CW.inscrever('espelhos-t', () => db.collection('espelhos').where('tomadorId', '==', emp), s => { espT = CW.fb.lista(s); ok.t = true; redesenha(); });
      CW.inscrever('espelhos-p', () => db.collection('espelhos').where('prestadorId', '==', emp), s => { espP = CW.fb.lista(s); ok.p = true; redesenha(); });
      if (pode(ctx)) CW.inscrever('espelhos-os', () => db.collection('ordens').where('tomadorId', '==', emp), s => { osAprov = CW.fb.lista(s).filter(o => ['aceita_total', 'aceita_parcial'].includes(o.status)).map(o => deOs(o)); redesenha(); }, () => {});
      if (pode(ctx)) CW.inscrever('espelhos-m', () => db.collection('medicoes').where('tomadorId', '==', emp), s => { medsAprov = CW.fb.lista(s).filter(m => m.status === 'aprovada'); ok.m = true; redesenha(); });
      else ok.m = true;
      return () => { pronto = false; };
    },
    /* busca do topo: só o que esta tela já carregou (número da nota, empresa, período, valor) */
    buscar(ctx) {
      const vistos = {};
      return espT.concat(espP).filter(x => !vistos[x._id] && (vistos[x._id] = 1)).map(x => { const l = lado(x, ctx), n = x.nota && x.nota.numero;
        return { t: n ? `Nota ${n}` : `Espelho de ${periodoTxt(x.periodo)}`, s: `${l === 'tomador' ? x.prestadorNome : x.tomadorNome} · ${periodoTxt(x.periodo)} · ${(ST[x.status] || [, ''])[1]} · ${brl(x.valorCentavos || 0)}`,
          rota: 'espelhos/ver/' + x._id, txt: [x.tomadorNome, x.prestadorNome, n ? 'nota ' + n : 'espelho', x.periodo, brl(x.valorCentavos || 0)].join(' ') }; });
    },
    pendencias(ctx) {
      if (!pronto) return [];
      const comEsp = new Set(espT.map(x => x._id)), out = [];
      if (pode(ctx)) medsAprov.concat(osAprov).filter(m => !comEsp.has(m._id)).forEach(m => out.push({ txt: 'Preparar o espelho da nota', sub: `${m.prestadorNome} · ${periodoTxt(m.periodo)} · ${brl(m.valorCentavos)}`, rota: 'espelhos/preparar/' + m._id }));
      if (podeEnviar(ctx)) espP.filter(x => x.status === 'aguardando_nota').forEach(x => out.push({ txt: (x.recusadas || []).length ? 'Enviar outra nota (a anterior foi recusada)' : 'Emitir e enviar a nota fiscal', sub: `${x.tomadorNome} · ${periodoTxt(x.periodo)} · ${brl(x.valorCentavos)}`, rota: 'espelhos/ver/' + x._id }));
      if (pode(ctx)) espT.filter(x => x.status === 'nota_enviada').forEach(x => out.push({ txt: 'Conferir a nota fiscal', sub: `${x.prestadorNome} · ${periodoTxt(x.periodo)} · ${brl(x.valorCentavos)}`, rota: 'espelhos/ver/' + x._id }));
      return out;
    },
    telas: {
      lista: { nome: 'Espelhos da nota', sub: 'Dados da nota fiscal de cada medição aprovada: quem contrata prepara, a prestadora emite.', render: (el, ctx) => desenharLista(el, ctx) },
      preparar: { nome: 'Preparar espelho', sub: 'Confira os dados, informe as retenções e envie para a prestadora emitir a nota.', render: (el, ctx) => desenharPreparar(el, ctx, ctx.params[0]) },
      ver: { nome: 'Espelho da nota', sub: 'Os dados para emitir a nota fiscal, as retenções e o líquido.', render: (el, ctx) => desenharVer(el, ctx, ctx.params[0]) }
    }
  });
  CW.espelhos = { blocoMedicao, sugestao, vencTxt };
})();
