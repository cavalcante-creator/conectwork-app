/* Conectwork · equipe Conectwork: mensalidades (a receita do Conectwork; nada é cobrado sobre os serviços).
   - Planos: a equipe define o valor de cada plano e o dia do vencimento (config/planos). Nada vem preenchido: o valor é
     decisão da equipe. Plano gratuito não gera cobrança.
   - Mês: "Gerar as mensalidades" cria uma por empresa ativa (id = empresa_AAAA-MM: não repete), com o valor do plano dela.
     "Recebi" dá baixa com a data em que o dinheiro entrou (em aberto não é pago); "Desfazer" volta para em aberto.
     Atrasada = em aberto com o vencimento já passado (calculado na tela).
   - A empresa (admin e financeiro) vê as suas em Minha empresa. Tudo grava no histórico. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const P = () => CW.permissoes;
  const R = () => CW.rede;

  let comp = null, filtro = 'todas';
  const FILTROS = [['todas', 'Todas'], ['aberta', 'Em aberto'], ['atrasadas', 'Atrasadas'], ['paga', 'Pagas'], ['isenta', 'Isentas']];

  function mes(el, ctx) {
    const { esc, ic, avatar } = U(), r = R();
    if (!r.carregou()) { r.carregando(el, 'Carregando as mensalidades…'); return; }
    if (!comp) comp = r.mesAtual();
    if (ctx.params[0] && FILTROS.some(f => f[0] === ctx.params[0])) { filtro = ctx.params[0]; }
    const D = r.D, valores = D.planos.valores || {}, dia = D.planos.diaVenc || 0;
    const atrasadasTodas = filtro === 'atrasadas';
    const doMes = D.mens.filter(m => m.comp === comp);
    const base = atrasadasTodas ? r.atrasadas() : doMes;
    const xs = base.filter(m => filtro === 'todas' || atrasadasTodas || (filtro === 'aberta' ? m.status === 'aberta' && r.sitMens(m).k !== 'atrasada' : m.status === filtro))
      .sort((a, b) => a.comp.localeCompare(b.comp) || String(a.empresaNome).localeCompare(String(b.empresaNome), 'pt-BR'));
    const soma = f => doMes.filter(f).reduce((s, m) => s + m.valorCentavos, 0);
    const conta = k => k === 'atrasadas' ? r.atrasadas().length : k === 'todas' ? doMes.length : k === 'aberta' ? doMes.filter(m => m.status === 'aberta' && r.sitMens(m).k !== 'atrasada').length : doMes.filter(m => m.status === k).length;
    const faltam = r.ativas().filter(e => !doMes.some(m => m.empresaId === e._id));
    const semValor = Object.keys(P().PLANOS).filter(k => k !== 'gratuito' && !(valores[k] > 0));
    const podeGerar = faltam.length && dia;
    el.innerHTML = `
      ${!dia || semValor.length ? `<div class="banner warn" id="mn-falta-plano">${ic('alert')}<span><strong>${!dia ? 'Defina os valores dos planos e o dia do vencimento' : 'Falta o valor de ' + esc(semValor.map(P().nomePlano).join(', '))}</strong>Sem valor, as empresas desse plano não recebem a mensalidade. <a href="#mensalidades/planos">Abrir Planos e valores</a></span></div>` : ''}
      <div class="rd-ks" id="mn-numeros">
        <div class="rd-k"><span>Do mês</span><b>${esc(r.brl(soma(m => m.status !== 'isenta')))}</b><small>${doMes.length} ${doMes.length === 1 ? 'mensalidade' : 'mensalidades'}</small></div>
        <div class="rd-k"><span>Recebido</span><b id="mn-recebido">${esc(r.brl(soma(m => m.status === 'paga')))}</b><small>${doMes.filter(m => m.status === 'paga').length} pagas</small></div>
        <div class="rd-k"><span>Em aberto</span><b id="mn-aberto">${esc(r.brl(soma(m => m.status === 'aberta')))}</b><small>${doMes.filter(m => m.status === 'aberta').length} para receber</small></div>
        <div class="rd-k ${r.atrasadas().length ? 'danger' : ''}"><span>Atrasadas (todos os meses)</span><b>${r.atrasadas().length}</b><small>${esc(r.brl(r.atrasadas().reduce((s, m) => s + m.valorCentavos, 0)))}</small></div>
      </div>
      <div class="card" id="mn-lista"><div class="card-h" style="flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:6px"><button class="iconbtn sm-ic" id="mn-ant" aria-label="Mês anterior" style="color:var(--muted)">${ic('back')}</button><b id="mn-mes" style="min-width:150px;text-align:center">${esc(r.nomeMes(comp))}</b><button class="iconbtn sm-ic" id="mn-prox" aria-label="Próximo mês" style="color:var(--muted)">${ic('chev')}</button></div>
          <div class="filters">${FILTROS.map(([k, l]) => `<button class="chip" data-filtro="${k}" aria-pressed="${filtro === k}">${l}<b>${conta(k)}</b></button>`).join('')}</div>
          ${podeGerar ? `<button class="btn sm" id="mn-gerar" style="margin-left:auto">${ic('plus')}Gerar ${faltam.length === 1 ? 'a mensalidade que falta' : 'as ' + faltam.length + ' que faltam'}</button>` : ''}</div>
        ${atrasadasTodas ? `<p class="hint" style="margin:0;padding:10px 20px;font-size:12.5px;border-bottom:1px solid var(--line)">Mostrando as atrasadas de todos os meses.</p>` : ''}
        ${xs.length ? `<div class="scroll"><table class="resp"><thead><tr><th>Empresa</th>${atrasadasTodas ? '<th>Mês</th>' : ''}<th>Plano</th><th>Valor</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead><tbody>
          ${xs.map(m => { const s = r.sitMens(m); return `<tr data-mens="${esc(m._id)}">
            <td class="m-full"><div class="cell">${avatar(m.empresaNome, 'sm', m.empresaId)}<div style="min-width:0"><strong>${esc(m.empresaNome)}</strong>${m.obs ? `<small>${esc(m.obs)}</small>` : ''}</div></div></td>
            ${atrasadasTodas ? `<td>${esc(r.nomeMes(m.comp))}</td>` : ''}<td class="m-hide">${esc(P().nomePlano(m.plano) || '—')}</td><td>${esc(r.brl(m.valorCentavos))}</td><td>${esc(r.dataBR(m.venc))}</td><td>${r.pill(s.c, s.t)}</td>
            <td class="r">${m.status === 'aberta' ? `<button class="btn ok sm" data-receber="${esc(m._id)}">${ic('check')}Recebi</button>` : m.status === 'paga' ? `<button class="btn sec sm" data-desfazer="${esc(m._id)}">Desfazer</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`
          : `<div class="empty"><div class="ic">${ic('wallet')}</div><strong>${doMes.length || atrasadasTodas ? 'Nenhuma mensalidade nesta situação.' : 'Nenhuma mensalidade gerada para ' + esc(r.nomeMes(comp)) + '.'}</strong>${!doMes.length && podeGerar ? '<span>Use "Gerar" para criar a mensalidade de cada empresa ativa.</span>' : ''}</div>`}
        <p class="hint" style="margin:0;padding:12px 20px;font-size:12px;border-top:1px solid var(--line)">O Conectwork não recebe dinheiro pelo app: a empresa paga a mensalidade pelo canal combinado (Pix ou boleto) e a equipe marca "Recebi" com a data em que o dinheiro entrou.</p></div>`;
    document.getElementById('acoes').innerHTML = `<a class="btn sec" href="#mensalidades/planos" id="mn-planos">${ic('receipt')}Planos e valores</a>`;
    const ir = n => { comp = r.somaMes(comp, n); if (filtro === 'atrasadas') filtro = 'todas'; CW.ir('mensalidades/mes'); mes(el, Object.assign({}, ctx, { params: [] })); };
    document.getElementById('mn-ant').onclick = () => ir(-1);
    document.getElementById('mn-prox').onclick = () => ir(1);
    el.querySelectorAll('[data-filtro]').forEach(b => b.onclick = () => { filtro = b.dataset.filtro; if (ctx.params[0]) history.replaceState(null, '', '#mensalidades/mes'); mes(el, Object.assign({}, ctx, { params: [] })); });
    const g = document.getElementById('mn-gerar'); if (g) g.onclick = () => gerar(ctx, faltam, g);
    el.querySelectorAll('[data-receber]').forEach(b => b.onclick = () => receber(ctx, D.mens.find(m => m._id === b.dataset.receber)));
    el.querySelectorAll('[data-desfazer]').forEach(b => b.onclick = () => desfazer(ctx, D.mens.find(m => m._id === b.dataset.desfazer)));
  }

  async function gerar(ctx, faltam, bt) {
    const r = R(), db = CW.fb.db(), D = r.D, valores = D.planos.valores || {}, dia = D.planos.diaVenc;
    const [a, m] = comp.split('-').map(Number), ultimo = new Date(a, m, 0).getDate();
    const venc = `${comp}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
    const vai = [], pula = [];
    faltam.forEach(e => {
      if (e.plano === 'gratuito') vai.push([e, 0, 'isenta']);
      else if (valores[e.plano] > 0) vai.push([e, valores[e.plano], 'aberta']);
      else pula.push(e);
    });
    if (!vai.length) { U().toast('Nenhuma mensalidade gerada: falta o valor do plano dessas empresas. Abra Planos e valores.', 'erro'); return; }
    const txt = `Vai gerar ${vai.length} ${vai.length === 1 ? 'mensalidade' : 'mensalidades'} de ${r.nomeMes(comp)}, com vencimento em ${r.dataBR(venc)}.`
      + (pula.length ? ` Ficam de fora (plano sem valor ou sem plano): ${pula.map(r.nomeEmp).join(', ')}.` : '');
    if (!(await U().confirmar('Gerar as mensalidades?', txt, 'Gerar'))) return;
    bt.disabled = true;
    const b = db.batch();
    vai.forEach(([e, v, st]) => {
      b.set(db.doc('mensalidades/' + e._id + '_' + comp), { empresaId: e._id, empresaNome: r.nomeEmp(e), comp, plano: e.plano || '', valorCentavos: v, venc, status: st, criadoEm: CW.fb.agora(), criadoPor: ctx.sessao.usuario.uid });
      r.log(b, ctx, e._id, 'mensalidade.gerar', `Mensalidade de ${r.nomeMes(comp)} de ${r.nomeEmp(e)} gerada: ${st === 'isenta' ? 'isenta (plano gratuito)' : r.brl(v) + ', vence em ' + r.dataBR(venc)}.`, e._id + '_' + comp);
    });
    try { await b.commit(); U().toast(`${vai.length} ${vai.length === 1 ? 'mensalidade gerada' : 'mensalidades geradas'}.`); }
    catch (err) { bt.disabled = false; U().toast(CW.fb.mensagemErro(err), 'erro'); }
  }

  function receber(ctx, m) {
    if (!m) return;
    const r = R(), { esc } = U();
    U().dialogo({ titulo: 'Recebi a mensalidade', sub: `${m.empresaNome} · ${r.nomeMes(m.comp)} · ${r.brl(m.valorCentavos)}`,
      corpo: `<div class="stack" style="gap:12px"><label class="f"><span>Dia em que o dinheiro entrou</span><input id="mn-dia" data-mascara="data" inputmode="numeric" placeholder="dd/mm/aaaa" value="${esc(U().formatarData(new Date()))}"><em class="ferr" id="mn-dia-erro"></em></label>
        <label class="f"><span>Observação (opcional)</span><input id="mn-obs" maxlength="200" placeholder="Ex.: Pix recebido"></label>
        <p class="hint" style="margin:0;font-size:12.5px">Só marque quando o dinheiro já estiver na conta. Pagamento combinado ou agendado ainda não é recebido.</p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Marcar como recebida', valor: 'ok', classe: 'ok', antes: d => {
        const v = d.querySelector('#mn-dia').value, iso = U().dataISO(v);
        if (!iso) { d.querySelector('#mn-dia-erro').textContent = 'Informe a data no formato dd/mm/aaaa.'; return false; }
        if (iso > r.hoje()) { d.querySelector('#mn-dia-erro').textContent = 'A data não pode ser depois de hoje.'; return false; }
        d._v = { dia: iso, obs: d.querySelector('#mn-obs').value.trim() }; return true; } }],
      aoAbrir: d => { U().aplicarMascaras(d); window.__mnDlg = d; }
    }).then(async v => {
      const d = window.__mnDlg; window.__mnDlg = null;
      if (v !== 'ok' || !d) return;
      const db = CW.fb.db(), b = db.batch(), upd = { status: 'paga', pagoNoDia: d._v.dia, pagoPor: r.quemSou(ctx), pagoEm: CW.fb.agora(), atualizadoEm: CW.fb.agora() };
      if (d._v.obs) upd.obs = d._v.obs;
      b.update(db.doc('mensalidades/' + m._id), upd);
      r.log(b, ctx, m.empresaId, 'mensalidade.receber', `Mensalidade de ${r.nomeMes(m.comp)} de ${m.empresaNome} recebida em ${r.dataBR(d._v.dia)} (${r.brl(m.valorCentavos)}).`, m._id);
      try { await b.commit(); U().toast('Mensalidade marcada como recebida.'); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); }
    });
  }

  async function desfazer(ctx, m) {
    if (!m) return;
    const r = R();
    if (!(await U().confirmar('Desfazer o recebimento?', `A mensalidade de ${r.nomeMes(m.comp)} de ${m.empresaNome} volta para em aberto.`, 'Desfazer'))) return;
    const db = CW.fb.db(), b = db.batch();
    b.update(db.doc('mensalidades/' + m._id), { status: 'aberta', pagoNoDia: null, pagoPor: null, pagoEm: null, atualizadoEm: CW.fb.agora() });
    r.log(b, ctx, m.empresaId, 'mensalidade.desfazer', `Recebimento da mensalidade de ${r.nomeMes(m.comp)} de ${m.empresaNome} desfeito.`, m._id);
    try { await b.commit(); U().toast('Recebimento desfeito.'); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); }
  }

  /* ---------- planos e valores ---------- */
  function planos(el, ctx) {
    const { esc, ic } = U(), r = R();
    if (!r.carregou()) { r.carregando(el); return; }
    const cfg = r.D.planos, valores = cfg.valores || {};
    const contaPlano = k => r.ativas().filter(e => e.plano === k).length;
    el.innerHTML = `<div class="grid-main"><section class="card" id="pl-form"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Valor da mensalidade de cada plano</h3></div><div class="card-b stack" style="gap:16px">
        ${Object.entries(P().PLANOS).map(([k, p]) => `<div class="pl-linha"><div style="min-width:0"><strong>${esc(p.nome)}</strong><small class="hint" style="display:block">${esc(p.desc)} · ${contaPlano(k)} ${contaPlano(k) === 1 ? 'empresa ativa' : 'empresas ativas'}</small></div>
          ${k === 'gratuito' ? '<span class="tag gray">Grátis</span>' : `<label class="f" style="width:170px"><span>Por mês (R$)</span><input data-plano="${k}" data-mascara="dinheiro" inputmode="numeric" placeholder="0,00" value="${valores[k] > 0 ? esc(U().formatarDinheiro(valores[k], false)) : ''}"></label>`}</div>`).join('')}
        <label class="f" style="max-width:260px"><span>Dia do vencimento</span><select id="pl-dia"><option value="">Escolha o dia</option>${Array.from({ length: 28 }, (_, i) => i + 1).map(d => `<option value="${d}" ${d === cfg.diaVenc ? 'selected' : ''}>Todo dia ${d}</option>`).join('')}</select></label>
        <p class="err" id="pl-erro" role="alert"></p>
        <div><button class="btn" id="pl-salvar">${ic('check')}Salvar planos e valores</button></div>
        ${cfg.em ? `<p class="hint" style="margin:0;font-size:12px">Última mudança: ${esc(U().formatarDataHora(cfg.em))}${cfg.por ? ' · ' + esc(cfg.por) : ''}</p>` : ''}
      </div></section>
      <section class="card"><div class="card-h"><span class="ic">${ic('help')}</span><h3>Como funciona</h3></div><div class="card-b"><ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.6">
        <li>A receita do Conectwork é só a mensalidade. Nada é cobrado sobre os serviços contratados na plataforma.</li>
        <li>O valor novo vale para as mensalidades geradas depois da mudança. As já geradas ficam como estão.</li>
        <li>Profissional MEI no plano gratuito não paga: a mensalidade dele nasce como isenta.</li></ul></div></section></div>`;
    U().aplicarMascaras(el);
    document.getElementById('acoes').innerHTML = `<a class="btn sec" href="#mensalidades" id="pl-voltar">${ic('back')}Voltar para Mensalidades</a>`;
    document.getElementById('pl-salvar').onclick = async ev => {
      const er = document.getElementById('pl-erro'), novos = {}, bt = ev.currentTarget;
      let ruim = false;
      el.querySelectorAll('[data-plano]').forEach(i => { const v = i.value.trim() ? U().lerDinheiro(i.value) : 0; if (v === null || v < 0) ruim = true; else novos[i.dataset.plano] = v; });
      novos.gratuito = 0;
      const dia = Number(document.getElementById('pl-dia').value);
      if (ruim) { er.textContent = 'Algum valor não está certo. Use só números, por exemplo 199,00.'; return; }
      if (!dia) { er.textContent = 'Escolha o dia do vencimento.'; return; }
      er.textContent = '';
      const db = CW.fb.db(), b = db.batch();
      b.set(db.doc('config/planos'), { valores: novos, diaVenc: dia, em: CW.fb.agora(), por: r.quemSou(ctx) });
      const txt = Object.keys(P().PLANOS).filter(k => k !== 'gratuito').map(k => `${P().nomePlano(k)} ${novos[k] ? r.brl(novos[k]) : 'sem valor'}`).join(', ');
      r.log(b, ctx, 'master', 'planos.valores', `Valores dos planos: ${txt}. Vencimento todo dia ${dia}.`, 'config/planos');
      bt.disabled = true;
      try { await b.commit(); U().toast('Planos e valores salvos.'); } catch (err) { er.textContent = CW.fb.mensagemErro(err); } finally { bt.disabled = false; }
    };
  }

  CW.rede.redesenhar.mensalidades = (el, ctx) => {
    const at = CW.app.atual();
    if (el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;   /* não apaga o que está sendo digitado */
    if (at.tela === 'planos') planos(el, ctx); else mes(el, ctx);
  };

  CW.registrarModulo({
    id: 'mensalidades', nome: 'Mensalidades', nomeCurto: 'Receita', icone: 'wallet', ordem: 12,
    para: ['master'],
    pendencias: () => {
      const r = R(); if (!r.carregou()) return [];
      const n = r.atrasadas().length;
      return n ? [{ txt: `${n} ${n === 1 ? 'mensalidade atrasada' : 'mensalidades atrasadas'}`, rota: 'mensalidades/mes/atrasadas' }] : [];
    },
    telas: {
      mes: { nome: 'Mensalidades', sub: 'A receita do Conectwork: a mensalidade de cada empresa, mês a mês.', render: (el, ctx) => mes(el, ctx) },
      planos: { nome: 'Planos e valores', sub: 'Quanto custa cada plano e o dia do vencimento.', render: (el, ctx) => planos(el, ctx) }
    }
  });
})();
