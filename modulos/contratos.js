/* Conectwork · Etapa 2, parte 1: contratos da modalidade equipe contínua (tomador ↔ prestadora).
   Plano e decisões: docs/PLANO-COBRANCA-NOTAS.md.
   - O tomador (admin) cria o contrato com uma prestadora aprovada: objeto, periodicidade da medição (quinzena ou mês),
     vencimento (dias depois da nota válida; padrão 1), início e fim.
   - As duas empresas assinam (registro simples: quem e quando). A prestadora informa o interlocutor ao assinar.
     Com as duas assinaturas o contrato fica Ativo. Enquanto espera assinatura, o tomador pode corrigir (as assinaturas
     recomeçam) ou cancelar.
   - Vencimento nunca muda por um lado só: uma empresa propõe, a outra aceita ou recusa.
   - Encerramento do serviço: qualquer uma das duas, com motivo.
   - Cada ação grava no histórico da própria empresa. Quem pode mexer: o administrador de cada lado (as regras conferem). */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const PER = { quinzena: 'Por quinzena (1 a 15 e 16 ao fim do mês)', mes: 'Por mês' };
  const PER_CURTO = { quinzena: 'Quinzenal', mes: 'Mensal' };
  const ST = { assinatura: ['warn', 'Esperando assinatura'], ativo: ['ok', 'Ativo'], encerrado: ['info', 'Encerrado'], cancelado: ['danger', 'Cancelado'] };
  const AVISO = 'O Conectwork organiza a contratação e a gestão documental. A validade da relação depende da operação real, da legislação aplicável e da análise jurídica e contábil adequada.';

  let lista = null, porTomador = [], porPrestador = [];
  let titPagos = [], avFeitas = null;
  const pill = s => { const x = ST[s] || ['info', s]; return `<span class="pill ${x[0]}">${U().esc(x[1])}</span>`; };
  const venc = n => n === 0 ? 'No mesmo dia da nota válida' : `${n} dia${n === 1 ? '' : 's'} depois da nota válida`;
  const ladoDe = (c, ctx) => c.tomadorId === ctx.contexto.empresaId ? 'tomador' : 'prestador';
  const outro = l => l === 'tomador' ? 'prestador' : 'tomador';
  const admin = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo === 'admin' && !ctx.soLeitura;
  /* empresa que só presta serviço (ex.: profissional MEI) não contrata ninguém: recebe o contrato de quem contrata (10/11/2026) */
  const soPresta = ctx => ((ctx.contexto && ctx.contexto.empresa) || {}).tipo === 'prestador';
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const log = (b, ctx, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });
  const nomeOutro = (c, ctx) => ladoDe(c, ctx) === 'tomador' ? c.prestadorNome : c.tomadorNome;

  /* ---------- lista ---------- */
  function desenharLista(el, ctx) {
    const { esc, ic, avatar, formatarData } = U();
    if (!lista) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando os contratos…</span></div></div>`; return; }
    const pode = admin(ctx) && !soPresta(ctx);
    document.getElementById('acoes').innerHTML = pode ? `<button class="btn" id="ct-novo">${ic('plus')}Novo contrato</button>` : '';
    const linhas = lista.map(c => { const l = ladoDe(c, ctx), falta = c.status === 'assinatura' && !(c.assinaturas || {})[l];
      return `<tr class="click" data-abrir="${esc(c._id)}" tabindex="0"><td class="m-full"><div class="cell">${avatar(nomeOutro(c, ctx), '', l === 'tomador' ? c.prestadorId : c.tomadorId)}<div style="min-width:0"><strong>${esc(nomeOutro(c, ctx))}</strong><small>${esc(MODAL[c.modalidade] || 'Equipe contínua')} · ${esc(l === 'tomador' ? 'Você contrata' : 'Você presta o serviço')} · ${esc(c.objeto)}</small></div></div></td>
        <td class="m-hide">${esc(PER_CURTO[c.periodicidade] || '')}</td><td class="m-hide">${esc(venc(c.vencimentoDias))}</td><td class="m-hide">${esc(formatarData(c.inicio))}</td>
        <td>${pill(c.status)}${falta ? '<br><small class="hint" style="color:var(--warn)">falta a sua assinatura</small>' : c.proposta && c.proposta.lado !== l ? '<br><small class="hint" style="color:var(--warn)">proposta de vencimento</small>' : ''}</td></tr>`; }).join('');
    el.innerHTML = `<section class="card" id="ct-lista"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Contratos</h3><span class="count">${lista.length}</span></div>
      ${lista.length ? `<div class="scroll"><table class="resp"><thead><tr><th>Com quem</th><th>Medição</th><th>Vencimento</th><th>Início</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></div>`
        : `<div class="empty"><div class="ic">${ic('file')}</div><strong>Nenhum contrato ainda.</strong><span>${pode ? 'Use "Novo contrato" para contratar uma prestadora aprovada no Conectwork.' : (soPresta(ctx) ? 'Quem faz o contrato é a empresa que contrata você. Ele aparece aqui para você conferir e assinar.' : 'Quando a sua empresa tiver um contrato, ele aparece aqui.')}</span>${U().passos(['Escolha a prestadora aprovada no Conectwork', 'Responda a triagem (7 perguntas)', 'As duas empresas assinam e o contrato fica ativo'])}</div>`}</section>
      <p class="hint" style="margin:14px 0 0;font-size:12px">${esc(AVISO)}</p>`;
    const n = document.getElementById('ct-novo'); if (n) n.onclick = () => formulario(ctx, null);
    el.querySelectorAll('[data-abrir]').forEach(r => { const ir = () => CW.ir('contratos/ver/' + r.dataset.abrir); r.onclick = ir; r.onkeydown = e => { if (e.key === 'Enter') ir(); }; });
  }

  /* ---------- criar e corrigir ---------- */
  const MODAL = { continua: 'Equipe contínua', os: 'Serviço por entrega' };
  /* pre (12/11/2026, "os contratos foram feitos antes do Conectwork"): { cnpj, periodicidade, existente, voltar } — registra no
     Conectwork o contrato que já existe no papel. O caminho é o de sempre (triagem e as duas empresas confirmam); o formulário já
     vem com a prestadora, a medição e a caixinha "já assinado antes do Conectwork" (a data entra no objeto). */
  async function formulario(ctx, c, pre) {
    pre = pre || null;
    const { esc, ic } = U(), db = CW.fb.db(), eu = ctx.contexto.empresaId;
    let prestadoras = [];
    try { prestadoras = CW.fb.lista(await db.collection('empresas').where('status', '==', 'aprovado').get()).filter(e => e._id !== eu && ['prestador', 'ambos'].includes(e.tipo)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')); }
    catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); return; }
    let dados = null;
    const v = c || { modalidade: 'continua', prestadorId: '', objeto: '', periodicidade: 'quinzena', vencimentoDias: 1, inicio: '', fim: '' };
    if (pre && pre.cnpj) {
      const pr = prestadoras.find(e => U().dig(e.cnpj) === pre.cnpj);
      if (!pr) {
        const cnF = pre.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'), sou = !!(CW.sessao.estado() || {}).master && CW.cadastrosMaster;
        let nome = '';
        const r = await U().dialogo({ titulo: 'A prestadora ainda não está no Conectwork', corpo: sou
            ? `<div class="stack" style="gap:10px"><p style="margin:0">A empresa de CNPJ ${esc(cnF)} ainda não está no Conectwork. Como você é da equipe Conectwork, dá para pré-cadastrar agora e seguir com o contrato. Os dados e documentos dela ficam pendentes (ela completa depois).</p>
              <label class="f"><span>Nome da empresa</span><input id="ct-pcn" maxlength="120" value="${esc(pre.nome || '')}"></label><p class="err" id="ct-pce" role="alert"></p></div>`
            : `<p style="margin:0">A empresa de CNPJ ${esc(cnF)} ainda não está cadastrada e aprovada no Conectwork. Peça para a equipe Conectwork pré-cadastrar a empresa (Cadastros › Pré-cadastrar empresa) e depois registre o contrato.</p>`,
          botoes: sou ? [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Pré-cadastrar e seguir', valor: 'ok', antes: d => { nome = d.querySelector('#ct-pcn').value.trim().replace(/\s+/g, ' '); if (nome.length < 2) { d.querySelector('#ct-pce').textContent = 'Escreva o nome da empresa.'; return false; } return true; } }] : undefined });
        if (r !== 'ok') return;
        try { await CW.cadastrosMaster.preCadEmpresa({ cnpj: pre.cnpj, nome, tipo: 'prestador', como: 'pelo registro do contrato' }); }
        catch (e) { U().toast(e.message || CW.fb.mensagemErro(e), 'erro'); return; }
        U().toast(nome + ' pré-cadastrada no Conectwork. Agora registre o contrato.');
        return formulario(ctx, c, pre);
      }
      v.prestadorId = pr._id; if (pre.periodicidade) v.periodicidade = pre.periodicidade;
    }
    const exist = !c && !!(pre && pre.existente);
    await U().dialogo({ titulo: c ? 'Corrigir contrato' : 'Novo contrato', sub: c ? 'As assinaturas recomeçam: as duas empresas assinam de novo.' : 'A prestadora recebe o contrato para assinar. Com as duas assinaturas, ele fica ativo.',
      corpo: `<form class="fgrid" id="ct-form" novalidate>
        ${c ? '' : `<div class="c12"><p style="margin:0 0 8px;font-size:13px;font-weight:500">Tipo de contrato</p><div class="ct-mods">
          <label class="ct-mod"><input type="radio" name="ct-mod" value="continua" checked><span><b>Equipe contínua</b><small>Prestadora com equipe e supervisor próprios; paga por medição do período.</small></span></label>
          <label class="ct-mod"><input type="radio" name="ct-mod" value="os"><span><b>Serviço por entrega</b><small>Profissional PJ/MEI ou prestadora; cada trabalho é uma ordem de serviço com escopo, prazo e valor da entrega.</small></span></label></div></div>`}
        <label class="f c12"><span id="ct-prest-rot">Prestadora</span>${c ? `<input value="${esc(c.prestadorNome)} · ${esc(c.prestadorCnpj || '')}" disabled>` : `<select id="ct-prest"><option value="">Escolha a prestadora</option>${prestadoras.map(e => `<option value="${esc(e._id)}" ${v.prestadorId === e._id ? 'selected' : ''}>${esc(e.nome || e.razao)} · ${esc(e.cnpj || '')}</option>`).join('')}</select>
          <em class="hint">${prestadoras.length ? 'Só aparecem empresas aprovadas no Conectwork que prestam serviços.' : 'Nenhuma prestadora aprovada ainda. Ela precisa se cadastrar e ser aprovada pela equipe Conectwork.'}</em>`}</label>
        ${c ? '' : `<label class="check c12" id="ct-exist-l"><input type="checkbox" id="ct-exist" ${exist ? 'checked' : ''}><span>Este contrato já existe: foi assinado antes do Conectwork (no papel ou por outro sistema). Aqui ele só fica registrado para as medições e as notas.</span></label>
        <label class="f c6" id="ct-exist-dl" ${exist ? '' : 'hidden'}><span>Assinado em</span><input id="ct-exist-d" type="date"><em class="hint">A data em que as duas empresas assinaram o contrato.</em></label>`}
        <label class="f c12"><span>Objeto do contrato</span><textarea id="ct-obj" rows="3" maxlength="500" placeholder="Ex.: Equipe de manutenção industrial com supervisor próprio da prestadora.">${esc(v.objeto)}</textarea></label>
        <label class="f c6" id="ct-per-l" ${v.modalidade === 'os' ? 'hidden' : ''}><span>Medição</span><select id="ct-per">${Object.entries(PER).map(([k, n]) => `<option value="${k}" ${v.periodicidade === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="f c6"><span>Vencimento (dias depois da nota válida)</span><input id="ct-venc" type="number" inputmode="numeric" min="0" max="90" value="${esc(String(v.vencimentoDias))}"><em class="hint">Padrão: 1 dia. Depois de assinado, só muda com o aceite das duas empresas.</em></label>
        <label class="f c6"><span>Início</span><input id="ct-ini" type="date" value="${esc(v.inicio || '')}"></label>
        <label class="f c6"><span>Fim <i>(opcional)</i></span><input id="ct-fim" type="date" value="${esc(v.fim || '')}"><em class="hint">Em branco: sem data para terminar.</em></label>
        <p class="hint c12" style="margin:0;font-size:12px">${esc(AVISO)}</p>
        <p class="err c12" id="ct-erro" role="alert"></p></form>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: c ? 'Salvar correção' : 'Criar e mandar para assinar', valor: 'ok', antes: d => {
        const g = id => d.querySelector('#' + id), er = g('ct-erro');
        const mod = c ? (c.modalidade || 'continua') : ((d.querySelector('[name="ct-mod"]:checked') || {}).value || 'continua');
        const prest = c ? c.prestadorId : g('ct-prest').value, obj = g('ct-obj').value.trim().replace(/\s+/g, ' '), per = mod === 'os' ? '' : g('ct-per').value;
        const vd = Number(g('ct-venc').value), ini = g('ct-ini').value, fim = g('ct-fim').value;
        const ex = !c && g('ct-exist') && g('ct-exist').checked, exd = ex ? g('ct-exist-d').value : '';
        if (ex && !U().validarData(exd)) { er.textContent = 'Informe a data em que o contrato foi assinado.'; g('ct-exist-d').focus(); return false; }
        if (!prest) { er.textContent = mod === 'os' ? 'Escolha o profissional ou a prestadora.' : 'Escolha a prestadora.'; return false; }
        if (obj.length < 10) { er.textContent = 'Descreva o objeto do contrato (pelo menos 10 letras).'; g('ct-obj').focus(); return false; }
        if (!Number.isInteger(vd) || vd < 0 || vd > 90) { er.textContent = 'O vencimento vai de 0 a 90 dias depois da nota válida.'; g('ct-venc').focus(); return false; }
        if (!U().validarData(ini)) { er.textContent = 'Informe a data de início.'; g('ct-ini').focus(); return false; }
        if (fim && (!U().validarData(fim) || fim < ini)) { er.textContent = 'A data de fim precisa ser depois do início.'; g('ct-fim').focus(); return false; }
        const objF = ex ? (`Contrato já existente, assinado em ${U().formatarData(exd)} (antes do Conectwork). ` + obj).slice(0, 500) : obj;
        dados = { modalidade: mod, prestadorId: prest, objeto: objF, periodicidade: per, vencimentoDias: vd, inicio: ini, fim: fim || '' }; return true; } }],
      aoAbrir: d => { const s = d.querySelector('#ct-prest') || d.querySelector('#ct-obj'); s.focus();
        const ce = d.querySelector('#ct-exist'); if (ce) ce.onchange = () => { d.querySelector('#ct-exist-dl').hidden = !ce.checked; const di = d.querySelector('#ct-exist-d'), ii = d.querySelector('#ct-ini'); if (ce.checked) di.oninput = () => { if (!ii.value) ii.value = di.value; }; };
        if (ce && ce.checked) ce.onchange();
        d.querySelectorAll('[name="ct-mod"]').forEach(r => r.onchange = () => { const os = r.value === 'os' && r.checked; if (!r.checked) return; d.querySelector('#ct-per-l').hidden = os;
          d.querySelector('#ct-prest-rot').textContent = os ? 'Profissional (PJ/MEI) ou prestadora' : 'Prestadora';
          d.querySelector('#ct-obj').placeholder = os ? 'Ex.: Manutenção elétrica sob demanda, por ordem de serviço com entrega definida.' : 'Ex.: Equipe de manutenção industrial com supervisor próprio da prestadora.'; }); d.querySelectorAll('input,select,textarea').forEach(i => i.addEventListener('input', () => { d.querySelector('#ct-erro').textContent = ''; })); }
    });
    if (!dados) return;
    const agora = CW.fb.agora, b = db.batch();
    try {
      if (c) {
        const corr = Object.assign({}, dados, { prestadorId: c.prestadorId, assinaturas: {}, atualizadoEm: agora() }); delete corr.modalidade;
        b.update(db.doc('contratos/' + c._id), corr);
        log(b, ctx, 'contrato.corrigir', `Contrato com ${c.prestadorNome} corrigido; as assinaturas recomeçam.`, c._id);
        await b.commit(); U().toast('Contrato corrigido. As duas empresas assinam de novo.'); desenharDetalhe(document.getElementById('view'), ctx, c._id); return;
      }
      const p = prestadoras.find(e => e._id === dados.prestadorId), t = ctx.contexto.empresa, ref = db.collection('contratos').doc();
      b.set(ref, Object.assign({ tomadorId: eu, partes: [eu, p._id], tomadorNome: t.nome || t.razao || '', tomadorCnpj: t.cnpj || '', prestadorNome: p.nome || p.razao || '', prestadorCnpj: p.cnpj || '',
        status: 'assinatura', assinaturas: {}, interlocutor: null, proposta: null, criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoEm: agora() }, dados));
      log(b, ctx, 'contrato.criar', `Contrato (${MODAL[dados.modalidade].toLowerCase()}) com ${p.nome || p.razao} criado e mandado para assinatura.`, ref.id);
      await b.commit();
      if (pre && pre.voltar) try { sessionStorage.setItem('cw.medVoltar', pre.voltar); } catch (e) { /* sem armazenamento */ }
      U().toast(pre && pre.existente ? 'Contrato registrado. Faça a triagem e confirme; depois a prestadora confirma no Conectwork dela.' : 'Contrato criado. Agora as duas empresas assinam.'); CW.ir('contratos/ver/' + ref.id);
    } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
  }

  /* ---------- detalhe ---------- */
  async function desenharDetalhe(el, ctx, id) {
    const { esc, ic, formatarData, formatarDataHora, avatar } = U();
    let c;
    try { c = CW.fb.dados(await CW.fb.db().doc('contratos/' + id).get()); } catch (e) { c = null; }
    if (!c) { el.innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('file')}</div><strong>Contrato não encontrado.</strong><button class="btn sec sm" id="ct-volta">${ic('back')}Voltar</button></div></div>`; document.getElementById('ct-volta').onclick = () => CW.ir('contratos'); return; }
    c._id = id;
    const l = ladoDe(c, ctx), o = outro(l), pode = admin(ctx), as = c.assinaturas || {};
    document.getElementById('titulo').textContent = 'Contrato com ' + nomeOutro(c, ctx);
    document.getElementById('acoes').innerHTML = c.status !== 'cancelado' && CW.dossie ? `<button class="btn sec" id="ct-dossie">${ic('shield')}Dossiê da relação</button>` : '';
    const ass = lado => { const a = as[lado], n = lado === 'tomador' ? c.tomadorNome : c.prestadorNome;
      return `<li class="${a ? 'done' : 'now'}"><span class="dot">${a ? ic('check') : ''}</span>${esc(n)} <span class="hint">(${lado === 'tomador' ? 'contrata' : 'presta o serviço'})</span><small>${a ? 'assinou ' + esc(formatarDataHora(a.em)) + ' · ' + esc(a.nome) : 'falta assinar'}</small></li>`; };
    let acoes = '';
    let medVoltar = ''; try { medVoltar = sessionStorage.getItem('cw.medVoltar') || ''; } catch (e) { /* sem armazenamento */ }
    if (medVoltar && l === 'tomador' && (c.modalidade || 'continua') === 'continua') acoes += c.status === 'ativo'
      ? `<div class="banner ok" id="ct-medvolta">${ic('check')}<span><strong>Contrato ativo</strong>Agora a medição que veio do painel do RH pode ser enviada.</span><button class="btn sm" id="ct-medvolta-bt">Voltar para a medição</button></div>`
      : `<div class="banner info" id="ct-medespera">${ic('clock')}<span><strong>A medição do painel do RH espera este contrato</strong>Faça a triagem e assine. Quando a ${esc(c.prestadorNome)} confirmar no Conectwork, o contrato fica ativo e aparece aqui o botão para voltar à medição.</span></div>`;
    const semTriagem = l === 'tomador' && CW.triagem && !CW.triagem.libera(c);
    if (pode && c.status === 'assinatura' && !as[l] && semTriagem) acoes += `<div class="banner warn" id="ct-sem-triagem">${ic('shield')}<span><strong>Antes de assinar: triagem</strong>${c.triagem && c.triagem.resultado === 'nao_publicar' ? 'A triagem indica que este serviço não deve ser contratado neste modelo.' : c.triagem ? 'Registre o parecer jurídico favorável para liberar a assinatura.' : 'Faça a triagem do contrato (7 perguntas) para liberar a assinatura.'}</span></div>`;
    /* contrato que já existe no papel (12/11/2026, "não posso assinar porque já é antigo"): não se assina de novo; cada empresa só
       confirma que o contrato em papel vale (assinaturas.<lado>.papel = true). Quem é admin das duas confirma pelas duas de uma vez. */
    const exist = /^Contrato já existente, assinado em (\d{2}\/\d{2}\/\d{4})/.exec(c.objeto || '');
    const outroId = l === 'tomador' ? c.prestadorId : c.tomadorId;
    const admOutro = !!exist && (CW.sessao.estado().opcoes || []).some(x => x.tipo === 'empresa' && x.empresaId === outroId && x.acesso && x.acesso.cargo === 'admin' && x.acesso.ativo !== false)
      && !(c.assinaturas || {})[o] && (o === 'prestador' || !CW.triagem || CW.triagem.libera(c));
    if (pode && c.status === 'assinatura' && !as[l] && !semTriagem && exist) acoes += `<div class="stack" style="gap:10px" id="ct-assinar-box">
        <div class="banner info" id="ct-papel">${ic('file')}<span><strong>Este contrato já foi assinado no papel em ${esc(exist[1])}</strong>Não precisa assinar de novo. Aqui cada empresa só confirma que ele continua valendo, para as medições e as notas passarem pelo Conectwork.</span></div>
        ${l === 'prestador' ? `<p style="margin:0;font-size:13px;font-weight:500">Interlocutor da prestadora <span class="hint" style="font-weight:400">(opcional: quem responde pelo serviço)</span></p>
          <div class="fgrid"><label class="f c12"><span>Nome</span><input id="ct-int-nome" maxlength="120"></label><label class="f c6"><span>E-mail</span><input id="ct-int-email" type="email" maxlength="120"></label><label class="f c6"><span>Celular</span><input id="ct-int-cel" data-mascara="celular" inputmode="tel"></label></div>` : ''}
        <label class="check"><input type="checkbox" id="ct-li"><span>Confirmo que o contrato assinado em ${esc(exist[1])} continua valendo para a ${esc(l === 'tomador' ? c.tomadorNome : c.prestadorNome)}.</span></label>
        ${admOutro ? `<label class="check"><input type="checkbox" id="ct-ambas" checked><span>Confirmar também pela ${esc(l === 'tomador' ? c.prestadorNome : c.tomadorNome)} (você é administrador(a) das duas)</span></label>` : ''}
        <p class="err" id="ct-erro2" role="alert"></p>
        <button class="btn" id="ct-assinar">${ic('check')}Confirmar o contrato já assinado</button></div>`;
    else if (pode && c.status === 'assinatura' && !as[l] && !semTriagem) acoes += `<div class="stack" style="gap:10px" id="ct-assinar-box">
        ${l === 'prestador' ? `<p style="margin:0;font-size:13px;font-weight:500">${c.modalidade === 'os' ? 'Contato para as ordens de serviço <span class="hint" style="font-weight:400">(opcional)</span>' : 'Interlocutor da prestadora (quem responde pelo serviço)'}</p>
          <div class="fgrid"><label class="f c12"><span>Nome</span><input id="ct-int-nome" maxlength="120"></label><label class="f c6"><span>E-mail</span><input id="ct-int-email" type="email" maxlength="120"></label><label class="f c6"><span>Celular</span><input id="ct-int-cel" data-mascara="celular" inputmode="tel"></label></div>` : ''}
        <label class="check"><input type="checkbox" id="ct-li"><span>Li e concordo com este contrato em nome da ${esc(l === 'tomador' ? c.tomadorNome : c.prestadorNome)}.</span></label>
        <p class="err" id="ct-erro2" role="alert"></p>
        <button class="btn" id="ct-assinar">${ic('edit')}Assinar contrato</button></div>`;
    if (pode && c.status === 'assinatura' && l === 'tomador') acoes += `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" id="ct-corrigir">${ic('edit')}Corrigir</button><button class="btn ghost" id="ct-cancelar">Cancelar contrato</button></div>`;
    const prop = c.proposta;
    if (c.status === 'ativo' && prop) acoes += prop.lado === l
      ? `<div class="banner info" id="ct-prop">${ic('clock')}<span><strong>Mudança de vencimento proposta por você</strong>Para ${esc(venc(prop.vencimentoDias))}. Esperando a ${esc(nomeOutro(c, ctx))} aceitar.</span></div>`
      : `<div class="banner warn" id="ct-prop">${ic('alert')}<span><strong>A ${esc(nomeOutro(c, ctx))} propôs mudar o vencimento</strong>De ${esc(venc(c.vencimentoDias))} para ${esc(venc(prop.vencimentoDias))}.${prop.motivo ? ' Motivo: ' + esc(prop.motivo) : ''}</span></div>
        ${pode ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ok" id="ct-prop-aceitar">${ic('check')}Aceitar</button><button class="btn dangerous" id="ct-prop-recusar">${ic('x')}Recusar</button></div>` : ''}`;
    if (pode && c.status === 'ativo') acoes += `<div style="display:flex;gap:8px;flex-wrap:wrap">${!prop ? `<button class="btn sec" id="ct-propor">${ic('clock')}Propor outro vencimento</button>` : ''}<button class="btn ghost" id="ct-encerrar">Encerrar o serviço</button></div>`;
    const enc = c.encerramento;
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="ct-voltar">${ic('back')}Voltar para os contratos</button></div>
      <div class="grid-main"><div class="stack">
        <section class="card" id="ct-dados"><div class="card-h"><span class="ic">${ic('file')}</span><h3>${c.modalidade === 'os' ? 'Contrato de serviço por entrega' : 'Contrato de equipe contínua'}</h3><span style="margin-left:auto">${pill(c.status)}</span></div><div class="card-b"><dl class="dl">
          <div class="full"><dt>Objeto</dt><dd id="ct-objeto">${esc(c.objeto)}</dd></div>
          <div><dt>Quem contrata</dt><dd>${esc(c.tomadorNome)}<br><span class="hint">${esc(c.tomadorCnpj || '')}</span></dd></div>
          <div><dt>Quem presta o serviço</dt><dd>${esc(c.prestadorNome)}<br><span class="hint">${esc(c.prestadorCnpj || '')}</span></dd></div>
          <div><dt>Medição</dt><dd>${esc(PER[c.periodicidade] || '')}</dd></div>
          <div><dt>Vencimento</dt><dd id="ct-venc-v">${esc(venc(c.vencimentoDias))}</dd></div>
          <div><dt>Início</dt><dd>${esc(formatarData(c.inicio))}</dd></div><div><dt>Fim</dt><dd>${esc(c.fim ? formatarData(c.fim) : 'Sem data para terminar')}</dd></div>
          ${c.interlocutor ? `<div class="full"><dt>Interlocutor da prestadora</dt><dd>${esc(c.interlocutor.nome)} · ${esc(c.interlocutor.email)}${c.interlocutor.cel ? ' · ' + esc(c.interlocutor.cel) : ''}</dd></div>` : ''}
          ${enc ? `<div class="full"><dt>Encerramento do serviço</dt><dd>${esc(formatarData(enc.data))} · por ${esc(enc.nome)} (${esc(enc.lado === 'tomador' ? c.tomadorNome : c.prestadorNome)}): ${esc(enc.motivo)}</dd></div>` : ''}
        </dl></div></section>
        <div id="ct-ordens"></div>
        <div id="ct-avaliacoes"></div>
        <p class="hint" style="margin:0;font-size:12px">${esc(AVISO)} A assinatura aqui é um registro simples (quem e quando); a assinatura eletrônica com validade jurídica entra numa etapa futura.</p>
      </div><div class="stack">
        <div id="ct-triagem"></div>
        <section class="card" id="ct-assinaturas"><div class="card-h"><span class="ic">${ic('edit')}</span><h3>Assinaturas</h3></div><div class="card-b stack" style="gap:16px">
          <ul class="tl">${ass('tomador')}${ass('prestador')}</ul>${acoes}
          ${!pode && (c.status === 'assinatura' || c.status === 'ativo') ? '<p class="hint" style="margin:0;font-size:12.5px">Só o administrador da empresa assina e muda o contrato.</p>' : ''}</div></section>
        <div id="ct-docs"></div>
      </div></div>`;
    U().aplicarMascaras(el);
    ligarDetalhe(el, ctx, c, l, o);
    if (CW.triagem) CW.triagem.bloco(document.getElementById('ct-triagem'), ctx, c, () => desenharDetalhe(el, ctx, id));
    if (CW.ordens && c.modalidade === 'os') CW.ordens.blocoContrato(document.getElementById('ct-ordens'), ctx, c);
    if (CW.avaliacoes && c.modalidade !== 'os') CW.avaliacoes.bloco(document.getElementById('ct-avaliacoes'), ctx, c);
    if (CW.documentos) CW.documentos.blocoContrato(document.getElementById('ct-docs'), ctx, c);
  }

  function ligarDetalhe(el, ctx, c, l, o) {
    const db = CW.fb.db(), ref = db.doc('contratos/' + c._id), agora = CW.fb.agora, $ = id => document.getElementById(id);
    const refazer = () => desenharDetalhe(el, ctx, c._id);
    const grava = async (fn, msg) => { const b = db.batch(); fn(b); try { await b.commit(); if (msg) U().toast(msg); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); } refazer(); };
    $('ct-voltar').onclick = () => CW.ir('contratos');
    const ds = $('ct-dossie'); if (ds) ds.onclick = () => CW.ir('contratos/dossie/' + c._id);
    const as = $('ct-assinar');
    if (as) as.onclick = () => {
      const er = $('ct-erro2'); er.textContent = '';
      let inter = null;
      const papel = !!$('ct-papel');
      if (l === 'prestador' && !((c.modalidade === 'os' || papel) && !$('ct-int-nome').value.trim())) {
        inter = { nome: $('ct-int-nome').value.trim().replace(/\s+/g, ' '), email: $('ct-int-email').value.trim().toLowerCase(), cel: $('ct-int-cel').value.trim() };
        if (inter.nome.split(' ').length < 2) { er.textContent = 'Informe nome e sobrenome do interlocutor.'; return; }
        if (!U().validarEmail(inter.email)) { er.textContent = 'E-mail do interlocutor inválido.'; return; }
        if (inter.cel && !U().validarCelular(inter.cel)) { er.textContent = 'Celular do interlocutor inválido (DDD + 9 dígitos) ou deixe em branco.'; return; }
      }
      if (!$('ct-li').checked) { er.textContent = papel ? 'Marque a confirmação para seguir.' : 'Marque "Li e concordo" para assinar.'; return; }
      const duas = papel && $('ct-ambas') && $('ct-ambas').checked;
      const sig = () => Object.assign({ uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: agora() }, papel ? { papel: true } : {});
      if (duas) {   /* duas gravações: o lado do outro só vale para quem é admin dele (a regra confere) */
        const ord = l === 'prestador' ? ['prestador', 'tomador'] : ['tomador', 'prestador'];
        (async () => { try {
          for (let i = 0; i < 2; i++) { const b = db.batch(), u = { ['assinaturas.' + ord[i]]: sig(), atualizadoEm: agora() };
            if (ord[i] === 'prestador' && inter) u.interlocutor = inter; if (i === 1) { u.status = 'ativo'; u.ativadoEm = agora(); }
            b.update(ref, u); log(b, ctx, 'contrato.assinar', `Contrato já assinado no papel confirmado pela ${ord[i] === 'tomador' ? c.tomadorNome : c.prestadorNome}${i === 1 ? ': agora está ativo' : ''}.`, c._id); await b.commit(); }
          U().toast('Contrato confirmado pelas duas empresas. Agora está ativo.');
        } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); } refazer(); })();
        return;
      }
      const ambos = !!(c.assinaturas || {})[o];
      const upd = { ['assinaturas.' + l]: sig(), atualizadoEm: agora() };
      if (inter) upd.interlocutor = inter;
      if (ambos) { upd.status = 'ativo'; upd.ativadoEm = agora(); }
      grava(b => { b.update(ref, upd); log(b, ctx, 'contrato.assinar', `Contrato com ${nomeOutro(c, ctx)} assinado${ambos ? ' pelas duas empresas: agora está ativo' : ''}.`, c._id); },
        ambos ? 'Contrato assinado pelas duas empresas. Agora está ativo.' : 'Assinado. Falta a outra empresa assinar.');
    };
    const cr = $('ct-corrigir'); if (cr) cr.onclick = () => formulario(ctx, c);
    const mv = $('ct-medvolta-bt'); if (mv) mv.onclick = () => { let r = ''; try { r = sessionStorage.getItem('cw.medVoltar') || ''; sessionStorage.removeItem('cw.medVoltar'); } catch (e) { /* sem armazenamento */ } if (r) CW.ir(r); };
    const ca = $('ct-cancelar');
    if (ca) ca.onclick = async () => { if (!(await U().confirmar('Cancelar o contrato?', `O contrato com ${c.prestadorNome} deixa de valer antes de ser assinado. Fica registrado no histórico.`, 'Cancelar contrato'))) return;
      grava(b => { b.update(ref, { status: 'cancelado', atualizadoEm: agora() }); log(b, ctx, 'contrato.cancelar', `Contrato com ${c.prestadorNome} cancelado antes da assinatura.`, c._id); }, 'Contrato cancelado.'); };
    const pp = $('ct-propor');
    if (pp) pp.onclick = async () => {
      let r = null;
      await U().dialogo({ titulo: 'Propor outro vencimento', sub: `Hoje: ${venc(c.vencimentoDias)}. A ${nomeOutro(c, ctx)} precisa aceitar para valer.`,
        corpo: `<div class="fgrid"><label class="f c12"><span>Novo vencimento (dias depois da nota válida)</span><input id="pv-dias" type="number" inputmode="numeric" min="0" max="90" value="${c.vencimentoDias}"></label>
          <label class="f c12"><span>Motivo <i>(opcional)</i></span><input id="pv-mot" maxlength="200"></label><p class="err c12" id="pv-erro"></p></div>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Mandar proposta', valor: 'ok', antes: d => { const n = Number(d.querySelector('#pv-dias').value);
          if (!Number.isInteger(n) || n < 0 || n > 90) { d.querySelector('#pv-erro').textContent = 'De 0 a 90 dias.'; return false; }
          if (n === c.vencimentoDias) { d.querySelector('#pv-erro').textContent = 'Esse já é o vencimento atual.'; return false; }
          r = { vencimentoDias: n, motivo: d.querySelector('#pv-mot').value.trim() }; return true; } }] });
      if (!r) return;
      grava(b => { b.update(ref, { proposta: { vencimentoDias: r.vencimentoDias, motivo: r.motivo, lado: l, uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: agora() }, atualizadoEm: agora() });
        log(b, ctx, 'contrato.propor', `Proposta de vencimento para ${venc(r.vencimentoDias).toLowerCase()} mandada para ${nomeOutro(c, ctx)}.`, c._id); }, 'Proposta mandada. Vale quando a outra empresa aceitar.');
    };
    const pa = $('ct-prop-aceitar');
    if (pa) pa.onclick = () => grava(b => { b.update(ref, { vencimentoDias: c.proposta.vencimentoDias, proposta: null, atualizadoEm: agora() });
      log(b, ctx, 'contrato.vencimento', `Vencimento do contrato com ${nomeOutro(c, ctx)} mudou de ${venc(c.vencimentoDias).toLowerCase()} para ${venc(c.proposta.vencimentoDias).toLowerCase()} (aceito pelas duas empresas).`, c._id); }, 'Novo vencimento aceito.');
    const pr = $('ct-prop-recusar');
    if (pr) pr.onclick = () => grava(b => { b.update(ref, { proposta: null, atualizadoEm: agora() });
      log(b, ctx, 'contrato.recusar', `Proposta de vencimento de ${nomeOutro(c, ctx)} recusada; continua ${venc(c.vencimentoDias).toLowerCase()}.`, c._id); }, 'Proposta recusada. O vencimento continua o mesmo.');
    const en = $('ct-encerrar');
    if (en) en.onclick = async () => {
      let r = null;
      await U().dialogo({ titulo: 'Encerrar o serviço', sub: `O contrato com ${nomeOutro(c, ctx)} passa a "Encerrado". Medições e notas já lançadas continuam valendo.`,
        corpo: `<div class="fgrid"><label class="f c6"><span>Último dia do serviço</span><input id="en-data" type="date"></label>
          <label class="f c12"><span>Motivo</span><textarea id="en-mot" rows="3" maxlength="300"></textarea></label><p class="err c12" id="en-erro"></p></div>`,
        botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Encerrar o serviço', valor: 'ok', classe: 'dangerous', antes: d => { const dt = d.querySelector('#en-data').value, m = d.querySelector('#en-mot').value.trim();
          if (!U().validarData(dt)) { d.querySelector('#en-erro').textContent = 'Informe o último dia do serviço.'; return false; }
          if (m.length < 5) { d.querySelector('#en-erro').textContent = 'Escreva o motivo.'; return false; }
          r = { data: dt, motivo: m }; return true; } }] });
      if (!r) return;
      grava(b => { b.update(ref, { status: 'encerrado', encerramento: { data: r.data, motivo: r.motivo, lado: l, uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: agora() }, proposta: null, atualizadoEm: agora() });
        log(b, ctx, 'contrato.encerrar', `Serviço do contrato com ${nomeOutro(c, ctx)} encerrado em ${U().formatarData(r.data)}: ${r.motivo}`, c._id); }, 'Serviço encerrado.');
    };
  }

  CW.contratos = { novo: (ctx, pre) => formulario(ctx, null, pre) };
  CW.registrarModulo({
    id: 'contratos', nome: 'Contratos', icone: 'file', ordem: 20,
    para: ['empresa'], contrato: ['contratos', 'cobrancas'],
    iniciar(ctx) {
      lista = null; porTomador = []; porPrestador = [];
      const db = CW.fb.db(), emp = ctx.contexto.empresaId;
      const junta = () => {
        const m = new Map(); porTomador.concat(porPrestador).forEach(c => m.set(c._id, c));
        const ordem = { assinatura: 0, ativo: 1, encerrado: 2, cancelado: 3 };
        lista = Array.from(m.values()).sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9) || String(b.inicio).localeCompare(String(a.inicio)));
        const el = document.getElementById('view'), at = CW.app.atual();
        if (el && at && at.modulo === 'contratos' && at.tela === 'lista') desenharLista(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() }));
        CW.app.pendenciasMudaram();
      };
      let a = false, b = false;
      CW.inscrever('contratos-t', () => db.collection('contratos').where('tomadorId', '==', emp), s => { porTomador = CW.fb.lista(s); a = true; if (b) junta(); });
      CW.inscrever('contratos-p', () => db.collection('contratos').where('prestadorId', '==', emp), s => { porPrestador = CW.fb.lista(s); b = true; if (a) junta(); });
      /* avaliações que faltam (quem contrata: admin ou aprovador técnico) */
      titPagos = []; avFeitas = null;
      const cg = ctx.contexto.acesso && ctx.contexto.acesso.cargo;
      if (!ctx.soLeitura && ['admin', 'aprovador'].includes(cg)) {
        CW.inscrever('contratos-tit', () => db.collection('titulos').where('tomadorId', '==', emp), s => { titPagos = CW.fb.lista(s).filter(t => ['liquidado', 'baixado'].includes(t.status)); CW.app.pendenciasMudaram(); }, () => {});
        CW.inscrever('contratos-av', () => db.collection('avaliacoes').where('tomadorId', '==', emp), s => { avFeitas = new Set(CW.fb.lista(s).map(x => x._id)); CW.app.pendenciasMudaram(); }, () => {});
      }
      return () => { lista = null; };
    },
    /* busca do topo (09/11/2026): só o que esta tela já carregou */
    buscar(ctx) {
      return (lista || []).map(c => { const l = ladoDe(c, ctx);
        return { t: nomeOutro(c, ctx), s: `Contrato · ${MODAL[c.modalidade] || 'Equipe contínua'} · ${c.objeto || ''}`, rota: 'contratos/ver/' + c._id,
          txt: [c.objeto, c.tomadorNome, c.prestadorNome, l === 'tomador' ? 'contrato a pagar' : 'contrato a receber', c.status].join(' ') }; });
    },
    pendencias(ctx) {
      if (!lista) return [];
      const out = [], adm = admin(ctx);
      lista.forEach(c => { const l = ladoDe(c, ctx);
        const tri = l === 'tomador' && CW.triagem && !CW.triagem.libera(c);
        if (adm && l === 'tomador' && ['assinatura', 'ativo'].includes(c.status) && !c.triagem) out.push({ txt: 'Fazer a triagem do contrato', sub: `${nomeOutro(c, ctx)} · 7 perguntas, antes de assinar`, rota: 'contratos/ver/' + c._id });
        else if (adm && l === 'tomador' && c.status === 'assinatura' && tri && c.triagem.resultado === 'analise_juridica') out.push({ txt: 'Registrar o parecer jurídico do contrato', sub: nomeOutro(c, ctx), rota: 'contratos/ver/' + c._id });
        if (adm && c.status === 'assinatura' && !(c.assinaturas || {})[l] && !tri) out.push({ txt: 'Assinar o contrato', sub: `${nomeOutro(c, ctx)} · ${c.objeto}`, rota: 'contratos/ver/' + c._id });
        if (adm && c.status === 'ativo' && c.proposta && c.proposta.lado !== l) out.push({ txt: 'Responder a proposta de vencimento', sub: `${nomeOutro(c, ctx)} · para ${venc(c.proposta.vencimentoDias).toLowerCase()}`, rota: 'contratos/ver/' + c._id }); });
      if (avFeitas) titPagos.filter(t => !avFeitas.has(t._id) && lista.some(c => c._id === t.contratoId && (c.modalidade || 'continua') === 'continua')).forEach(t => out.push({ txt: 'Avaliar o serviço do período', sub: `${t.prestadorNome} · ${CW.medicoes ? CW.medicoes.periodoTxt(t.periodo) : t.periodo} (já pago)`, rota: 'contratos/ver/' + t.contratoId }));
      return out;
    },
    telas: {
      lista: { nome: 'Contratos', sub: 'Contratos de equipe contínua e de serviço por entrega entre a sua empresa e quem contrata ou presta o serviço.', render: (el, ctx) => desenharLista(el, ctx) },
      ver: { nome: 'Contrato', sub: 'Dados, assinaturas e vencimento. O vencimento só muda com o aceite das duas empresas.', render: (el, ctx) => desenharDetalhe(el, ctx, ctx.params[0]) },
      dossie: { nome: 'Dossiê da relação', sub: 'Os registros que mostram como a relação entre as empresas funciona na prática, num PDF para o jurídico.', render: (el, ctx) => CW.dossie.render(el, ctx, ctx.params[0]) }
    }
  });
})();
