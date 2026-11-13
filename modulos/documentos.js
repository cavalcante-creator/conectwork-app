/* Conectwork · Documentos e certidões da empresa (arquivos de verdade, com vencimento).
   - Cadastro: contrato social (ou CCMEI), cartão CNPJ, comprovante de endereço, documento do responsável. A equipe Conectwork
     abre os arquivos na análise do cadastro. Não são compartilhados com outras empresas.
   - Certidões (federal, FGTS, trabalhista, municipal) e segurança do trabalho (PGR, PCMSO): obrigatórias para quem presta
     serviço em equipe contínua (CLAUDE.md). Têm validade; o app avisa 15 dias antes e mostra "vencido".
     São compartilhadas com as empresas que contratam (que veem a situação no contrato e no pagamento).
   - Enviar de novo um tipo substitui o anterior (o antigo fica guardado como "substituído"). Nada se apaga.
   - Arquivo guardado no banco em pedaços (até 5 MB), como as notas. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const ENVIA = ['admin', 'financeiro', 'rh', 'operacional'];
  const MAX = 5 * 1024 * 1024, PEDACO = 700000, AVISO_DIAS = 15;
  const LINKS = {
    cnd_federal: 'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
    crf_fgts: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
    cndt: 'https://cndt-certidao.tst.jus.br/inicio.faces',
    cartao: 'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp'
  };
  const SITE = { cnd_federal: 'site da certidão federal', crf_fgts: 'site do FGTS (Caixa)', cndt: 'site da certidão trabalhista (TST)', cartao: 'site do cartão CNPJ' };
  /* [tipo, nome, grupo, validade?, compartilhar?] */
  const TIPOS = [
    ['contrato', 'Contrato social ou última alteração (ou CCMEI)', 'cadastro', false, false],
    ['cartao', 'Cartão CNPJ', 'cadastro', false, false],
    ['endereco', 'Comprovante de endereço da empresa', 'cadastro', false, false],
    ['identidade', 'Documento com foto do responsável legal', 'cadastro', false, false],
    ['cnd_federal', 'Certidão de débitos federais (Receita e PGFN)', 'certidao', true, true],
    ['crf_fgts', 'Certificado de regularidade do FGTS (CRF)', 'certidao', true, true],
    ['cndt', 'Certidão negativa de débitos trabalhistas (CNDT)', 'certidao', true, true],
    ['cnd_municipal', 'Certidão de débitos municipais', 'certidao', true, true],
    ['cnd_estadual', 'Certidão de débitos estaduais', 'certidao', true, true],
    ['pgr', 'PGR · Programa de Gerenciamento de Riscos', 'seguranca', true, true],
    ['pcmso', 'PCMSO · Programa de Controle Médico de Saúde Ocupacional', 'seguranca', true, true],
    ['seguro', 'Seguro de vida em grupo da equipe', 'seguranca', true, true],
    ['outro', 'Outro documento', 'outro', false, false]
  ];
  const GRUPOS = { cadastro: 'Documentos do cadastro', certidao: 'Certidões', seguranca: 'Segurança do trabalho', outro: 'Outros' };
  const CERTS = ['cnd_federal', 'crf_fgts', 'cndt', 'cnd_municipal'];
  const OBRIG_PRESTA = CERTS.concat(['pgr', 'pcmso']);   /* equipe contínua: certidões e segurança do trabalho */
  /* serviço por entrega: só as certidões (o MEI sem empregado é dispensado de PGR e PCMSO, NR-1 item 1.8.4) */
  const obrigContrato = c => (c && c.modalidade === 'os') ? CERTS : OBRIG_PRESTA;
  let meuPorte = '';
  const OBRIG_TODOS = ['contrato', 'cartao', 'endereco', 'identidade'];
  const tipoDe = k => TIPOS.find(t => t[0] === k) || ['outro', 'Outro documento', 'outro', false, false];
  const presta = emp => ['prestador', 'ambos'].includes((emp || {}).tipo);
  /* os do cadastro são cobrados enquanto a empresa está em análise (a equipe Conectwork confere); depois ficam como registro */
  const obrigatorios = emp => ((emp || {}).status === 'aprovado' ? [] : OBRIG_TODOS).concat(presta(emp) ? (String(meuPorte).startsWith('MEI') ? CERTS : OBRIG_PRESTA) : []);
  const cargo = ctx => ctx.contexto.acesso && ctx.contexto.acesso.cargo;
  const podeEnviar = ctx => !ctx.soLeitura && ENVIA.includes(cargo(ctx));
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hoje = () => iso(new Date());
  const emDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const dataTxt = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const ms = v => !v ? 0 : typeof v.toMillis === 'function' ? v.toMillis() : v.seconds ? v.seconds * 1000 : (Date.parse(v) || 0);
  const tamTxt = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const log = (b, ctx, acao, texto, ref) => b.set(CW.fb.db().collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: ctx.contexto.empresaId, acao, texto, ref: ref || '' });

  /* situação de cada tipo: o documento vigente mais recente */
  function situacao(docs, tipos) {
    const vig = {}; docs.filter(d => d.status === 'vigente').forEach(d => { const a = vig[d.tipo]; if (!a || ms(d.criadoEm) > ms(a.criadoEm)) vig[d.tipo] = d; });
    const h = hoje(), lim = emDias(AVISO_DIAS);
    return tipos.map(k => { const d = vig[k], t = tipoDe(k);
      let st = 'ok', txt = 'Em dia';
      if (!d) { st = 'falta'; txt = 'Falta enviar'; }
      else if (t[3] && d.validade && d.validade < h) { st = 'vencido'; txt = 'Vencido em ' + dataTxt(d.validade); }
      else if (t[3] && d.validade && d.validade <= lim) { st = 'vence'; txt = 'Vence em ' + dataTxt(d.validade); }
      else if (t[3] && d.validade) txt = 'Válido até ' + dataTxt(d.validade);
      else txt = 'Enviado';
      return { tipo: k, nome: t[1], grupo: t[2], doc: d || null, st, txt };
    });
  }
  const PILL = { ok: 'ok', vence: 'warn', vencido: 'danger', falta: 'danger' };
  const pill = s => `<span class="pill ${PILL[s.st]}">${U().esc(s.st === 'ok' ? (s.doc && s.doc.validade ? 'Em dia' : 'Enviado') : s.st === 'vence' ? 'Vence logo' : s.st === 'vencido' ? 'Vencido' : 'Falta')}</span>`;

  /* ---------- estado do módulo ---------- */
  let meus = null, parceiros = {};   /* parceiros: prestadorId -> { nome, docs } (empresas que a minha contrata) */

  async function abrirArquivo(d) {
    const a = d.arquivo; if (!a) return;
    try {
      const db = CW.fb.db(), ps = await Promise.all(Array.from({ length: a.partes }, (_, k) => db.doc(`documentos/${d._id}/arquivos/${a.envio}-${k}`).get()));
      const bin = atob(ps.map(p => (CW.fb.dados(p) || {}).d || '').join('')), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([u8], { type: a.tipo || 'application/pdf' })), el = document.createElement('a');
      el.href = url; el.target = '_blank'; el.rel = 'noopener'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { U().toast('Não foi possível abrir o arquivo: ' + CW.fb.mensagemErro(e), 'erro'); }
  }
  const lerComo = (f, modo) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => erro(r.error); r[modo](f); });

  /* janela para enviar (ou atualizar) um documento */
  async function enviar(ctx, tipo, aoFim) {
    const { esc, ic } = U(), t0 = tipo ? tipoDe(tipo) : null;
    let res = null, arq = null;
    await U().dialogo({ titulo: t0 ? 'Enviar · ' + t0[1] : 'Enviar documento', sub: 'PDF, JPG ou PNG de até 5 MB.',
      corpo: `<div class="stack" style="gap:12px">
        ${t0 ? '' : `<label class="f"><span>Tipo de documento</span><select id="dc-tipo">${TIPOS.map(t => `<option value="${t[0]}">${esc(t[1])}</option>`).join('')}</select></label>`}
        <label class="f" id="dc-nome-l" ${t0 && t0[0] !== 'outro' ? 'hidden' : ''}><span>Nome do documento</span><input id="dc-nome" maxlength="120" placeholder="Ex.: Alvará de funcionamento"></label>
        <label class="f" id="dc-val-l"><span>Válido até</span><input id="dc-val" type="date" min="${hoje()}"><em class="hint" id="dc-val-h">Está escrito na certidão ou no documento.</em></label>
        <label class="up" style="cursor:pointer"><input type="file" id="dc-arq" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" style="position:absolute;opacity:0;width:1px;height:1px">
          <span class="ic">${ic('upload')}</span><span class="t"><strong>Escolher o arquivo</strong><small id="dc-arq-n">Nenhum arquivo escolhido</small></span></label>
        <label class="check" id="dc-comp-l"><input type="checkbox" id="dc-comp" checked> <span>Mostrar para as empresas que contratam a minha empresa no Conectwork</span></label>
        <p class="err" id="dc-erro" role="alert"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Enviar', valor: 'ok', icone: 'upload', antes: d => {
        const k = t0 ? t0[0] : d.querySelector('#dc-tipo').value, t = tipoDe(k), er = d.querySelector('#dc-erro'), v = d.querySelector('#dc-val').value;
        const nome = k === 'outro' ? d.querySelector('#dc-nome').value.trim() : t[1];
        if (k === 'outro' && nome.length < 3) { er.textContent = 'Escreva o nome do documento.'; return false; }
        if (t[3] && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { er.textContent = 'Informe até quando o documento vale.'; return false; }
        if (t[3] && v < hoje()) { er.textContent = 'Esse documento já está vencido. Emita um novo.'; return false; }
        if (!arq) { er.textContent = 'Escolha o arquivo.'; return false; }
        res = { tipo: k, nome, validade: t[3] ? v : (v || ''), compartilhar: t[4] ? d.querySelector('#dc-comp').checked : false }; return true; } }],
      aoAbrir: d => {
        const sel = d.querySelector('#dc-tipo');
        const ajusta = () => { const t = tipoDe(t0 ? t0[0] : sel.value); d.querySelector('#dc-nome-l').hidden = t[0] !== 'outro'; d.querySelector('#dc-val-l').hidden = !t[3] && t[0] !== 'outro';
          d.querySelector('#dc-val-h').textContent = t[3] ? 'Está escrito na certidão ou no documento.' : 'Opcional: só se o documento tiver validade.'; d.querySelector('#dc-comp-l').hidden = !t[4]; };
        if (sel) sel.onchange = ajusta; ajusta();
        const i = d.querySelector('#dc-arq'); i.onchange = () => { const f = i.files[0]; d.querySelector('#dc-erro').textContent = ''; if (!f) return;
          if (f.size > MAX) { arq = null; d.querySelector('#dc-erro').textContent = 'O arquivo passa de 5 MB. Salve em PDF com qualidade menor e tente de novo.'; return; }
          if (!/pdf|jpe?g|png/i.test(f.type + f.name)) { arq = null; d.querySelector('#dc-erro').textContent = 'Envie PDF, JPG ou PNG.'; return; }
          arq = f; d.querySelector('#dc-arq-n').textContent = f.name + ' · ' + tamTxt(f.size); };
      } });
    if (!res) return;
    const db = CW.fb.db(), agora = CW.fb.agora, emp = ctx.contexto.empresaId, ref = db.collection('documentos').doc();
    const b64 = String(await lerComo(arq, 'readAsDataURL')).replace(/^data:[^,]*,/, ''), envio = Math.random().toString(36).slice(2, 10), partes = Math.max(1, Math.ceil(b64.length / PEDACO));
    const b = db.batch();
    b.set(ref, { empresaId: emp, tipo: res.tipo, grupo: tipoDe(res.tipo)[2], nome: res.nome, validade: res.validade, compartilhar: res.compartilhar, status: 'vigente',
      arquivo: { envio, partes, nome: arq.name.slice(0, 120), tipo: arq.type || '', tam: arq.size }, enviadoPor: ctx.sessao.usuario.uid, enviadoPorNome: quem(ctx), criadoEm: agora() });
    for (let k = 0; k < partes; k++) b.set(db.doc(`documentos/${ref.id}/arquivos/${envio}-${k}`), { d: b64.slice(k * PEDACO, (k + 1) * PEDACO), k, envio, em: agora() });
    (meus || []).filter(x => x.tipo === res.tipo && x.status === 'vigente' && res.tipo !== 'outro').forEach(x => b.update(db.doc('documentos/' + x._id), { status: 'substituido', substituidoEm: agora(), substituidoPor: ref.id }));
    log(b, ctx, 'documento.enviar', `${res.nome} enviado${res.validade ? ' (válido até ' + dataTxt(res.validade) + ')' : ''}.`, ref.id);
    try { await b.commit(); U().toast('Documento enviado.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    if (aoFim) aoFim();
  }

  /* ---------- tela ---------- */
  function desenhar(el, ctx) {
    const { esc, ic } = U();
    document.getElementById('acoes').innerHTML = podeEnviar(ctx) ? `<button class="btn" id="dc-novo">${ic('upload')}Enviar documento</button>` : '';
    if (!meus) { el.innerHTML = `<div class="card"><div class="empty"><div class="giro"></div><span>Carregando os documentos…</span></div></div>`; return; }
    const emp = ctx.contexto.empresa || {}, obr = obrigatorios(emp);
    const tiposVistos = TIPOS.map(t => t[0]).filter(k => k !== 'outro' && (obr.includes(k) || OBRIG_TODOS.includes(k) || meus.some(d => d.tipo === k)));
    const S = situacao(meus, tiposVistos), probl = S.filter(s => obr.includes(s.tipo) && s.st !== 'ok');
    const linha = s => { const d = s.doc, t = tipoDe(s.tipo);
      return `<div class="docrow dc-row ${s.st === 'ok' ? 'ok' : ''}" data-tipo="${s.tipo}"><span class="ic">${ic(s.st === 'ok' ? 'check' : s.st === 'falta' ? 'upload' : 'alert')}</span>
        <div class="t"><strong>${esc(s.nome)}${obr.includes(s.tipo) ? '' : ' <span class="hint" style="font-weight:400">(opcional)</span>'}</strong><small>${esc(s.txt)}${d ? ' · ' + esc(d.arquivo.nome) + (d.compartilhar ? ' · compartilhado' : '') : ''}</small></div>
        <div class="dc-bt">${!obr.includes(s.tipo) && s.st === 'falta' ? '<span class="pill info">Não enviado</span>' : pill(s)}${d ? `<button class="btn ghost sm" data-abrir="${esc(d._id)}">Abrir</button>` : ''}${LINKS[s.tipo] && podeEnviar(ctx) ? `<a class="btn ghost sm" href="${LINKS[s.tipo]}" target="_blank" rel="noopener" data-emitir="${s.tipo}">Emitir</a>` : ''}${podeEnviar(ctx) ? `<button class="btn ${d ? 'sec' : ''} sm" data-enviar="${s.tipo}">${d ? 'Atualizar' : 'Enviar'}</button>` : ''}</div></div>`; };
    const grupo = g => { const xs = S.filter(s => s.grupo === g); return xs.length ? `<section class="card" id="dc-${g}" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic(g === 'cadastro' ? 'building' : g === 'certidao' ? 'file' : 'shield')}</span><h3>${esc(GRUPOS[g])}</h3></div>${xs.map(linha).join('')}
      ${g === 'certidao' ? '<p class="hint" style="margin:0;padding:10px 20px;font-size:12px;border-top:1px solid var(--line)">"Emitir" abre o site oficial da certidão. A municipal e a estadual saem no site da sua prefeitura e da Secretaria da Fazenda do estado.</p>' : ''}
      ${g === 'cadastro' ? '<p class="hint" style="margin:0;padding:10px 20px;font-size:12px;border-top:1px solid var(--line)">Só a sua empresa e a equipe Conectwork veem estes documentos.</p>' : ''}</section>` : ''; };
    const outros = meus.filter(d => d.tipo === 'outro' && d.status === 'vigente');
    el.innerHTML = `${probl.length ? `<div class="banner ${probl.some(s => s.st !== 'vence') ? 'danger' : 'warn'}" id="dc-aviso" style="margin-bottom:18px">${ic('alert')}<span><strong>${probl.length} documento${probl.length > 1 ? 's' : ''} para resolver</strong>${probl.map(s => esc(s.nome.split(' (')[0].split(' · ')[0] + ': ' + s.txt.toLowerCase())).join(' · ')}</span></div>`
        : `<div class="banner ok" id="dc-aviso" style="margin-bottom:18px">${ic('check')}<span><strong>Documentos em dia</strong>${presta(emp) ? 'As empresas que contratam a sua veem que as certidões e a segurança do trabalho estão em dia.' : 'Tudo enviado.'}</span></div>`}
      ${grupo('cadastro')}${grupo('certidao')}${grupo('seguranca')}
      ${outros.length ? `<section class="card" id="dc-outros"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Outros documentos</h3></div>${outros.map(d => `<div class="docrow ok"><span class="ic">${ic('file')}</span><div class="t"><strong>${esc(d.nome)}</strong><small>${esc(d.arquivo.nome)}${d.validade ? ' · válido até ' + esc(dataTxt(d.validade)) : ''}</small></div><div class="dc-bt"><button class="btn ghost sm" data-abrir="${esc(d._id)}">Abrir</button></div></div>`).join('')}</section>` : ''}`;
    const n = document.getElementById('dc-novo'), re = () => desenhar(el, ctx);
    if (n) n.onclick = () => enviar(ctx, null, re);
    el.querySelectorAll('[data-enviar]').forEach(b => b.onclick = () => enviar(ctx, b.dataset.enviar, re));
    /* 13/11/2026: "Emitir" segue a lógica dos sites da Receita (copia o CNPJ, avisa e abre por cima) e, ao fechar a janela, já pede o arquivo para enviar */
    el.querySelectorAll('[data-emitir]').forEach(a => a.onclick = ev => { const tp = a.dataset.emitir;
      if (!CW.negocio || !CW.negocio.receita) return;
      CW.negocio.receita(ev, a.href, { site: SITE[tp] || 'site oficial', titulo: SITE[tp], aoFechar: () => { if (document.body.contains(a)) enviar(ctx, tp, re); } }); });
    el.querySelectorAll('[data-abrir]').forEach(b => b.onclick = () => abrirArquivo(meus.find(d => d._id === b.dataset.abrir)));
  }

  /* ---------- documentos da prestadora (usado no contrato, no pagamento e na análise do cadastro) ---------- */
  async function docsDe(empId, todos) {
    const db = CW.fb.db();
    const q = todos ? db.collection('documentos').where('empresaId', '==', empId) : db.collection('documentos').where('empresaId', '==', empId).where('compartilhar', '==', true);
    return CW.fb.lista(await q.get());
  }
  /* cartão no contrato: a situação das certidões e da segurança do trabalho da prestadora */
  async function blocoContrato(box, ctx, c) {
    if (!box || c.status === 'cancelado') return;
    const { esc, ic } = U(), souPrest = c.prestadorId === ctx.contexto.empresaId;
    let docs;
    try { docs = await docsDe(c.prestadorId, souPrest); } catch (e) { box.innerHTML = ''; return; }
    const S = situacao(docs, obrigContrato(c)), ruins = S.filter(s => s.st !== 'ok');
    box.innerHTML = `<section class="card" id="dc-prest"><div class="card-h"><span class="ic">${ic('shield')}</span><h3>Documentos da prestadora</h3><span style="margin-left:auto" class="pill ${ruins.some(s => s.st !== 'vence') ? 'danger' : ruins.length ? 'warn' : 'ok'}">${ruins.length ? ruins.length + ' para resolver' : 'Em dia'}</span></div>
      ${S.map(s => `<div class="docrow ${s.st === 'ok' ? 'ok' : ''}"><span class="ic">${ic(s.st === 'ok' ? 'check' : 'alert')}</span><div class="t"><strong>${esc(s.nome)}</strong><small>${esc(s.txt)}</small></div><div class="dc-bt">${pill(s)}${s.doc ? `<button class="btn ghost sm" data-abrir-doc="${esc(s.doc._id)}">Abrir</button>` : ''}</div></div>`).join('')}
      <p class="hint" style="margin:0;padding:10px 20px;font-size:12px;border-top:1px solid var(--line)">${souPrest ? 'Mantenha em dia em "Documentos e certidões". Quem contrata vê esta situação.' : 'A prestadora mantém os documentos no Conectwork. Certidão vencida aparece como alerta na medição e no pagamento.'}</p></section>`;
    box.querySelectorAll('[data-abrir-doc]').forEach(b => b.onclick = () => abrirArquivo(docs.find(d => d._id === b.dataset.abrirDoc)));
  }
  /* alerta curto (medição e pagamento): só quando há algo vencido ou faltando */
  async function alerta(box, prestadorId, prestadorNome, contratoId) {
    if (!box) return;
    let docs, c = null; try { docs = await docsDe(prestadorId, false); if (contratoId) c = CW.fb.dados(await CW.fb.db().doc('contratos/' + contratoId).get()); } catch (e) { return; }
    const ruins = situacao(docs, obrigContrato(c)).filter(s => s.st === 'vencido' || s.st === 'falta');
    if (!ruins.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="banner warn" style="margin-bottom:14px" id="dc-alerta">${U().ic('shield')}<span><strong>Documentos da ${U().esc(prestadorNome)} com pendência</strong>${ruins.map(s => U().esc(s.nome.split(' (')[0].split(' · ')[0] + ': ' + s.txt.toLowerCase())).join(' · ')}. Confira antes de seguir (veja no contrato).</span></div>`;
  }
  /* análise do cadastro (equipe Conectwork): todos os documentos enviados */
  async function blocoMaster(box, empId) {
    if (!box) return;
    const { esc, ic } = U();
    let docs; try { docs = (await docsDe(empId, true)).filter(d => d.status === 'vigente'); } catch (e) { box.innerHTML = ''; return; }
    box.innerHTML = `<section class="card" id="dc-master"><div class="card-h"><span class="ic">${ic('file')}</span><h3>Arquivos enviados pela empresa</h3><span class="count">${docs.length}</span></div>
      ${docs.length ? docs.map(d => `<div class="docrow"><span class="ic">${ic('file')}</span><div class="t"><strong>${esc(d.nome)}</strong><small>${esc(d.arquivo.nome)} · ${esc(tamTxt(d.arquivo.tam))}${d.validade ? ' · válido até ' + esc(dataTxt(d.validade)) : ''}</small></div><div class="dc-bt"><button class="btn ghost sm" data-abrir-doc="${esc(d._id)}">Abrir</button></div></div>`).join('')
        : `<p class="hint" style="margin:0;padding:14px 20px">A empresa ainda não enviou arquivos em "Documentos e certidões".</p>`}</section>`;
    box.querySelectorAll('[data-abrir-doc]').forEach(b => b.onclick = () => abrirArquivo(docs.find(d => d._id === b.dataset.abrirDoc)));
  }

  CW.registrarModulo({
    id: 'documentos', nome: 'Documentos e certidões', nomeCurto: 'Documentos', icone: 'folder', ordem: 65,
    para: ['empresa'], semAprovacao: true,
    iniciar(ctx) {
      meus = null; parceiros = {}; meuPorte = '';
      const db = CW.fb.db(), emp = ctx.contexto.empresaId;
      db.doc('empresas/' + emp + '/privado/cadastro').get().then(sn => { meuPorte = ((CW.fb.dados(sn) || {}).dados || {}).porte || ''; CW.app.pendenciasMudaram(); const el = document.getElementById('view'), at = CW.app.atual(); if (el && at && at.modulo === 'documentos' && meus) desenhar(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() })); }).catch(() => {});
      const redesenha = () => { const el = document.getElementById('view'), at = CW.app.atual(); if (el && at && at.modulo === 'documentos') desenhar(el, Object.assign({}, ctx, { sessao: CW.sessao.estado() })); CW.app.pendenciasMudaram(); };
      CW.inscrever('documentos', () => db.collection('documentos').where('empresaId', '==', emp), s => { meus = CW.fb.lista(s); redesenha(); }, () => { meus = []; redesenha(); });
      /* quem contrata (admin ou financeiro): situação das prestadoras com contrato ativo */
      if (!ctx.soLeitura && ['admin', 'financeiro'].includes(cargo(ctx)) && (ctx.contexto.empresa || {}).status === 'aprovado') {
        CW.inscrever('documentos-ct', () => db.collection('contratos').where('tomadorId', '==', emp), async s => {
          const ativos = CW.fb.lista(s).filter(c => c.status === 'ativo'), novo = {};
          await Promise.all(ativos.map(async c => { try { novo[c.prestadorId] = { nome: c.prestadorNome, contratoId: c._id, obrig: novo[c.prestadorId] && novo[c.prestadorId].obrig.length > obrigContrato(c).length ? novo[c.prestadorId].obrig : obrigContrato(c), docs: await docsDe(c.prestadorId, false) }; } catch (e) { /* sem acesso */ } }));
          parceiros = novo; CW.app.pendenciasMudaram();
        }, () => {});
      }
      return () => { meus = null; parceiros = {}; };
    },
    pendencias(ctx) {
      const out = [];
      if (meus && podeEnviar(ctx)) situacao(meus, obrigatorios(ctx.contexto.empresa)).filter(s => s.st !== 'ok')
        .forEach(s => out.push({ txt: s.st === 'falta' ? 'Enviar: ' + s.nome : s.st === 'vencido' ? 'Renovar (vencido): ' + s.nome : 'Renovar (vence logo): ' + s.nome, sub: s.txt, rota: 'documentos' }));
      Object.entries(parceiros).forEach(([, p]) => { const r = situacao(p.docs, p.obrig || OBRIG_PRESTA).filter(s => s.st === 'vencido' || s.st === 'falta');
        if (r.length) out.push({ txt: `Documentos da ${p.nome} com pendência`, sub: r.map(s => s.nome.split(' (')[0].split(' · ')[0] + ': ' + s.txt.toLowerCase()).join(' · '), rota: 'contratos/ver/' + p.contratoId }); });
      return out;
    },
    telas: { lista: { nome: 'Documentos e certidões', sub: 'Documentos do cadastro, certidões e segurança do trabalho, com o vencimento de cada um.', render: (el, ctx) => desenhar(el, ctx) } }
  });
  /* agenda (10/11/2026): documentos da própria empresa com validade, já carregados por esta tela */
  const comValidade = () => (meus || []).filter(d => d.status === 'vigente' && d.validade).map(d => ({ id: d._id, nome: tipoDe(d.tipo)[1] || d.nome, validade: d.validade }));
  CW.documentos = { carregado: () => meus !== null, comValidade, situacao, blocoContrato, alerta, blocoMaster, abrirArquivo, OBRIG_PRESTA, CERTS, obrigContrato, TIPOS };
})();
