/* Conectwork · Dossiê da relação (contrato de equipe contínua).
   Junta, num lugar só e num PDF para o jurídico, os registros que mostram como a relação entre as empresas funciona na
   prática: contrato e assinaturas, triagem e parecer, documentos da prestadora, medições conferidas pelas duas partes,
   notas fiscais, pagamentos com comprovante, avaliações e o histórico de alterações (que ninguém edita nem apaga).
   Mostra indicadores tirados desses registros e também os pontos de atenção, sem esconder nada.
   Não é certificado jurídico: a validade da relação depende da operação real. */
(function () {
  const CW = window.CW = window.CW || {};
  const U = () => CW.ui;
  const CDN = { jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', auto: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js' };
  const AVISO = 'O Conectwork organiza a contratação e a gestão documental. A validade da relação depende da operação real, da legislação aplicável e da análise jurídica e contábil adequada. Este dossiê reúne registros; não é parecer nem certificado jurídico.';
  const brl = c => U().formatarDinheiro(c || 0);
  const ms = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
  const dt = v => { const m = ms(v); return m ? U().formatarDataHora(new Date(m)) : ''; };
  const dia = s => s ? String(s).slice(8, 10) + '/' + String(s).slice(5, 7) + '/' + String(s).slice(0, 4) : '';
  const per = p => CW.medicoes ? CW.medicoes.periodoTxt(p) : p;
  const venc = t => CW.titulos ? CW.titulos.vencimento(t) : '';
  const ST_MED = { enviada: 'Esperando a prestadora', divergencia: 'Divergência', confirmada_prestadora: 'Esperando aprovação', aprovada: 'Aprovada', cancelada: 'Cancelada' };
  const ST_TIT = { aprovado: 'Esperando liberação', liberado: 'Liberado', agendado: 'Agendado', liquidado: 'Pago', baixado: 'Recebido e baixado' };

  function carregaScript(src, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => ok() ? res() : rej(new Error('Biblioteca não carregou.')); s.onerror = () => rej(new Error('Não foi possível baixar a ferramenta do PDF. Confira a internet e tente de novo.')); document.head.appendChild(s); });
  }

  /* ---------- dados ---------- */
  async function carregar(ctx, id) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId;
    const c = CW.fb.dados(await db.doc('contratos/' + id).get()); if (!c) return null; c._id = id;
    const campo = c.tomadorId === emp ? 'tomadorId' : 'prestadorId', souPrest = campo === 'prestadorId';
    const doContrato = async col => { try { return CW.fb.lista(await db.collection(col).where(campo, '==', emp).get()).filter(x => x.contratoId === id); } catch (e) { return []; } };
    const [med, esp, tit, avs] = await Promise.all([doContrato('medicoes'), doContrato('espelhos'), doContrato('titulos'), doContrato('avaliacoes')]);
    let docs = [];
    try { const q = souPrest ? db.collection('documentos').where('empresaId', '==', c.prestadorId) : db.collection('documentos').where('empresaId', '==', c.prestadorId).where('compartilhar', '==', true); docs = CW.fb.lista(await q.get()); } catch (e) { docs = []; }
    let hist = null;
    if (ctx.contexto.acesso && ctx.contexto.acesso.cargo === 'admin') {
      const refs = new Set([id].concat(med.map(x => x._id), esp.map(x => x._id), tit.map(x => x._id), avs.map(x => x._id)));
      try { hist = CW.fb.lista(await db.collection('log').where('empresaId', '==', emp).get()).filter(l => refs.has(l.ref)).sort((a, b) => ms(a.em) - ms(b.em)); } catch (e) { hist = null; }
    }
    return { c, med: med.sort((a, b) => String(a.periodo).localeCompare(String(b.periodo))), esp, tit, avs, docs, hist, souPrest };
  }

  /* indicadores tirados dos registros (fatos), separados em "a favor" e "atenção" */
  function analisar(D) {
    const { c, med, esp, tit, docs } = D, ok = [], at = [];
    const aprov = med.filter(m => m.status === 'aprovada');
    if (c.interlocutor) ok.push(`A prestadora indicou um interlocutor (${c.interlocutor.nome}) para tratar do serviço: pedidos e ajustes passam por ela.`);
    else at.push('O contrato não tem interlocutor da prestadora registrado.');
    const t = c.triagem;
    if (!t) at.push('O contrato não tem triagem registrada.');
    else if (t.resultado === 'compativel') ok.push('Triagem "compatível": serviço definido, supervisor da prestadora, sem ordens diretas nem jornada controlada pelo tomador.');
    else if (t.resultado === 'analise_juridica') (t.parecer && t.parecer.ok ? ok : at).push(t.parecer && t.parecer.ok ? `Triagem com pontos de risco, com parecer jurídico favorável registrado: ${t.parecer.obs}` : 'Triagem indica que é preciso análise jurídica, sem parecer registrado.');
    else at.push('Triagem "não publicar neste modelo" (ex-empregado ou sócio com relação nos últimos 18 meses).');
    if (aprov.length) {
      const conf = aprov.filter(m => m.confirmacao).length, div = med.filter(m => m.divergencia || m.status === 'divergencia').length;
      ok.push(`${aprov.length} medição(ões) aprovada(s), ${conf} conferida(s) pela prestadora antes da aprovação${div ? `; ${div} com divergência apontada e corrigida entre as empresas` : ''}.`);
      const vals = aprov.map(m => m.valorCentavos), min = Math.min(...vals), max = Math.max(...vals);
      if (aprov.length >= 3 && min === max) at.push(`O valor foi igual em todos os ${aprov.length} períodos (${brl(min)}): confira se o pagamento acompanha o serviço medido.`);
      else if (aprov.length >= 2) ok.push(`O valor muda conforme o serviço medido em cada período (de ${brl(min)} a ${brl(max)}).`);
      const nomes = aprov.map(m => new Set((m.memoria || []).map(x => String(x.nome || '').toLowerCase())));
      const todos = new Set(); nomes.forEach(s => s.forEach(n => todos.add(n)));
      const fixos = [...todos].filter(n => nomes.every(s => s.has(n)));
      if (aprov.length >= 2 && todos.size > fixos.length) ok.push(`A prestadora alocou ${todos.size} profissionais diferentes ao longo dos períodos (a equipe muda conforme a prestadora decide).`);
      else if (aprov.length >= 3 && todos.size && todos.size === fixos.length) at.push(`As mesmas ${todos.size} pessoas aparecem em todos os períodos: registre que a prestadora pode substituir quem faz o serviço.`);
    }
    const notas = esp.filter(e => e.nota);
    if (notas.length) ok.push(`${notas.length} nota(s) fiscal(is) emitida(s) pela prestadora em nome dela (CNPJ ${c.prestadorCnpj || ''}), conferidas com o contrato e a medição.`);
    const recus = esp.reduce((s, e) => s + (e.recusadas || []).length, 0);
    if (recus) ok.push(`${recus} nota(s) recusada(s) com motivo e reemitida(s): a cobrança é tratada entre as empresas.`);
    const pagos = tit.filter(x => x.liquidacao), comComp = pagos.filter(x => x.liquidacao.comprovante);
    if (pagos.length) {
      const emDia = pagos.filter(x => x.liquidacao.data <= venc(x)).length;
      ok.push(`${pagos.length} pagamento(s) da nota feito(s) direto à prestadora, ${comComp.length} com comprovante; ${emDia} no vencimento do contrato.`);
    }
    const S = CW.documentos ? CW.documentos.situacao(docs, CW.documentos.OBRIG_PRESTA) : [];
    const ruins = S.filter(s => s.st === 'vencido' || s.st === 'falta');
    if (S.length && !ruins.length) ok.push('Certidões da prestadora (federal, FGTS, trabalhista, municipal), PGR e PCMSO em dia.');
    else if (ruins.length) at.push('Documentos da prestadora com pendência: ' + ruins.map(s => s.nome.split(' (')[0].split(' · ')[0] + ' (' + s.txt.toLowerCase() + ')').join('; ') + '.');
    if (c.status === 'encerrado' && c.encerramento) ok.push(`Serviço encerrado em ${dia(c.encerramento.data)} por ${c.encerramento.lado === 'tomador' ? c.tomadorNome : c.prestadorNome}: ${c.encerramento.motivo}`);
    return { ok, at, docs: S };
  }

  /* ---------- tela ---------- */
  let ultimo = null;
  async function render(el, ctx, id) {
    const { esc, ic } = U();
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Juntando os registros da relação…</span></div></div>`;
    let D; try { D = await carregar(ctx, id); } catch (e) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Não foi possível montar o dossiê.</strong>${esc(CW.fb.mensagemErro(e))}</span></div>`; return; }
    if (!D) { el.innerHTML = `<div class="banner danger">${ic('alert')}<span><strong>Contrato não encontrado.</strong>Volte para Contratos.</span></div>`; return; }
    ultimo = D;
    const { c, med, esp, tit, avs, hist } = D, A = analisar(D), t = c.triagem, as = c.assinaturas || {};
    document.getElementById('titulo').textContent = 'Dossiê · ' + (D.souPrest ? c.tomadorNome : c.prestadorNome);
    document.getElementById('acoes').innerHTML = `<button class="btn" id="ds-pdf">${ic('file')}Baixar PDF</button>`;
    const tab = (id2, cab, linhas, vazio) => linhas.length ? `<div class="scroll"><table class="resp rl-tab" id="${id2}"><thead><tr>${cab.map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${linhas.map(l => `<tr>${l.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<p class="hint" style="margin:0;padding:14px 20px">${esc(vazio)}</p>`;
    const sec = (id2, icone, tt, corpo) => `<section class="card" id="${id2}" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic(icone)}</span><h3>${esc(tt)}</h3></div>${corpo}</section>`;
    const L = linhas(D);
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="ds-voltar">${ic('back')}Voltar para o contrato</button></div>
      <div class="banner info" style="margin-bottom:18px">${ic('shield')}<span><strong>Registros da relação entre ${esc(c.tomadorNome)} e ${esc(c.prestadorNome)}</strong>${esc(AVISO)}</span></div>
      <div class="grid-2" style="margin-bottom:22px">
        <section class="card" id="ds-favor"><div class="card-h"><span class="ic">${ic('check')}</span><h3>O que os registros mostram</h3><span class="count">${A.ok.length}</span></div><div class="card-b"><ul class="es-cf">${A.ok.map(x => `<li class="ok">${ic('check')}<span>${esc(x)}</span></li>`).join('') || '<li class="no"><span>Ainda não há registros suficientes.</span></li>'}</ul></div></section>
        <section class="card" id="ds-atencao"><div class="card-h"><span class="ic">${ic('alert')}</span><h3>Pontos de atenção</h3><span class="count">${A.at.length}</span></div><div class="card-b"><ul class="es-cf">${A.at.map(x => `<li class="no">${ic('alert')}<span>${esc(x)}</span></li>`).join('') || `<li class="ok">${ic('check')}<span>Nenhum ponto de atenção nos registros.</span></li>`}</ul></div></section></div>
      ${sec('ds-contrato', 'file', 'Contrato', `<div class="card-b"><dl class="dl">
        <div><dt>Quem contrata</dt><dd>${esc(c.tomadorNome)}<br><span class="hint">${esc(c.tomadorCnpj || '')}</span></dd></div><div><dt>Quem presta o serviço</dt><dd>${esc(c.prestadorNome)}<br><span class="hint">${esc(c.prestadorCnpj || '')}</span></dd></div>
        <div class="full"><dt>Objeto</dt><dd>${esc(c.objeto)}</dd></div><div><dt>Início</dt><dd>${esc(dia(c.inicio))}</dd></div><div><dt>Situação</dt><dd>${esc({ assinatura: 'Esperando assinatura', ativo: 'Ativo', encerrado: 'Encerrado', cancelado: 'Cancelado' }[c.status] || c.status)}</dd></div>
        <div><dt>Assinatura de quem contrata</dt><dd>${as.tomador ? esc(dt(as.tomador.em) + ' · ' + as.tomador.nome) : '—'}</dd></div><div><dt>Assinatura da prestadora</dt><dd>${as.prestador ? esc(dt(as.prestador.em) + ' · ' + as.prestador.nome) : '—'}</dd></div>
        ${c.interlocutor ? `<div class="full"><dt>Interlocutor da prestadora</dt><dd>${esc(c.interlocutor.nome)} · ${esc(c.interlocutor.email)}</dd></div>` : ''}</dl></div>`)}
      ${sec('ds-triagem', 'shield', 'Triagem', t ? `<div class="card-b"><p style="margin:0 0 10px"><b>${esc((CW.triagem && CW.triagem.RES[t.resultado] || ['', t.resultado])[1])}</b> · ${esc(t.nome)} · ${esc(dt(t.em))}</p>${tab('ds-tab-tri', ['Pergunta', 'Resposta'], L.triagem, '')}${t.parecer && t.parecer.ok ? `<p style="margin:10px 0 0;font-size:13px">Parecer jurídico: ${esc(t.parecer.obs)} (${esc(t.parecer.nome)})</p>` : ''}</div>` : '<p class="hint" style="margin:0;padding:14px 20px">Sem triagem registrada.</p>')}
      ${sec('ds-docs', 'shield', 'Documentos da prestadora', tab('ds-tab-docs', ['Documento', 'Situação'], L.docs, 'Sem documentos.'))}
      ${sec('ds-med', 'list', 'Medições', tab('ds-tab-med', ['Período', 'Valor', 'Profissionais', 'Conferida pela prestadora', 'Aprovada', 'Situação'], L.med, 'Nenhuma medição.'))}
      ${sec('ds-notas', 'receipt', 'Notas fiscais', tab('ds-tab-notas', ['Período', 'Nº', 'Valor', 'Enviada', 'Situação'], L.notas, 'Nenhuma nota.'))}
      ${sec('ds-pag', 'wallet', 'Pagamentos da nota', tab('ds-tab-pag', ['Período', 'Líquido', 'Vencimento', 'Pago em', 'Comprovante', 'Situação'], L.pag, 'Nenhum pagamento.'))}
      ${sec('ds-av', 'star', 'Avaliações do serviço', tab('ds-tab-av', ['Período', 'Média', 'Comentário', 'Resposta da prestadora'], L.av, 'Nenhuma avaliação.'))}
      ${hist ? sec('ds-hist', 'clock', 'Histórico de alterações da sua empresa', tab('ds-tab-hist', ['Quando', 'Quem', 'O que foi feito'], L.hist, 'Sem registros.')) : `<p class="hint" style="margin:0 0 22px;font-size:12.5px">O histórico de alterações entra no dossiê quando quem abre é o administrador da empresa.</p>`}`;
    document.getElementById('ds-voltar').onclick = () => CW.ir('contratos/ver/' + id);
    document.getElementById('ds-pdf').onclick = () => pdf(D, A, L).catch(e => U().toast(e.message, 'erro'));
  }

  function linhas(D) {
    const { c, med, esp, tit, avs, hist } = D, t = c.triagem, R = CW.triagem;
    return {
      triagem: t && R ? R.PERG.map(([k, q]) => [q, t.r[k] === 'sim' ? 'Sim' : 'Não']) : [],
      docs: (CW.documentos ? CW.documentos.situacao(D.docs, CW.documentos.OBRIG_PRESTA) : []).map(s => [s.nome, s.txt]),
      med: med.map(m => [per(m.periodo), brl(m.valorCentavos), String((m.memoria || []).length), m.confirmacao ? dt(m.confirmacao.em) + ' · ' + m.confirmacao.nome : '—', m.aprovacao ? dt(m.aprovacao.em) + ' · ' + m.aprovacao.nome : '—', ST_MED[m.status] || m.status]),
      notas: esp.filter(e => e.nota || (e.recusadas || []).length).map(e => [per(e.periodo), (e.nota && e.nota.numero) || '—', brl(e.valorCentavos), e.nota ? dt(e.nota.enviadoEm) : '—', e.status === 'nota_ok' ? 'Conferida' : e.nota ? 'Para conferir' : 'Recusada: ' + e.recusadas[e.recusadas.length - 1].motivo]),
      pag: tit.map(x => [per(x.periodo), brl(x.liquidoCentavos), dia(venc(x)), x.liquidacao ? dia(x.liquidacao.data) : '—', x.liquidacao && x.liquidacao.comprovante ? 'Sim' : '—', ST_TIT[x.status] || x.status]),
      av: avs.map(a => [per(a.periodo), (CW.avaliacoes ? CW.avaliacoes.media(a) : 0).toFixed(1).replace('.', ','), a.comentario || '—', a.resposta ? a.resposta.texto : '—']),
      hist: (hist || []).map(l => [dt(l.em), l.quem || '', l.texto || ''])
    };
  }

  async function pdf(D, A, L) {
    await carregaScript(CDN.jspdf, () => !!(window.jspdf && window.jspdf.jsPDF));
    await carregaScript(CDN.auto, () => !!(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable));
    const { c } = D, doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), azul = [8, 22, 56];
    doc.setFillColor(...azul); doc.rect(0, 0, 210, 24, 'F'); doc.setTextColor(255);
    doc.setFontSize(14); doc.text('Conectwork · Dossiê da relação', 12, 10);
    doc.setFontSize(9.5); doc.text(`${c.tomadorNome} (contrata) e ${c.prestadorNome} (presta o serviço) · gerado em ${U().formatarDataHora(new Date())}`, 12, 18);
    doc.setTextColor(20); let y = 32;
    const titulo = tt => { if (y > 255) { doc.addPage(); y = 16; } doc.setFontSize(11.5); doc.setFont(undefined, 'bold'); doc.text(tt, 12, y); doc.setFont(undefined, 'normal'); y += 3; };
    const tabela = (head, body) => { doc.autoTable({ startY: y, head: [head], body: body.length ? body : [[{ content: 'Sem registros.', colSpan: head.length }]], headStyles: { fillColor: azul, textColor: 255, fontSize: 8.5 }, styles: { fontSize: 8.5, cellPadding: 1.6 }, margin: { left: 12, right: 12, bottom: 24, top: 14 } }); y = doc.lastAutoTable.finalY + 8; };
    titulo('Contrato'); tabela(['Item', 'Registro'], [['Quem contrata', `${c.tomadorNome} · ${c.tomadorCnpj || ''}`], ['Quem presta o serviço', `${c.prestadorNome} · ${c.prestadorCnpj || ''}`], ['Objeto', c.objeto], ['Início', dia(c.inicio)],
      ['Assinaturas', ['tomador', 'prestador'].map(l => (c.assinaturas || {})[l] ? `${l === 'tomador' ? c.tomadorNome : c.prestadorNome}: ${dt(c.assinaturas[l].em)} (${c.assinaturas[l].nome})` : '').filter(Boolean).join(' · ') || '—'],
      ['Interlocutor da prestadora', c.interlocutor ? `${c.interlocutor.nome} · ${c.interlocutor.email}` : '—']]);
    titulo('O que os registros mostram'); tabela(['Registro'], A.ok.map(x => [x]));
    titulo('Pontos de atenção'); tabela(['Ponto'], A.at.map(x => [x]));
    titulo('Triagem' + (c.triagem ? ` · ${(CW.triagem.RES[c.triagem.resultado] || ['', ''])[1]} · ${c.triagem.nome}, ${dt(c.triagem.em)}` : '')); tabela(['Pergunta', 'Resposta'], L.triagem.concat(c.triagem && c.triagem.parecer && c.triagem.parecer.ok ? [['Parecer jurídico', c.triagem.parecer.obs]] : []));
    titulo('Documentos da prestadora'); tabela(['Documento', 'Situação'], L.docs);
    titulo('Medições'); tabela(['Período', 'Valor', 'Profissionais', 'Conferida pela prestadora', 'Aprovada', 'Situação'], L.med);
    titulo('Notas fiscais'); tabela(['Período', 'Nº', 'Valor', 'Enviada', 'Situação'], L.notas);
    titulo('Pagamentos da nota'); tabela(['Período', 'Líquido', 'Vencimento', 'Pago em', 'Comprovante', 'Situação'], L.pag);
    titulo('Avaliações do serviço'); tabela(['Período', 'Média', 'Comentário', 'Resposta'], L.av);
    if (D.hist) { titulo('Histórico de alterações (não pode ser editado nem apagado)'); tabela(['Quando', 'Quem', 'O que foi feito'], L.hist); }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(doc.splitTextToSize(AVISO, 186), 12, 284); doc.text(`Página ${i} de ${n}`, 186, 293); }
    doc.save(`Conectwork-dossie-${String(c.prestadorNome).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
    U().toast('Dossiê baixado.');
  }

  CW.dossie = { render, carregar, analisar };
})();
