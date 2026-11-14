/* Conectwork · Termômetro de risco (14/11/2026, melhoria 5 depois da análise dos concorrentes: "o que só o Conectwork tem").
   Para quem contrata: por prestadora, os sinais que o Conectwork já enxerga nos dados (sem leitura de dado novo de ninguém):
   - triagem do contrato (falta, requer análise jurídica sem parecer, não publicar neste modelo);
   - equipe contínua sem interlocutor da prestadora;
   - certidões e documentos de segurança vencidos ou faltando (os que a prestadora compartilha);
   - horas que vêm do controle de ponto de quem contrata (medição do painel do RH);
   - por profissional, nas medições: a mesma pessoa em muitos períodos seguidos (12 meses ou mais = alto) e horas quase iguais
     em todos os períodos (jornada que parece controlada).
   É controle preventivo, não garantia nem parecer jurídico (aviso padrão no fim da tela). Só leitura: regras não mudaram. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const VE = ['admin', 'financeiro', 'rh', 'aprovador'];
  const tipo = ctx => ((ctx.contexto || ctx).empresa || {}).tipo || 'contratante';
  const cargo = ctx => ((ctx.contexto || ctx).acesso || {}).cargo;
  const dig = v => String(v || '').replace(/\D/g, '');
  const periodoTxt = p => CW.medicoes ? CW.medicoes.periodoTxt(p) : p;
  const AVISO = 'O Conectwork organiza a contratação e a gestão documental. A validade da relação depende da operação real, da legislação aplicável e da análise jurídica e contábil adequada.';
  const NIVEL = { alto: ['danger', 'Risco alto'], atencao: ['warn', 'Atenção'], ok: ['ok', 'Sem alerta'] };

  /* período → número de quinzenas desde o ano 0 (mês inteiro vale como as duas quinzenas) */
  function quinz(p) { const m = /^(\d{4})-(\d{2})(?:-(\d))?$/.exec(p || ''); if (!m) return null; const b = (+m[1]) * 24 + (+m[2] - 1) * 2; return m[3] ? [b + (+m[3] - 1)] : [b, b + 1]; }

  /* a conta, separada da tela (testável): contratos, medições e documentos por prestadora → alertas */
  function calcular(cts, meds, docsPorPrest) {
    const porPrest = new Map();
    const P = id => { if (!porPrest.has(id)) porPrest.set(id, { id, nome: '', contratos: [], meds: [], alertas: [], pessoas: [] }); return porPrest.get(id); };
    cts.filter(c => ['ativo', 'assinatura'].includes(c.status)).forEach(c => { const p = P(c.prestadorId); p.nome = p.nome || c.prestadorNome; p.contratos.push(c); });
    meds.filter(m => m.status !== 'cancelada').forEach(m => { const p = P(m.prestadorId); p.nome = p.nome || m.prestadorNome; p.meds.push(m); });
    const out = [];
    porPrest.forEach(p => {
      const A = (nivel, titulo, texto, fazer, rota) => p.alertas.push({ nivel, titulo, texto, fazer, rota: rota || '' });
      p.contratos.forEach(c => {
        const t = c.triagem, rot = 'contratos/ver/' + c._id;
        if (!t) A('alto', 'Contrato sem triagem', 'O contrato ainda não passou pelas 7 perguntas da triagem.', 'Faça a triagem no contrato.', rot);
        else if (t.resultado === 'nao_publicar') A('alto', 'Triagem: não contratar neste modelo', 'As respostas indicam que o serviço não deve ser contratado como terceirização.', 'Converse com o jurídico sobre o encerramento do serviço.', rot);
        else if (t.resultado === 'analise_juridica' && !(t.parecer && t.parecer.ok)) A('alto', 'Triagem pede análise jurídica', 'A triagem apontou riscos e ainda não há parecer jurídico registrado.', 'Registre o parecer jurídico no contrato.', rot);
        else if (t.resultado === 'analise_juridica') A('atencao', 'Contrato com parecer jurídico', 'A triagem apontou riscos; há parecer jurídico registrado.', 'Revise o parecer se a operação mudar.', rot);
        if (c.modalidade !== 'os' && c.status === 'ativo' && !(c.interlocutor && c.interlocutor.nome)) A('atencao', 'Sem interlocutor da prestadora', 'Na equipe contínua, quem coordena os profissionais deve ser alguém da prestadora.', 'Peça à prestadora para indicar o interlocutor no contrato.', rot);
      });
      const docs = docsPorPrest[p.id];
      if (docs && CW.documentos && CW.documentos.situacao) {
        const c0 = p.contratos.find(c => c.status === 'ativo') || p.contratos[0] || null;
        CW.documentos.situacao(docs, CW.documentos.obrigContrato(c0)).filter(s => s.st === 'vencido' || s.st === 'falta').forEach(s =>
          A(s.st === 'vencido' ? 'alto' : 'atencao', (s.st === 'vencido' ? 'Vencido: ' : 'Falta: ') + s.nome.split(' (')[0], s.txt, 'Peça à prestadora para enviar em "Documentos e certidões".', c0 ? 'contratos/ver/' + c0._id : ''));
      }
      if (p.meds.some(m => m.origem === 'integracao')) A('atencao', 'As horas vêm do controle de ponto de vocês', 'As medições chegam do painel do RH, com as horas de cada profissional marcadas no ponto da sua empresa. Controle de jornada pela empresa que contrata é um dos sinais de vínculo.', 'O ideal é a prestadora controlar a jornada da equipe dela e mandar a medição do serviço.', 'medicoes');
      /* por profissional, nas medições */
      const gente = new Map();
      p.meds.forEach(m => (m.memoria || []).forEach(x => { const k = dig(x.cnpj) || String(x.nome || '').trim().toLowerCase(); if (!k) return;
        const g = gente.get(k) || { nome: x.nome, cnpj: dig(x.cnpj), q: new Set(), horas: [], per: [] };
        (quinz(m.periodo) || []).forEach(n => g.q.add(n)); if (x.horas != null && quinz(m.periodo)) g.horas.push(+x.horas / quinz(m.periodo).length); g.per.push(m.periodo); gente.set(k, g); }));
      const ultQ = Math.max(-1, ...p.meds.map(m => Math.max(...(quinz(m.periodo) || [-1]))));
      gente.forEach(g => {
        const qs = [...g.q].sort((a, b) => a - b); let seq = 0;
        for (let n = ultQ; g.q.has(n); n--) seq++;   /* quinzenas seguidas até o último período */
        const span = qs.length ? (qs[qs.length - 1] - qs[0] + 1) : 0;
        const med = g.horas.length ? g.horas.reduce((a, b) => a + b, 0) / g.horas.length : 0;
        const dp = g.horas.length > 1 ? Math.sqrt(g.horas.reduce((a, b) => a + (b - med) ** 2, 0) / g.horas.length) : 0;
        const al = [];
        if (seq >= 24) al.push(['alto', `Em todas as quinzenas há ${Math.round(seq / 2)} meses seguidos`]);
        else if (seq >= 12) al.push(['atencao', `Em todas as quinzenas há ${Math.round(seq / 2)} meses seguidos`]);
        if (g.horas.length >= 4 && med > 0 && dp / med < 0.03) al.push(['atencao', `Horas quase iguais em todo período (cerca de ${String(Math.round(med * 10) / 10).replace('.', ',')} h por quinzena)`]);
        const desde = g.per.slice().sort()[0];
        if (al.length) p.pessoas.push({ nome: g.nome, cnpj: g.cnpj, desde, seq, span, mediaH: med, alertas: al, nivel: al.some(a => a[0] === 'alto') ? 'alto' : 'atencao' });
      });
      p.pessoas.sort((a, b) => (b.nivel === 'alto') - (a.nivel === 'alto') || b.seq - a.seq);
      const altoP = p.pessoas.filter(x => x.nivel === 'alto').length, atP = p.pessoas.length - altoP;
      if (altoP) A('alto', `${altoP} ${altoP === 1 ? 'profissional' : 'profissionais'} há 12 meses ou mais sem parar`, 'A mesma pessoa, todo período, por muito tempo, é um sinal de habitualidade e pessoalidade.', 'Veja a lista abaixo e converse com a prestadora sobre o rodízio da equipe ou com o jurídico.');
      if (atP) A('atencao', `${atP} ${atP === 1 ? 'profissional com sinal' : 'profissionais com sinais'} de atenção`, 'Muitos períodos seguidos ou horas sempre iguais.', 'Veja a lista abaixo.');
      p.nivel = p.alertas.some(a => a.nivel === 'alto') ? 'alto' : p.alertas.length ? 'atencao' : 'ok';
      out.push(p);
    });
    const ord = { alto: 0, atencao: 1, ok: 2 };
    return out.sort((a, b) => ord[a.nivel] - ord[b.nivel] || String(a.nome).localeCompare(String(b.nome), 'pt'));
  }

  let dados = null;
  async function carregar(ctx) {
    const db = CW.fb.db(), emp = ctx.contexto.empresaId;
    const [cs, ms] = await Promise.all([db.collection('contratos').where('tomadorId', '==', emp).get(), db.collection('medicoes').where('tomadorId', '==', emp).get()]);
    const cts = CW.fb.lista(cs), meds = CW.fb.lista(ms), docs = {};
    const ids = [...new Set(cts.filter(c => c.status === 'ativo').map(c => c.prestadorId))];
    await Promise.all(ids.map(async id => { try { docs[id] = CW.fb.lista(await db.collection('documentos').where('empresaId', '==', id).where('compartilhar', '==', true).get()); } catch (e) { /* sem leitura */ } }));
    return { cts, meds, docs, prest: calcular(cts, meds, docs), em: new Date() };
  }

  async function desenhar(el, ctx) {
    const { esc, ic } = U();
    document.getElementById('acoes').innerHTML = `<button class="btn sec" id="rk-atualizar">${ic('swap')}Atualizar</button>`;
    if (!dados) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Conferindo contratos, medições e documentos…</span></div></div>`;
      try { dados = await carregar(ctx); } catch (e) { el.innerHTML = `<div class="card"><div class="empty"><strong>Não foi possível conferir agora.</strong><span>${esc(CW.fb.mensagemErro(e))}</span></div></div>`; return; } }
    const P = dados.prest, n = k => P.filter(p => p.nivel === k).length, pes = P.reduce((a, p) => a + p.pessoas.length, 0);
    const pill = k => `<span class="pill ${NIVEL[k][0]}">${NIVEL[k][1]}</span>`;
    const card = p => `<section class="card rk-p rk-${p.nivel}" id="rk-${esc(p.id)}" style="margin-bottom:18px"><div class="card-h"><span class="ic">${ic('shield')}</span><h3>${esc(p.nome || 'Prestadora')}</h3><span style="margin-left:auto">${pill(p.nivel)}</span></div>
      <div class="card-b stack" style="gap:10px">${p.alertas.length ? p.alertas.map(a => `<div class="banner ${a.nivel === 'alto' ? 'danger' : 'warn'} rk-al" style="margin:0">${ic('alert')}<span><strong>${esc(a.titulo)}</strong>${esc(a.texto)} <b>O que fazer:</b> ${esc(a.fazer)}${a.rota ? ` <button class="linkbtn" data-rk-ir="${esc(a.rota)}" style="display:inline">Abrir</button>` : ''}</span></div>`).join('')
        : `<p class="hint" style="margin:0">Nenhum sinal nos dados do Conectwork. Confira também os pontos que o sistema não vê (no fim da tela).</p>`}
      ${p.pessoas.length ? `<div class="scroll"><table class="resp rk-tab"><thead><tr><th>Profissional</th><th>Desde</th><th class="r">Seguidas</th><th>Sinal</th></tr></thead><tbody>${p.pessoas.map(x => `<tr><td class="m-full"><strong>${esc(x.nome)}</strong></td><td data-r="Desde">${esc(periodoTxt(x.desde))}</td><td class="r" data-r="Seguidas">${x.seq} quinzenas</td><td data-r="Sinal">${x.alertas.map(a => `<span class="pill ${a[0] === 'alto' ? 'danger' : 'warn'}" style="margin:2px 4px 2px 0;white-space:normal">${esc(a[1])}</span>`).join('')}</td></tr>`).join('')}</tbody></table></div>` : ''}</div></section>`;
    el.innerHTML = `
      <div class="nums" id="rk-nums" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:22px">
        <div class="card" style="padding:16px 18px"><small class="hint">Prestadoras</small><div style="font-size:28px;font-weight:600">${P.length}</div></div>
        <div class="card" style="padding:16px 18px"><small class="hint">Risco alto</small><div style="font-size:28px;font-weight:600;color:var(--danger)">${n('alto')}</div></div>
        <div class="card" style="padding:16px 18px"><small class="hint">Atenção</small><div style="font-size:28px;font-weight:600;color:var(--warn)">${n('atencao')}</div></div>
        <div class="card" style="padding:16px 18px"><small class="hint">Profissionais com sinal</small><div style="font-size:28px;font-weight:600">${pes}</div></div></div>
      ${P.length ? P.map(card).join('') : `<div class="card"><div class="empty"><div class="ic">${ic('shield')}</div><strong>Nenhum contrato ou medição ainda.</strong><span>Quando houver contrato com uma prestadora, o termômetro mostra aqui os sinais de cada uma.</span></div></div>`}
      <section class="card" id="rk-nao-ve" style="margin-top:4px"><div class="card-h"><span class="ic">${ic('list')}</span><h3>O que o sistema não vê: confira com a prestadora</h3></div><div class="card-b"><ul style="margin:0;padding-left:20px;line-height:1.7">
        <li>Alguém da equipe foi empregado da sua empresa nos últimos 18 meses?</li>
        <li>Os profissionais recebem ordens direto da sua chefia, e não do supervisor da prestadora?</li>
        <li>Usam uniforme, crachá ou e-mail da sua empresa, ou estão sujeitos a advertência pela sua empresa?</li>
        <li>O profissional só presta serviço para vocês (exclusividade)?</li></ul>
        <p class="hint" style="margin:12px 0 0;font-size:12.5px" id="rk-aviso">${esc(AVISO)} Conferido em ${esc(dados.em.toLocaleString('pt-BR'))}.</p></div></section>`;
    document.getElementById('rk-atualizar').onclick = () => { dados = null; desenhar(el, ctx); };
    el.querySelectorAll('[data-rk-ir]').forEach(b => b.onclick = () => CW.ir(b.dataset.rkIr));
  }

  CW.registrarModulo({
    id: 'riscos', nome: 'Termômetro de risco', nomeCurto: 'Riscos', icone: 'shield', ordem: 26.6, livre: true,
    para: ['empresa'], contrato: ['contratos', 'cobrancas'],
    mostrar: ctx => tipo(ctx) !== 'prestador' && VE.includes(cargo(ctx)),
    iniciar() { dados = null; return () => { dados = null; }; },
    telas: { lista: { nome: 'Termômetro de risco', sub: 'Os sinais de risco de cada prestadora, a partir dos contratos, medições e documentos. Controle preventivo, não garantia.', render: (el, ctx) => desenhar(el, ctx) } }
  });
  CW.riscos = { calcular, quinz };
})();
