/* Conectwork · Assistente de emissão da nota (lado de quem emite: profissional ou prestadora).
   Passo a passo na mesma ordem das telas do Emissor Nacional (Pessoas · Serviço · Valores · Emitir), com cada campo
   pronto para copiar. O "meu modelo de nota" (código de tributação nacional, município, informações complementares)
   é salvo uma vez em notamodelo/{empresaId} e reaparece em todas as notas.
   Não emite a nota: emitir pelo app exige servidor e certificado digital (docs/PLANO-EMISSAO-API.md). */
(function () {
  const CW = window.CW = window.CW || {};
  const U = () => CW.ui;
  const EDITA = ['admin', 'financeiro', 'operacional'];
  const cache = {};
  const quem = ctx => (ctx.sessao.perfil && ctx.sessao.perfil.nome) || ctx.sessao.usuario.email;
  const pode = ctx => !ctx.soLeitura && EDITA.includes(ctx.contexto.acesso && ctx.contexto.acesso.cargo);
  /* data de competência: último dia do serviço (15 na 1ª quinzena; fim do mês na 2ª quinzena ou no mês) */
  function dataCompetencia(periodo) {
    const m = /^(\d{4})-(\d{2})(?:-([12]))?/.exec(periodo || ''); if (!m) return '';
    const ult = new Date(+m[1], +m[2], 0).getDate(), d = m[3] === '1' ? 15 : ult;
    return `${String(d).padStart(2, '0')}/${m[2]}/${m[1]}`;
  }
  async function copiar(txt) {
    try { await navigator.clipboard.writeText(txt); }
    catch (e) { const t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) {} t.remove(); }
    U().toast('Copiado.');
  }
  async function modelo(emp) {
    if (cache[emp]) return cache[emp];
    try { cache[emp] = CW.fb.dados(await CW.fb.db().doc('notamodelo/' + emp).get()) || {}; } catch (e) { cache[emp] = {}; }
    return cache[emp];
  }

  async function bloco(box, ctx, x) {
    if (!box) return;
    const { esc, ic, formatarDinheiro } = U(), emp = ctx.contexto.empresaId, M = await modelo(emp), t = x.tomador || {}, r = x.retencoes || {};
    const temRet = ['iss', 'inss', 'ir', 'pcc'].some(k => r[k]);
    const campo = (rot, val, dica) => `<div class="as-campo"><div class="t"><small>${esc(rot)}</small><b>${val ? esc(val) : '<span class="hint">— preencha no seu modelo</span>'}</b>${dica ? `<em>${esc(dica)}</em>` : ''}</div>${val ? `<button class="btn ghost sm" data-cp="${esc(val)}">${ic('copy')}Copiar</button>` : ''}</div>`;
    const passo = (n, tit, corpo) => `<details class="as-passo" ${n === 1 ? 'open' : ''}><summary><span class="as-n">${n}</span>${esc(tit)}</summary><div class="as-corpo">${corpo}</div></details>`;
    box.innerHTML = `<section class="card" id="as-card" style="margin-bottom:22px"><div class="card-h"><span class="ic">${ic('receipt')}</span><h3>Passo a passo da emissão</h3>${pode(ctx) ? `<button class="btn ghost sm" id="as-modelo" style="margin-left:auto">${ic('edit')}Meu modelo de nota</button>` : ''}</div>
      <div class="card-b stack" style="gap:10px">
        ${!M.codigo ? `<div class="banner info" id="as-sem-modelo">${ic('help')}<span><strong>Salve o seu modelo de nota uma vez</strong>Código de tributação nacional do seu serviço e o município onde ele é prestado. Nas próximas notas, eles já aparecem aqui.</span></div>` : ''}
        ${passo(1, 'Entrar e começar', `<p style="margin:0">Toque em "Emitir a nota" (acima). Entre com a conta gov.br (prata ou ouro) ou com o certificado digital e escolha <b>Emitir NFS-e</b>.</p>`)}
        ${passo(2, 'Pessoas: competência e tomador', campo('Data de competência', dataCompetencia(x.periodo), 'Último dia do serviço desta cobrança.') + campo('CNPJ do tomador', U().dig(t.cnpj), 'Depois de colar, o emissor busca a razão social e o endereço.') + campo('Razão social do tomador', t.razao))}
        ${passo(3, 'Serviço', campo('Município onde o serviço foi prestado', M.municipio || (t.cidade ? t.cidade + '/' + t.uf : ''), M.municipio ? '' : 'Sugestão: a cidade do tomador. Confira.') + campo('Código de tributação nacional', M.codigo ? M.codigo + (M.codigoDesc ? ' · ' + M.codigoDesc : '') : '', 'Escolha na lista do emissor o mesmo código.') + campo('Descrição do serviço', x.descricao))}
        ${passo(4, 'Valores e retenções', campo('Valor do serviço', formatarDinheiro(x.valorCentavos, false)) + (temRet
          ? (r.iss ? campo('ISS retido pelo tomador', formatarDinheiro(r.iss, false), 'Marque "ISSQN retido pelo tomador".') : '') + (r.inss ? campo('INSS retido', formatarDinheiro(r.inss, false)) : '') + (r.ir ? campo('IR retido', formatarDinheiro(r.ir, false)) : '') + (r.pcc ? campo('PIS/COFINS/CSLL retidos', formatarDinheiro(r.pcc, false)) : '')
          : '<p class="hint" style="margin:0">Sem retenções neste espelho. Se você é MEI, o emissor já trata o ISS e os tributos pelo Simples.</p>') + (M.complemento ? campo('Informações complementares', M.complemento) : ''))}
        ${passo(5, 'Emitir, baixar e anexar', `<p style="margin:0">Confira o resumo e toque em <b>Emitir</b>. Baixe o <b>PDF</b> (ou o XML) da nota e volte para cá: o Conectwork pede o arquivo e confere sozinho com este espelho.</p>`)}
      </div></section>`;
    box.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => copiar(b.dataset.cp));
    const mb = document.getElementById('as-modelo'); if (mb) mb.onclick = () => editar(ctx, M, () => bloco(box, ctx, x));
  }

  async function editar(ctx, M, aoFim) {
    const { esc } = U(); let res = null;
    await U().dialogo({ titulo: 'Meu modelo de nota', sub: 'Salve uma vez; aparece em todas as notas. Na dúvida sobre o código, pergunte ao seu contador.',
      corpo: `<div class="fgrid">
        <label class="f c5"><span>Código de tributação nacional</span><input id="mn-cod" maxlength="8" placeholder="00.00.00" value="${esc(M.codigo || '')}"><em class="hint">6 números, como na lista do emissor (ex.: 14.01.01).</em></label>
        <label class="f c7"><span>O que o código descreve</span><input id="mn-desc" maxlength="150" placeholder="Ex.: Lubrificação, limpeza e revisão de máquinas" value="${esc(M.codigoDesc || '')}"></label>
        <label class="f c12"><span>Município onde presta o serviço</span><input id="mn-mun" maxlength="80" placeholder="Ex.: Gravataí/RS" value="${esc(M.municipio || '')}"></label>
        <label class="f c12"><span>Informações complementares <i>(opcional)</i></span><input id="mn-comp" maxlength="300" value="${esc(M.complemento || '')}"></label>
        <p class="err c12" id="mn-erro"></p></div>`,
      botoes: [{ texto: 'Voltar', valor: null, classe: 'sec' }, { texto: 'Salvar modelo', valor: 'ok', antes: d => {
        const g = x => d.querySelector('#' + x).value.trim(), dig = U().dig(g('mn-cod'));
        if (dig.length !== 6) { d.querySelector('#mn-erro').textContent = 'O código de tributação nacional tem 6 números (ex.: 14.01.01).'; return false; }
        res = { codigo: dig.replace(/^(\d{2})(\d{2})(\d{2})$/, '$1.$2.$3'), codigoDesc: g('mn-desc'), municipio: g('mn-mun'), complemento: g('mn-comp') }; return true; } }] });
    if (!res) return;
    const db = CW.fb.db(), emp = ctx.contexto.empresaId, b = db.batch();
    b.set(db.doc('notamodelo/' + emp), Object.assign({}, res, { em: CW.fb.agora(), por: ctx.sessao.usuario.uid }));
    b.set(db.collection('log').doc(), { em: CW.fb.agora(), uid: ctx.sessao.usuario.uid, quem: quem(ctx), empresaId: emp, acao: 'nota.modelo', texto: `Modelo de nota salvo (código ${res.codigo}).`, ref: '' });
    try { await b.commit(); cache[emp] = res; U().toast('Modelo salvo. Aparece em todas as notas.'); } catch (e) { U().toast(CW.fb.mensagemErro(e), 'erro'); }
    if (aoFim) aoFim();
  }

  CW.assistente = { bloco, dataCompetencia };
})();
