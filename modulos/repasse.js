/* Conectwork · Notas dos profissionais MEI (repasse) · 10/11/2026. Plano: docs/PLANO-COBRANCA-NOTAS.md (Etapa 3).
   Exemplo: o Carlos (MEI) trabalhou na Colafix pela Nexus. A medição da Nexus vem do painel do RH com o CNPJ do MEI de cada pessoa.
   Quando a Colafix aprova a medição, a Nexus (admin ou financeiro: o dono) prepara aqui o espelho da nota de cada MEI:
   o Carlos emite a nota para a Nexus pelo valor da linha dele, a Nexus confere e vira conta a pagar da Nexus / a receber do Carlos
   (o mesmo caminho de "Espelhos da nota" e "Pagar e receber").
   - Espelho: espelhos/{medição}_{CNPJ do MEI}, origem 'repasse', tomador = a prestadora, prestador = a empresa do MEI (achada em cnpjs/).
   - O MEI precisa ter conta no Conectwork (cadastro rápido "Sou MEI"); quem ainda não tem recebe um convite para copiar.
   - O prazo de pagamento ao MEI é escolhido pela prestadora ao preparar (padrão: o do contrato com quem contrata).
   - Nada de CPF: só nome, horas, valor e o CNPJ da empresa do MEI. O dinheiro não passa pelo Conectwork. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const PREPARA = ['admin', 'financeiro'];
  let meds = [], esps = [], pronto = false;

  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const pode = ctx => !ctx.soLeitura && PREPARA.includes(cargo(ctx));
  const brl = c => U().formatarDinheiro(c);
  const periodoTxt = p => CW.medicoes ? CW.medicoes.periodoTxt(p) : p;
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const fmtCnpj = c => String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const idEsp = (mId, cnpj) => mId + '_' + cnpj;
  const comMei = m => (m.memoria || []).some(x => x.cnpj);
  const faltam = m => (m.memoria || []).filter(x => x.cnpj && !esps.some(e => e._id === idEsp(m._id, x.cnpj)));
  const endTxt = en => { en = en || {}; return [[en.logradouro, en.numero].filter(Boolean).join(', ') + (en.compl ? ' · ' + en.compl : ''), en.bairro, en.cep ? 'CEP ' + en.cep : ''].filter(Boolean).join(' · '); };
  const horasTxt = h => h == null ? '' : String(Math.round(h * 100) / 100).replace('.', ',') + ' h';
  const ST = { aguardando_nota: ['warn', 'Esperando a nota'], nota_enviada: ['info', 'Nota para conferir'], nota_ok: ['ok', 'Nota conferida'] };
  const pill = s => { const x = ST[s] || ['info', s]; return `<span class="pill ${x[0]}">${U().esc(x[1])}</span>`; };

  /* perfil MEI (o mesmo critério de Agenda e Assistente) */
  const ehMei = ctx => { let p = ''; try { p = sessionStorage.getItem('cw.porte.' + ((ctx.contexto || ctx).empresaId)) || ''; } catch (e) {} return String(p).startsWith('MEI'); };
  const meiSemAprov = ctx => ehMei(ctx) && ['mei', 'analise', 'pendencia'].includes(((ctx.empresa || (ctx.contexto || {}).empresa) || {}).status);

  /* convite para quem ainda não tem conta (copiar ou WhatsApp) */
  function convite(ctx, m, x) {
    const url = ((window.CONECTWORK_CONFIG || {}).urlApp) || location.origin + location.pathname;
    /* 12/11/2026: o link já abre o "Sou MEI" com o CNPJ e o nome preenchidos (?mei=, js/sessao.js) */
    const pn = String(x.nome).split(' ')[0], lk = url.replace(/[?#].*$/, '') + '?mei=' + String(x.cnpj).replace(/\D/g, '') + '&nome=' + encodeURIComponent(pn);
    return `Olá, ${pn}! A ${ctx.contexto.nome} vai receber as suas notas fiscais pelo Conectwork. Faça o cadastro do seu MEI (o CNPJ ${fmtCnpj(x.cnpj)} já vai preenchido): ${lk}\n\nDepois disso, a nota de ${periodoTxt(m.periodo)} (${brl(x.valorCentavos)}) aparece pronta para você emitir.`;
  }

  /* ---------- lista: medições aprovadas com profissionais MEI ---------- */
  function desenharLista(el, ctx) {
    const { esc, ic } = U();
    document.getElementById('acoes').innerHTML = '';
    if (!pronto) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando…</span></div></div>`; return; }
    const xs = meds.slice().sort((a, b) => String(b.periodo).localeCompare(String(a.periodo)));
    el.innerHTML = `<section class="card" id="rp-lista"><div class="card-h"><span class="ic">${ic('users')}</span><h3>Medições aprovadas com profissionais MEI</h3><span class="count">${xs.length}</span></div>
      ${xs.length ? `<div class="scroll"><table class="resp" id="rp-tab"><thead><tr><th>Período</th><th class="r">Profissionais</th><th>Situação</th></tr></thead><tbody>
        ${xs.map(m => { const n = (m.memoria || []).filter(x => x.cnpj).length, f = faltam(m).length;
          return `<tr class="click" data-rp="${esc(m._id)}" tabindex="0"><td class="m-full"><strong>${esc(periodoTxt(m.periodo))}</strong><small>${esc(m.tomadorNome)} · aprovada</small></td>
            <td class="r">${n}</td><td>${f ? `<span class="pill warn">${f} para preparar</span>` : '<span class="pill ok">Notas preparadas</span>'}</td></tr>`; }).join('')}
        </tbody></table></div>`
      : `<div class="empty"><div class="ic">${ic('users')}</div><strong>Nenhuma medição com profissionais MEI.</strong><span>Quando a medição vier do painel do RH com o CNPJ de cada profissional e for aprovada, as notas de cada um são preparadas aqui.</span></div>`}</section>`;
    el.querySelectorAll('[data-rp]').forEach(r => { const ir = () => CW.ir('repasse/ver/' + r.dataset.rp); r.onclick = ir; r.onkeydown = e => { if (e.key === 'Enter') ir(); }; });
  }

  /* ---------- uma medição: cada profissional MEI e a nota dele ---------- */
  async function desenharVer(el, ctx, id) {
    const { esc, ic } = U(), db = CW.fb.db();
    const fim = (tipo, t, txt) => { el.innerHTML = `<div class="banner ${tipo}" id="rp-msg">${ic('alert')}<span><strong>${esc(t)}</strong>${esc(txt)}</span></div><div style="margin-top:14px"><button class="btn sec" id="rp-volta">${ic('back')}Voltar</button></div>`; document.getElementById('rp-volta').onclick = () => CW.ir('repasse'); };
    el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando a medição…</span></div></div>`;
    let m, c = {}, emp, pv;
    try {
      m = CW.fb.dados(await db.doc('medicoes/' + id).get());
      if (!m) return fim('danger', 'Medição não encontrada', 'Ela pode ter sido aberta por um link antigo.');
      if (m.prestadorId !== ctx.contexto.empresaId) return fim('warn', 'Esta medição não é da sua empresa', 'Só a prestadora prepara as notas dos profissionais dela.');
      if (m.status !== 'aprovada') return fim('warn', 'A medição ainda não foi aprovada', 'As notas dos profissionais são preparadas depois que a empresa que contrata aprova a medição.');
      const [cc, ee, pp] = await Promise.all([db.doc('contratos/' + m.contratoId).get().catch(() => null), db.doc('empresas/' + m.prestadorId).get(), db.doc('empresas/' + m.prestadorId + '/privado/cadastro').get().catch(() => null)]);
      c = (cc && CW.fb.dados(cc)) || {}; emp = CW.fb.dados(ee) || ctx.contexto.empresa || {}; pv = (pp && CW.fb.dados(pp)) || {};
    } catch (err) { return fim('danger', 'Não foi possível abrir a medição', CW.fb.mensagemErro(err)); }
    m._id = id;
    document.getElementById('titulo').textContent = 'Notas dos profissionais · ' + periodoTxt(m.periodo);
    /* a empresa de cada MEI no Conectwork, pelo CNPJ */
    const its = (m.memoria || []).map((x, i) => Object.assign({ i }, x)).filter(x => x.cnpj);
    await Promise.all(its.map(async x => { try { const d = CW.fb.dados(await db.doc('cnpjs/' + x.cnpj).get()); x.empId = d ? d.empresaId : null; } catch (e) { x.empId = null; } }));
    const espDe = x => esps.find(e => e._id === idEsp(id, x.cnpj));
    const prontos = its.filter(x => x.empId && !espDe(x)), semConta = its.filter(x => !x.empId && !espDe(x));
    const venc0 = Number.isInteger(c.vencimentoDias) ? c.vencimentoDias : 1;
    const linha = x => { const e = espDe(x);
      const sit = e ? `${pill(e.status)} <a class="linkbtn" href="#espelhos/ver/${esc(e._id)}" style="font-size:12.5px">ver</a>`
        : x.empId ? '<span class="pill info">Pronto para preparar</span>'
        : `<span class="pill">Ainda sem conta no Conectwork</span><br><button class="linkbtn" data-conv="${x.i}" style="font-size:12.5px">${ic('copy')}Copiar convite</button> <a class="linkbtn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(convite(ctx, m, x))}" style="font-size:12.5px">WhatsApp</a>`;
      return `<tr data-it="${x.i}"><td class="m-full"><strong>${esc(x.nome)}</strong><small>MEI ${esc(fmtCnpj(x.cnpj))}</small></td><td class="r">${esc(horasTxt(x.horas)) || '—'}</td><td class="r"><b>${esc(brl(x.valorCentavos))}</b></td><td>${sit}</td></tr>`; };
    const semMei = (m.memoria || []).filter(x => !x.cnpj);
    el.innerHTML = `<div style="margin-bottom:14px"><button class="linkbtn" id="rp-voltar">${ic('back')}Voltar</button></div>
      <div class="banner info" id="rp-aviso">${ic('users')}<span><strong>${esc(m.tomadorNome)} aprovou a medição de ${esc(periodoTxt(m.periodo))}</strong>Cada profissional MEI emite a nota dele para a ${esc(ctx.contexto.nome)} pelo valor da linha. Você confere a nota e paga direto ao profissional: o dinheiro não passa pelo Conectwork.</span></div>
      <section class="card" id="rp-its" style="margin-top:14px"><div class="card-h"><span class="ic">${ic('users')}</span><h3>Profissionais MEI</h3><span class="count">${its.length}</span></div>
        <div class="scroll"><table class="resp" id="rp-tab-its"><thead><tr><th>Profissional</th><th class="r">Horas</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${its.map(linha).join('')}</tbody></table></div>
        ${semMei.length ? `<div class="card-b" style="padding-top:0"><p class="hint" style="margin:0;font-size:12.5px">${semMei.length} ${semMei.length === 1 ? 'profissional veio' : 'profissionais vieram'} sem o CNPJ do MEI (${esc(semMei.map(x => x.nome).join(', '))}): confira o CNPJ no cadastro do painel do RH.</p></div>` : ''}
        ${prontos.length && pode(ctx) ? `<div class="card-b stack" style="gap:12px;border-top:1px solid var(--line)">
          <label class="f" style="max-width:320px"><span>Pagar ao profissional quantos dias depois da nota conferida?</span><input id="rp-venc" type="number" min="0" max="90" step="1" inputmode="numeric" value="${venc0}"></label>
          <p class="hint" style="margin:-6px 0 0;font-size:12.5px">Vale para as notas preparadas agora. O padrão é o prazo do contrato com a ${esc(m.tomadorNome)}.</p>
          <p class="err" id="rp-erro" role="alert"></p>
          <div><button class="btn" id="rp-preparar">${ic('send')}Preparar ${prontos.length === 1 ? 'a nota' : 'as ' + prontos.length + ' notas'} e avisar ${prontos.length === 1 ? 'o profissional' : 'os profissionais'}</button></div></div>` : ''}
        ${!pode(ctx) && prontos.length ? `<div class="card-b" style="padding-top:0"><p class="hint" style="margin:0">Quem prepara as notas é o administrador ou o financeiro da empresa.</p></div>` : ''}
      </section>
      ${(CW.sessao.estado() || {}).master && its.some(x => x.empId) ? '<section class="card" id="rp-emissor" style="margin-top:14px"></section>' : ''}
      ${semConta.length ? `<p class="hint" style="margin:12px 0 0;font-size:12.5px" id="rp-semconta">${semConta.length} ${semConta.length === 1 ? 'profissional ainda não tem' : 'profissionais ainda não têm'} conta no Conectwork. Mande o convite: quando ${semConta.length === 1 ? 'ele entrar' : 'entrarem'} como MEI com o CNPJ, a nota fica pronta para preparar aqui.</p>` : ''}`;
    const emBox = document.getElementById('rp-emissor'); if (emBox) blocoEmissor(emBox, ctx, m, its.filter(x => x.empId));
    document.getElementById('rp-voltar').onclick = () => CW.ir('repasse');
    el.querySelectorAll('[data-conv]').forEach(b => b.onclick = () => { const x = its.find(y => String(y.i) === b.dataset.conv); copiar(convite(ctx, m, x)); });
    const bt = document.getElementById('rp-preparar');
    if (bt) bt.onclick = async () => {
      const er = document.getElementById('rp-erro'), v = Number(document.getElementById('rp-venc').value);
      if (!Number.isInteger(v) || v < 0 || v > 90) { er.textContent = 'Informe o prazo em dias, de 0 a 90.'; return; }
      const en = pv.end || {};
      const tom = { razao: emp.razao || emp.nome || '', cnpj: emp.cnpj || '', im: (pv.dados || {}).im || '', endereco: endTxt(en), cidade: en.cidade || '', uf: en.uf || '' };
      if (!tom.cnpj || !tom.razao) { er.textContent = 'Faltam a razão social ou o CNPJ da sua empresa. Confira em Minha empresa.'; return; }
      bt.disabled = true; let feitos = 0, erro = '';
      for (const x of prontos) {   /* uma gravação por profissional (cada uma confere a linha da medição e o CNPJ) */
        const b = db.batch(), agora = CW.fb.agora, eid = idEsp(id, x.cnpj);
        const desc = `Prestação de serviços à ${tom.razao}${x.horas != null ? ': ' + horasTxt(x.horas).replace(' h', ' horas') : ''} no período de ${periodoTxt(m.periodo)}, conforme medição aprovada.`;
        b.set(db.doc('espelhos/' + eid), { medicaoId: id, contratoId: null, tomadorId: m.prestadorId, prestadorId: x.empId, partes: [m.prestadorId, x.empId],
          tomadorNome: ctx.contexto.nome, prestadorNome: x.nome, prestadorCnpj: fmtCnpj(x.cnpj), prestadorCnpjNum: x.cnpj, tomador: tom, item: x.i, horas: x.horas == null ? null : x.horas,
          periodo: m.periodo, competencia: String(m.periodo).slice(0, 7), descricao: desc, origem: 'repasse', osNumero: null, valorCentavos: x.valorCentavos,
          retencoes: { iss: 0, inss: 0, ir: 0, pcc: 0 }, liquidoCentavos: x.valorCentavos, vencimentoDias: v, obs: '', status: 'aguardando_nota', versao: 1,
          criadoPor: ctx.sessao.usuario.uid, criadoPorNome: quem(ctx), criadoEm: agora(), atualizadoPor: ctx.sessao.usuario.uid, atualizadoPorNome: quem(ctx), atualizadoEm: agora() });
        b.set(db.collection('log').doc(), { em: agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao: 'espelho.repasse',
          texto: `Nota do profissional ${x.nome} (MEI ${fmtCnpj(x.cnpj)}) preparada: ${periodoTxt(m.periodo)}, ${brl(x.valorCentavos)}, pagamento ${v} dia${v === 1 ? '' : 's'} depois da nota conferida.`, ref: eid });
        try { await b.commit(); feitos++; if (!esps.some(y => y._id === eid)) esps.push({ _id: eid, origem: 'repasse', status: 'aguardando_nota' }); } catch (e) { erro = `${x.nome}: ${CW.fb.mensagemErro(e)}`; break; }
      }
      if (feitos) U().toast(feitos === 1 ? 'Nota preparada. O profissional já vê em "Notas a emitir".' : `${feitos} notas preparadas. Cada profissional já vê em "Notas a emitir".`);
      if (erro) { er.textContent = erro; bt.disabled = false; }
      setTimeout(() => desenharVer(el, ctx, id), 400);
    };
  }

  /* quem emite as notas pelos MEIs (13/11/2026): a equipe Conectwork dá a uma pessoa da prestadora acesso "operacional"
     em cada empresa MEI desta medição (acessos/{MEI}_{uid}, emissorPor = a prestadora). Ela emite tudo em "Notas dos MEIs". */
  async function blocoEmissor(box, ctx, m, comConta) {
    const { esc, ic } = U(), db = CW.fb.db(), prest = m.prestadorId;
    box.innerHTML = `<div class="card-b"><div class="giro"></div></div>`;
    let equipe = [], ja = {};
    try {
      equipe = CW.fb.lista(await db.collection('acessos').where('empresaId', '==', prest).get()).filter(a => a.ativo && a.uid);
      const outros = CW.fb.lista(await db.collection('acessos').where('emissorPor', '==', prest).get()).filter(a => a.ativo);
      outros.forEach(a => { (ja[a.uid] = ja[a.uid] || new Set()).add(a.empresaId); });
    } catch (err) { box.innerHTML = `<div class="card-b"><p class="err">${esc(CW.fb.mensagemErro(err))}</p></div>`; return; }
    const emps = [...new Set(comConta.map(x => x.empId))];
    const cargoDe = {}; try { CW.fb.lista(await db.collection('acessos').where('emissorPor', '==', prest).get()).forEach(a => { cargoDe[a.empresaId + '_' + a.uid] = a.cargo; }); } catch (e) { /* */ }
    const falta = (uid, paga) => emps.filter(e => !(ja[uid] && ja[uid].has(e)) || (paga && cargoDe[e + '_' + uid] !== 'financeiro'));
    const emissores = equipe.filter(a => ja[a.uid]);
    box.innerHTML = `<div class="card-h"><span class="ic">${ic('users')}</span><h3>Quem emite as notas dos MEIs</h3></div><div class="card-b stack" style="gap:12px">
      <p style="margin:0;font-size:13.5px">Se uma pessoa da ${esc(m.prestadorNome)} emite as notas no lugar dos profissionais, dê a ela acesso aos MEIs desta medição. Ela vê todas as notas em <b>Notas dos MEIs</b>, com o login dela.</p>
      ${emissores.length ? `<ul style="margin:0;padding-left:18px;font-size:13.5px" id="rp-em-lista">${emissores.map(a => { const f = falta(a.uid).length, paga = [...ja[a.uid]].some(e => cargoDe[e + '_' + a.uid] === 'financeiro'), pagaPrest = ['admin', 'tesouraria'].includes(a.cargo);
        return `<li><b>${esc(a.nome || a.email)}</b> · ${paga ? 'emite e cuida do Pix' : 'emite'} por ${ja[a.uid].size} MEI${ja[a.uid].size === 1 ? '' : 's'}${f ? ` · <span class="pill warn">${f} desta medição sem acesso</span>` : ''}${paga ? (pagaPrest ? ` · paga pela ${esc(m.prestadorNome)} (${esc(a.cargo)})` : ` · <span class="pill warn">para pagar, o cargo na ${esc(m.prestadorNome)} precisa ser Tesouraria</span> <button class="linkbtn" data-em-tes="${esc(a.uid)}" style="font-size:12.5px">mudar para Tesouraria</button>`) : ''}</li>`; }).join('')}</ul>` : ''}
      ${equipe.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="f" style="margin:0;min-width:220px"><span>Pessoa da ${esc(m.prestadorNome)}</span><select id="rp-em-quem">${equipe.map(a => `<option value="${esc(a.uid)}">${esc(a.nome || a.email)} · ${esc(a.cargo)}</option>`).join('')}</select></label>
        <label class="f" style="margin:0;min-width:220px"><span>O que ela faz</span><select id="rp-em-oque"><option value="emite">Só emite as notas</option><option value="paga">Emite as notas e paga (cuida do Pix)</option></select></label>
        <button class="btn" id="rp-em-dar">${ic('check')}Dar acesso aos ${emps.length} MEI${emps.length === 1 ? '' : 's'} desta medição</button></div>
        <p class="hint" style="margin:0;font-size:12.5px">"Emite e paga": ela também anota o Pix de cada profissional (vale para as próximas quinzenas) e, com o cargo Tesouraria na ${esc(m.prestadorNome)}, agenda e confirma o pagamento. Quem libera o pagamento continua sendo outra pessoa.</p>` : `<p class="hint" style="margin:0">A ${esc(m.prestadorNome)} ainda não tem ninguém na equipe. Convide a pessoa em Usuários e acessos da ${esc(m.prestadorNome)} primeiro.</p>`}
      <p class="err" id="rp-em-erro" role="alert"></p></div>`;
    const st = CW.sessao.estado(), eu = CW.fb.auth().currentUser, quemEu = (st.perfil && st.perfil.nome) || eu.email, agora = CW.fb.agora;
    box.querySelectorAll('[data-em-tes]').forEach(l => l.onclick = async () => { const p = equipe.find(a => a.uid === l.dataset.emTes); if (!p) return;
      if (!(await U().confirmar('Mudar o cargo para Tesouraria?', `${p.nome || p.email} passa a ter o cargo Tesouraria na ${m.prestadorNome}: agenda e confirma os pagamentos liberados. Hoje é ${p.cargo}.`, 'Mudar'))) return;
      const b = db.batch(); b.update(db.doc('acessos/' + prest + '_' + p.uid), { cargo: 'tesouraria', atualizadoEm: agora() });
      b.set(db.collection('log').doc(), { em: agora(), uid: eu.uid, quem: quemEu, empresaId: prest, acao: 'acesso.cargo', texto: `${p.nome || p.email}: cargo ${p.cargo} → tesouraria (paga as notas dos MEIs; equipe Conectwork).`, ref: p.uid });
      try { await b.commit(); U().toast('Cargo mudado para Tesouraria.'); blocoEmissor(box, ctx, m, comConta); } catch (err) { U().toast(CW.fb.mensagemErro(err), 'erro'); } });
    const bt = box.querySelector('#rp-em-dar'); if (!bt) return;
    bt.onclick = async () => {
      const uid = box.querySelector('#rp-em-quem').value, paga = box.querySelector('#rp-em-oque').value === 'paga', p = equipe.find(a => a.uid === uid), f = falta(uid, paga);
      if (!p) return; if (!f.length) { U().toast((p.nome || p.email) + ' já tem esse acesso em todos os MEIs desta medição.'); return; }
      bt.disabled = true;
      const b = db.batch(), cg = paga ? 'financeiro' : 'operacional';
      f.forEach(e => { if (ja[uid] && ja[uid].has(e)) b.update(db.doc('acessos/' + e + '_' + uid), { cargo: cg, atualizadoEm: agora() });
        else b.set(db.doc('acessos/' + e + '_' + uid), { uid, empresaId: e, nome: p.nome || '', email: p.email || '', cargo: cg, extras: [], sem: [], ativo: true,
          emissorPor: prest, emissorPorNome: m.prestadorNome, criadoEm: agora(), criadoPor: eu.uid }); });
      b.set(db.collection('log').doc(), { em: agora(), uid: eu.uid, quem: quemEu, empresaId: prest, acao: 'acesso.emissor',
        texto: `${p.nome || p.email} passa a ${paga ? 'emitir as notas e cuidar do Pix' : 'emitir as notas'} de ${f.length} profissional(is) MEI pela ${m.prestadorNome} (liberado pela equipe Conectwork).`, ref: m._id });
      try { await b.commit(); U().toast(`Pronto: ${p.nome || p.email} já vê as notas em "Notas dos MEIs".`); blocoEmissor(box, ctx, m, comConta); }
      catch (err) { bt.disabled = false; box.querySelector('#rp-em-erro').textContent = CW.fb.mensagemErro(err); }
    };
  }

  async function copiar(txt) {
    try { await navigator.clipboard.writeText(txt); }
    catch (e) { const t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) {} t.remove(); }
    U().toast('Convite copiado. Mande para o profissional.');
  }

  CW.registrarModulo({
    id: 'repasse', nome: 'Notas dos profissionais', icone: 'users', ordem: 27.2, menu: false,
    para: ['empresa'], contrato: ['contratos', 'cobrancas'],
    mostrar: ctx => PREPARA.includes(((ctx.acesso) || {}).cargo),
    iniciar(ctx) {
      meds = []; esps = []; pronto = false;
      const db = CW.fb.db(), emp = ctx.contexto.empresaId, ok = { m: false, e: false };
      const redesenha = () => {
        if (!(ok.m && ok.e)) return; pronto = true;
        const el = document.getElementById('view'), at = CW.app.atual();
        if (el && at && at.modulo === 'repasse' && at.tela === 'lista') desenharLista(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() }));
        CW.app.pendenciasMudaram();
      };
      CW.inscrever('repasse-m', () => db.collection('medicoes').where('prestadorId', '==', emp), s => { meds = CW.fb.lista(s).filter(m => m.status === 'aprovada' && comMei(m)); ok.m = true; redesenha(); }, () => { ok.m = true; redesenha(); });
      CW.inscrever('repasse-e', () => db.collection('espelhos').where('tomadorId', '==', emp), s => { esps = CW.fb.lista(s).filter(e => e.origem === 'repasse'); ok.e = true; redesenha(); }, () => { ok.e = true; redesenha(); });
      return () => { pronto = false; };
    },
    pendencias(ctx) {
      if (!pronto || !pode(ctx)) return [];
      return meds.filter(m => faltam(m).length).map(m => { const n = faltam(m).length;
        return { txt: 'Preparar as notas dos profissionais MEI', sub: `${m.tomadorNome} · ${periodoTxt(m.periodo)} · ${n} ${n === 1 ? 'profissional' : 'profissionais'}`, rota: 'repasse/ver/' + m._id }; });
    },
    telas: {
      lista: { nome: 'Notas dos profissionais', sub: 'Medições aprovadas: cada profissional MEI emite a nota dele para a sua empresa.', render: (el, ctx) => desenharLista(el, ctx) },
      ver: { nome: 'Notas dos profissionais', sub: 'Cada profissional MEI emite a nota dele pelo valor da linha da medição.', render: (el, ctx) => desenharVer(el, ctx, ctx.params[0]) }
    }
  });
  CW.repasse = { ehMei, meiSemAprov };
})();
