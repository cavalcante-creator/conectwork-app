/* Conectwork · Notas dos MEIs numa tela só (13/11/2026, "uma funcionária da Zenith vai fazer a emissão das notas; teria que ter um
   login para fazer todos de uma vez").
   - A equipe Conectwork, na tela "Notas dos profissionais" da prestadora (repasse.js), escolhe uma pessoa da equipe da prestadora e
     dá a ela acesso "operacional" em cada empresa MEI da medição: acessos/{MEI}_{uid} com emissorPor = a prestadora.
   - Essa pessoa vê, na prestadora, "Notas dos MEIs" (#emissaomei): todas as notas dos MEIs em que ela emite, de todas as empresas,
     numa lista só. "Abrir" entra na empresa do MEI e abre o espelho; lá, "Voltar para as notas dos MEIs" volta para a prestadora.
   - As regras não mudaram: o acesso é criado pela equipe Conectwork (master) e o operacional já emite a nota. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const brl = c => U().formatarDinheiro(c);
  const periodoTxt = p => CW.medicoes ? CW.medicoes.periodoTxt(p) : p;
  const ST = { aguardando_nota: ['warn', 'Emitir a nota'], nota_enviada: ['info', 'Nota enviada'], nota_ok: ['ok', 'Nota conferida'], nota_contestada: ['danger', 'Nota contestada'] };

  /* acessos desta pessoa em que ela emite pelos MEIs de uma prestadora */
  const meus = prestId => ((CW.sessao.estado() || {}).acessos || []).filter(a => a.ativo && a.emissorPor && (!prestId || a.emissorPor === prestId));

  function sit(x) {
    if (x.status === 'aguardando_nota' && !(x.aceiteMei && x.aceiteMei.ok === true)) return x.aceiteMei && x.aceiteMei.ok === false ? ['danger', 'Horas ou valor contestados'] : ['warn', 'Conferir as horas e emitir'];
    if (x.status === 'aguardando_nota' && (x.recusadas || []).length) return ['danger', 'Nota recusada · enviar outra'];
    return ST[x.status] || ['info', x.status];
  }

  async function desenhar(el, ctx) {
    const { esc, ic } = U(), prest = ctx.contexto.empresaId, acs = meus(prest);
    document.getElementById('acoes').innerHTML = '';
    if (!acs.length) { el.innerHTML = `<div class="card"><div class="empty"><div class="ic">${ic('receipt')}</div><strong>Você ainda não emite notas pelos MEIs.</strong><span>A equipe Conectwork libera, em "Notas dos profissionais", quem da ${esc(ctx.contexto.nome)} emite as notas dos profissionais MEI.</span></div></div>`; return; }
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando as notas dos ${acs.length} MEIs…</span></div></div>`;
    const db = CW.fb.db(), todas = [];
    await Promise.all(acs.map(async a => { try { const s = await db.collection('espelhos').where('prestadorId', '==', a.empresaId).get();
      CW.fb.lista(s).filter(x => x.origem === 'repasse' && x.tomadorId === prest).forEach(x => todas.push(Object.assign(x, { _emp: a.empresaId }))); } catch (e) { /* sem leitura nessa empresa */ } }));
    /* pagamento (13/11/2026, "ela também paga"): o título de cada nota (mesmo id do espelho) e o Pix */
    const tits = {};
    await Promise.all(acs.map(async a => { try { const s = await db.collection('titulos').where('prestadorId', '==', a.empresaId).get(); CW.fb.lista(s).forEach(t => { tits[t._id] = t; }); } catch (e) { /* */ } }));
    await Promise.all(Object.values(tits).filter(t => t.conta && t.conta.ok).map(async t => { try { const c = CW.fb.dados(await db.doc('titulos/' + t._id + '/privado/conta').get()); if (c) t._pix = c.pix || (c.banco ? c.banco + ' · ag. ' + c.agencia + ' · conta ' + c.conta : ''); } catch (e) { /* sem leitura */ } }));
    const cargoMei = emp => (acs.find(a => a.empresaId === emp) || {}).cargo;
    const pagCel = x => { const t = tits[x._id]; if (!t) return x.status === 'nota_ok' ? '' : '<span class="hint">depois da nota</span>';
      const stt = { aprovado: 'Esperando liberação', liberado: 'Liberado para pagar', agendado: 'Pagamento agendado', liquidado: 'Pago', baixado: 'Pago' }[t.status] || t.status;
      const pix = t._pix ? `<br><small>Pix: <b>${U().esc(t._pix)}</b> <button class="linkbtn" data-em-copia="${U().esc(t._pix)}" style="font-size:12px">copiar</button></small>` : t.conta && t.conta.ok ? '' : '<br><small class="hint">sem Pix</small>';
      const bt = !(t.conta && t.conta.ok) && ['aprovado', 'liberado'].includes(t.status) && cargoMei(x._emp) === 'financeiro' ? `<br><button class="btn sm" data-em-pix="${U().esc(x._id)}" data-em-emp="${U().esc(x._emp)}">Anotar o Pix</button>`
        : ['liberado', 'agendado'].includes(t.status) && t.conta && t.conta.ok ? `<br><button class="btn sm" data-em-pagar="${U().esc(x._id)}">Pagar</button>` : '';
      return `<span class="pill ${['liquidado', 'baixado'].includes(t.status) ? 'ok' : 'info'}">${U().esc(stt)}</span>${pix}${bt}`; };
    const abertas = todas.filter(x => x.status === 'aguardando_nota' || x.status === 'nota_contestada');
    const ord = (a, b) => String(b.periodo).localeCompare(String(a.periodo)) || String(a.prestadorNome).localeCompare(String(b.prestadorNome), 'pt');
    const linha = x => { const s = sit(x);
      return `<tr class="click" data-em-abrir="${esc(x._id)}" data-em-emp="${esc(x._emp)}" tabindex="0"><td class="m-full"><strong>${esc(x.prestadorNome)}</strong><small>MEI ${esc(x.prestadorCnpj || '')} · ${esc(periodoTxt(x.periodo))}</small></td>
        <td class="r">${x.horas == null ? '—' : esc(String(x.horas).replace('.', ',')) + ' h'}</td><td class="r"><b>${esc(brl(x.valorCentavos))}</b></td><td><span class="pill ${s[0]}">${esc(s[1])}</span></td><td>${pagCel(x)}</td>
        <td class="r"><button class="btn sm ${x.status === 'aguardando_nota' ? '' : 'sec'}" data-em-abrir="${esc(x._id)}" data-em-emp="${esc(x._emp)}">${x.status === 'aguardando_nota' ? 'Emitir' : 'Abrir'}</button></td></tr>`; };
    const tab = (id, xs) => `<div class="scroll"><table class="resp" id="${id}"><thead><tr><th>Profissional</th><th class="r">Horas</th><th class="r">Valor</th><th>Nota</th><th>Pagamento</th><th></th></tr></thead><tbody>${xs.sort(ord).map(linha).join('')}</tbody></table></div>`;
    const resto = todas.filter(x => !abertas.includes(x));
    el.innerHTML = `<div class="banner info" id="em-aviso">${ic('receipt')}<span><strong>Você emite as notas de ${acs.length} profissionais MEI para a ${esc(ctx.contexto.nome)}</strong>Toque em "Emitir": o Conectwork entra na empresa do profissional e abre a nota dele. Confira as horas e o valor com o profissional, emita e anexe. Depois, "Voltar para as notas dos MEIs". Com a nota conferida, anote o Pix (uma vez por profissional) e pague em "Pagar".</span></div>
      <section class="card" id="em-abertas" style="margin-top:14px"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Para emitir</h3><span class="count">${abertas.length}</span></div>
        ${abertas.length ? tab('em-tab', abertas) : `<div class="empty"><div class="ic">${ic('check')}</div><strong>Nenhuma nota para emitir agora.</strong><span>Quando a ${esc(ctx.contexto.nome)} preparar as notas dos profissionais, elas aparecem aqui.</span></div>`}</section>
      ${resto.length ? `<section class="card" id="em-feitas" style="margin-top:14px"><div class="card-h"><span class="ic">${ic('check')}</span><h3>Notas enviadas e pagamento</h3><span class="count">${resto.length}</span></div>${tab('em-tab2', resto)}</section>` : ''}`;
    el.querySelectorAll('[data-em-pix]').forEach(b => b.onclick = ev => { ev.stopPropagation(); abrir(b.dataset.emEmp, b.dataset.emPix, 'titulos/ver/'); });
    el.querySelectorAll('[data-em-pagar]').forEach(b => b.onclick = ev => { ev.stopPropagation(); CW.ir('titulos/ver/' + b.dataset.emPagar); });
    el.querySelectorAll('[data-em-copia]').forEach(b => b.onclick = async ev => { ev.stopPropagation(); try { await navigator.clipboard.writeText(b.dataset.emCopia); U().toast('Pix copiado.'); } catch (e) { U().toast('Copie o Pix: ' + b.dataset.emCopia); } });
    el.querySelectorAll('[data-em-abrir]').forEach(b => { const ir = ev => { ev.stopPropagation(); abrir(b.dataset.emEmp, b.dataset.emAbrir); }; b.onclick = ir; if (b.tagName === 'TR') b.onkeydown = e => { if (e.key === 'Enter') ir(e); }; });
  }

  /* entra na empresa do MEI e abre o espelho */
  function abrir(empId, espId, rota) {
    try { sessionStorage.setItem('cw.em.depois', (rota || 'espelhos/ver/') + espId); } catch (e) { /* sem armazenamento */ }
    CW.sessao.entrarEm('empresa:' + empId);
    setTimeout(() => { let r = ''; try { r = sessionStorage.getItem('cw.em.depois') || ''; sessionStorage.removeItem('cw.em.depois'); } catch (e) { /* */ } if (r) CW.ir(r); }, 60);
  }
  /* no espelho dentro da empresa do MEI: faixa para voltar */
  function faixaVolta(ctx) {
    const a = ctx && ctx.contexto && ctx.contexto.acesso; if (!a || !a.emissorPor) return '';
    const { esc, ic } = U();
    return `<div class="banner info" id="em-volta-faixa" style="margin-bottom:14px">${ic('users')}<span><strong>Você está emitindo pela empresa de ${esc(ctx.contexto.nome)}</strong><button class="linkbtn" id="em-volta" style="display:inline">${ic('back')}Voltar para as notas dos MEIs</button></span></div>`;
  }
  function ligarVolta(ctx) {
    const b = document.getElementById('em-volta'), a = ctx && ctx.contexto && ctx.contexto.acesso; if (!b || !a) return;
    b.onclick = () => { try { sessionStorage.setItem('cw.em.depois', 'emissaomei'); } catch (e) { /* */ } CW.sessao.entrarEm('empresa:' + a.emissorPor);
      setTimeout(() => { try { sessionStorage.removeItem('cw.em.depois'); } catch (e) { /* */ } CW.ir('emissaomei'); }, 60); };
  }

  CW.registrarModulo({
    id: 'emissaomei', nome: 'Notas dos MEIs', icone: 'receipt', ordem: 27.3,
    para: ['empresa'], livre: true,
    mostrar: ctx => meus(ctx.empresaId).length > 0,
    telas: { lista: { nome: 'Notas dos MEIs', sub: 'Todas as notas dos profissionais MEI que você emite, numa lista só.', render: (el, ctx) => desenhar(el, ctx) } }
  });
  CW.emissaoMei = { meus, faixaVolta, ligarVolta, abrir };
})();
