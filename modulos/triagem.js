/* Conectwork · Triagem do contrato (Lei 6.019/1974, arts. 5º-C e 5º-D; CLAUDE.md).
   Controle preventivo feito por quem contrata (administrador) antes de assinar: perguntas sobre entrega x posto, supervisor
   da prestadora, ordens diretas, jornada controlada, exclusividade e relação nos últimos 18 meses.
   Resultado: "compatível", "requer análise jurídica" (só assina depois de registrar o parecer) ou "não publicar neste modelo"
   (não assina). As regras do banco recalculam o resultado: ninguém escolhe o resultado à mão.
   Não é certificado jurídico. */
(function () {
  const CW = window.CW = window.CW || {};
  const U = () => CW.ui;
  /* [chave, pergunta, explicação, resposta que é risco ('sim'|'nao'), 'risco'|'bloqueio'] */
  const PERG = [
    ['entrega', 'O contrato é por um serviço definido (uma atividade ou um resultado), e não para preencher vagas da sua empresa?', 'Terceirizar é contratar o serviço, não alugar pessoas para postos de trabalho.', 'nao', 'risco'],
    ['supervisor', 'A prestadora tem supervisor próprio que organiza a equipe e dá as orientações do dia a dia?', 'Quem dirige o trabalho é a prestadora.', 'nao', 'risco'],
    ['ordens', 'Alguém da sua empresa vai dar ordens diretas às pessoas da equipe (tarefas do dia, advertências, escala)?', 'Pedidos e ajustes do serviço vão para o interlocutor da prestadora.', 'sim', 'risco'],
    ['jornada', 'A sua empresa vai controlar o ponto ou a jornada das pessoas da equipe?', 'O controle de jornada é da prestadora, que é a empregadora.', 'sim', 'risco'],
    ['exclusiv', 'Só podem trabalhar pessoas escolhidas pela sua empresa, sem a prestadora poder trocar quem faz o serviço?', 'A prestadora precisa poder substituir as pessoas da equipe.', 'sim', 'risco'],
    ['exempregado', 'Alguém da equipe foi demitido da sua empresa há menos de 18 meses?', 'Art. 5º-D: quem foi demitido não pode voltar como empregado da prestadora antes de 18 meses.', 'sim', 'bloqueio'],
    ['socio', 'Algum sócio da prestadora trabalhou para a sua empresa (com ou sem carteira) nos últimos 18 meses?', 'Art. 5º-C: a prestadora não pode ter como sócio quem trabalhou para a contratante nos últimos 18 meses (exceto aposentado).', 'sim', 'bloqueio']
  ];
  /* mesmas chaves (as regras do banco recalculam igual), perguntas próprias do serviço por entrega com profissional PJ/MEI */
  const PERG_OS = [
    ['entrega', 'Cada trabalho será uma entrega definida (resultado), combinada por ordem de serviço com escopo, prazo e valor?', 'Pagar por entrega, não por hora ou por mês fixo.', 'nao', 'risco'],
    ['supervisor', 'O profissional decide como, quando e onde faz o trabalho, com as próprias ferramentas?', 'Autonomia é o que diferencia o profissional de um empregado.', 'nao', 'risco'],
    ['ordens', 'Alguém da sua empresa vai dar ordens diretas, cobrar presença ou aplicar advertências ao profissional?', 'Ajustes do trabalho entram na ordem de serviço ou na divergência da entrega.', 'sim', 'risco'],
    ['jornada', 'Vai existir horário fixo, controle de ponto ou registro de entrada e saída do profissional?', 'O Conectwork não faz controle de ponto de profissional.', 'sim', 'risco'],
    ['exclusiv', 'O profissional fica impedido de atender outros clientes ou de mandar outra pessoa fazer a entrega?', 'Ele pode ter outros clientes e se fazer substituir.', 'sim', 'risco'],
    ['exempregado', 'O profissional foi empregado (com carteira) da sua empresa nos últimos 18 meses?', 'Contratar como PJ quem foi empregado há menos de 18 meses é o sinal mais forte de pejotização (Lei 6.019, arts. 5º-C e 5º-D).', 'sim', 'bloqueio'],
    ['socio', 'A contratação substitui um empregado que vai ser (ou foi) desligado para voltar como PJ?', 'Trocar a carteira por PJ para o mesmo trabalho não é terceirização: é vínculo de emprego.', 'sim', 'bloqueio']
  ];
  const pergDe = c => (c && c.modalidade === 'os') ? PERG_OS : PERG;
  const RES = { compativel: ['ok', 'Compatível'], analise_juridica: ['warn', 'Requer análise jurídica'], nao_publicar: ['danger', 'Não publicar neste modelo'] };
  function calcular(r) {
    const marca = t => PERG.some(([k, , , risco, tipo]) => tipo === t && r[k] === risco);
    return marca('bloqueio') ? 'nao_publicar' : marca('risco') ? 'analise_juridica' : 'compativel';
  }
  /* pode assinar? compatível, ou análise jurídica com o parecer registrado */
  const libera = c => { const t = c && c.triagem; return !!t && (t.resultado === 'compativel' || (t.resultado === 'analise_juridica' && !!(t.parecer && t.parecer.ok))); };
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const AVISO = 'A triagem é um controle preventivo, não um certificado jurídico. O Conectwork organiza a contratação e a gestão documental. A validade da relação depende da operação real, da legislação aplicável e da análise jurídica e contábil adequada.';

  function bloco(box, ctx, c, refazer) {
    if (!box || ['cancelado', 'encerrado'].includes(c.status)) { if (box) box.innerHTML = ''; return; }
    const { esc, ic, formatarDataHora } = U(), t = c.triagem, souTom = c.tomadorId === ctx.contexto.empresaId;
    const pode = souTom && !ctx.soLeitura && ctx.contexto.acesso.cargo === 'admin';
    const r = t && RES[t.resultado];
    box.innerHTML = `<section class="card" id="tr-card"><div class="card-h"><span class="ic">${ic('shield')}</span><h3>Triagem do contrato</h3>${r ? `<span style="margin-left:auto" class="pill ${r[0]}" id="tr-res">${esc(r[1])}</span>` : ''}</div><div class="card-b stack" style="gap:12px">
      ${!t ? `<p style="margin:0;font-size:13.5px">${souTom ? 'Antes de assinar, responda 7 perguntas rápidas sobre como o serviço vai funcionar (Lei 6.019).' : 'A empresa que contrata faz a triagem antes de assinar.'}</p>`
        : `<p style="margin:0;font-size:13px" class="hint">Feita por ${esc(t.nome)} em ${esc(formatarDataHora(t.em))}.</p>
          ${t.resultado === 'analise_juridica' ? (t.parecer && t.parecer.ok ? `<div class="banner ok">${ic('check')}<span><strong>Parecer jurídico registrado</strong>${esc(t.parecer.obs)} · ${esc(t.parecer.nome)}</span></div>` : `<div class="banner warn" id="tr-aviso">${ic('alert')}<span><strong>Precisa de análise jurídica antes de assinar</strong>${pergDe(c).filter(([k, , , risco, tp]) => tp === 'risco' && t.r[k] === risco).map(p => esc(p[2])).join(' ')}</span></div>`) : ''}
          ${t.resultado === 'nao_publicar' ? `<div class="banner danger" id="tr-aviso">${ic('alert')}<span><strong>Este serviço não deve ser contratado neste modelo</strong>${pergDe(c).filter(([k, , , risco, tp]) => tp === 'bloqueio' && t.r[k] === risco).map(p => esc(p[2])).join(' ')}${c.status === 'ativo' ? ' O contrato já está ativo: converse com o jurídico sobre encerrar o serviço.' : ''}</span></div>` : ''}`}
      ${pode ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${!t || c.status === 'assinatura' || c.status === 'ativo' ? `<button class="btn ${t ? 'sec' : ''}" id="tr-fazer">${ic('shield')}${t ? 'Refazer a triagem' : 'Fazer a triagem'}</button>` : ''}
        ${t && t.resultado === 'analise_juridica' && !(t.parecer && t.parecer.ok) ? `<button class="btn" id="tr-parecer">${ic('check')}Registrar o parecer jurídico</button>` : ''}</div>` : ''}
      <p class="hint" style="margin:0;font-size:12px">${esc(AVISO)}</p></div></section>`;
    const f = document.getElementById('tr-fazer'); if (f) f.onclick = () => fazer(ctx, c, refazer);
    const p = document.getElementById('tr-parecer'); if (p) p.onclick = () => parecer(ctx, c, refazer);
  }

  const log = (b, ctx, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });

  async function fazer(ctx, c, refazer) {
    const { esc } = U(), ant = (c.triagem && c.triagem.r) || {}, PQ = pergDe(c);
    let r = null;
    await U().dialogo({ titulo: 'Triagem do contrato', sub: `${c.prestadorNome} · responda como o serviço vai funcionar na prática.`,
      corpo: `<div class="stack" style="gap:14px">${PQ.map(([k, q, ex], i) => `<div class="tr-q" data-k="${k}"><p style="margin:0 0 6px;font-size:13.5px;font-weight:500">${i + 1}. ${esc(q)}</p><p class="hint" style="margin:0 0 8px;font-size:12px">${esc(ex)}</p>
          <div class="tr-op" role="radiogroup"><button type="button" class="tr-b ${ant[k] === 'sim' ? 'on' : ''}" data-v="sim">Sim</button><button type="button" class="tr-b ${ant[k] === 'nao' ? 'on' : ''}" data-v="nao">Não</button></div></div>`).join('')}
        <p class="err" id="tr-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Ver o resultado', valor: 'ok', antes: d => {
        const x = {}; let falta = 0;
        PQ.forEach(([k], i) => { const b = d.querySelector(`.tr-q[data-k="${k}"] .tr-b.on`); if (b) x[k] = b.dataset.v; else if (!falta) falta = i + 1; });
        if (falta) { d.querySelector('#tr-erro').textContent = `Responda a pergunta ${falta}.`; return false; }
        r = x; return true; } }],
      aoAbrir: d => d.querySelectorAll('.tr-op').forEach(g => g.querySelectorAll('.tr-b').forEach(b => b.onclick = () => { g.querySelectorAll('.tr-b').forEach(x => x.classList.toggle('on', x === b)); d.querySelector('#tr-erro').textContent = ''; })) });
    if (!r) return;
    const resultado = calcular(r), db = CW.fb.db(), b = db.batch();
    b.update(db.doc('contratos/' + c._id), { triagem: { r, resultado, parecer: null, uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: CW.fb.agora() }, atualizadoEm: CW.fb.agora() });
    log(b, ctx, 'contrato.triagem', `Triagem do contrato com ${c.prestadorNome}: ${RES[resultado][1].toLowerCase()}.`, c._id);
    try { await b.commit(); U().toast('Triagem registrada: ' + RES[resultado][1].toLowerCase() + '.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    refazer();
  }

  async function parecer(ctx, c, refazer) {
    let obs = null;
    await U().dialogo({ titulo: 'Parecer jurídico', sub: 'Registre quem analisou e a conclusão. O parecer completo fica com o jurídico da empresa.',
      corpo: `<label class="f"><span>Quem analisou e o que concluiu</span><textarea id="pj-obs" rows="3" maxlength="300" placeholder="Ex.: Escritório X, parecer de 05/11: pode contratar com supervisor da prestadora no local."></textarea></label>
        <label class="check" style="margin-top:10px"><input type="checkbox" id="pj-ok"> <span>O parecer jurídico é favorável a contratar este serviço neste modelo.</span></label><p class="err" id="pj-erro"></p>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Registrar', valor: 'ok', antes: d => { const v = d.querySelector('#pj-obs').value.trim();
        if (v.length < 10) { d.querySelector('#pj-erro').textContent = 'Escreva quem analisou e a conclusão.'; return false; }
        if (!d.querySelector('#pj-ok').checked) { d.querySelector('#pj-erro').textContent = 'Só registre se o parecer for favorável.'; return false; } obs = v; return true; } }] });
    if (!obs) return;
    const db = CW.fb.db(), b = db.batch();
    b.update(db.doc('contratos/' + c._id), { triagem: Object.assign({}, c.triagem, { parecer: { ok: true, obs, uid: ctx.sessao.usuario.uid, nome: quem(ctx), em: CW.fb.agora() } }), atualizadoEm: CW.fb.agora() });
    log(b, ctx, 'contrato.parecer', `Parecer jurídico favorável registrado no contrato com ${c.prestadorNome}: ${obs}`, c._id);
    try { await b.commit(); U().toast('Parecer registrado. Agora dá para assinar.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    refazer();
  }

  CW.triagem = { PERG, PERG_OS, pergDe, RES, calcular, libera, bloco };
})();
