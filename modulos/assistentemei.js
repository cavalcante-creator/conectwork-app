/* Conectwork · Assistente do MEI (10/11/2026), versão guiada, sem IA.
   A pessoa escolhe uma pergunta pronta ou escreve; o assistente procura a resposta pelas palavras (sem acento) e, quando
   a pergunta é sobre os números dela (faturamento, limite, DAS, a receber, agenda), responde com os dados que o
   Conectwork já tem. Linguagem simples; não é orientação contábil.
   IA depois: responder() devolve uma Promise; quando houver servidor (Cloud Functions + chave guardada lá, nunca no
   front), as perguntas sem resposta pronta passam a ir para ele, sem mudar a tela. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const norm = v => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const brl = c => U().formatarDinheiro(c || 0);
  const dataBR = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const AVISO = 'Isto é uma orientação geral. Para a sua situação, confirme com o seu contador.';
  let conversa = [], dados = null;   /* dados: { D, K } do Meu negócio, carregados na 1ª pergunta que precisa */

  async function meusNumeros(ctx) {
    if (dados) return dados;
    if (!CW.negocio || !CW.negocio.carregar) return null;
    try { const D = await CW.negocio.carregar(ctx); dados = { D, K: CW.negocio.contas(D) }; } catch (e) { dados = null; }
    return dados;
  }

  /* cada resposta: palavras que ativam (todas de um grupo), texto e, se for o caso, botões para abrir a tela certa */
  const R = [
    { id: 'faturei', p: ['Quanto faturei este ano?'], k: [['faturei'], ['faturamento'], ['quanto', 'ganhei'], ['receita']],
      r: async ctx => { const n = await meusNumeros(ctx); if (!n) return { t: 'Não consegui abrir os seus números agora. Veja em Meu negócio.', ir: [['Abrir Meu negócio', 'negocio']] };
        return { t: `Neste ano você faturou ${brl(n.K.noAno)}, somando as notas do Conectwork e o que você lançou como faturamento fora dele.${n.K.maior ? ` O cliente que mais pagou nos últimos 12 meses foi ${n.K.maior.n} (${Math.round(n.K.maior.p * 100)}%).` : ''}`, ir: [['Ver em Meu negócio', 'negocio']] }; } },
    { id: 'limite', p: ['Quanto falta para o limite do MEI?'], k: [['limite'], ['81'], ['teto'], ['desenquadr']],
      r: async ctx => { const n = await meusNumeros(ctx), L = CW.negocio ? CW.negocio.LIMITE_MEI : 8100000;
        if (!n) return { t: `O limite do MEI é ${brl(L)} por ano (no ano em que o MEI abriu, é proporcional aos meses).` };
        const falta = L - n.K.noAno, pct = Math.round(n.K.noAno / L * 100);
        return { t: falta > 0 ? `Você já usou ${pct}% do limite do MEI deste ano. Faltam ${brl(falta)} para chegar em ${brl(L)}.${pct >= 80 ? ' Está perto: vale conversar com o seu contador sobre o que fazer se passar.' : ''}`
          : `Você passou do limite do MEI deste ano em ${brl(-falta)}. Se passou até 20%, o MEI vira microempresa no ano seguinte; se passou mais, desde o mês em que passou. Fale com o seu contador logo.`, ir: [['Ver em Meu negócio', 'negocio']] }; } },
    { id: 'passar', p: ['O que acontece se eu passar do limite?'], k: [['passar', 'limite'], ['passei'], ['estour']],
      r: () => ({ t: `Se o faturamento do ano passar do limite em até 20%, você continua MEI até o fim do ano, paga uma guia complementar sobre o que passou e vira microempresa (ME) no ano seguinte. Se passar mais de 20%, o desenquadramento vale desde o mês em que passou, com os impostos de microempresa sobre esse período. ${AVISO}` }) },
    { id: 'das', p: ['Quando vence o DAS?', 'Já paguei o DAS?'], k: [['das'], ['vence', 'das'], ['paguei', 'das'], ['guia'], ['boleto', 'mei']],
      r: () => { const f = CW.negocio && CW.negocio.fiscal && CW.negocio.fiscal();
        const base = 'O DAS é a guia mensal do MEI. Ela vence todo dia 20 do mês seguinte ao do faturamento (a de março vence em 20 de abril) e você paga mesmo nos meses em que não faturou.';
        if (!f) return { t: base, ir: [['Abrir Meu negócio', 'negocio']] };
        const ab = f.das.filter(x => !x.pago);
        return { t: base + (ab.length ? ` Pelo que está marcado aqui, falta pagar: ${ab.map(x => `${MESES[+x.m.slice(5, 7) - 1]} (vence ${dataBR(x.venc)}${x.vencido ? ', vencido' : ''})`).join(', ')}.` : ' Pelo que está marcado aqui, os últimos meses estão pagos.'), ir: [['Marcar pago em Meu negócio', 'negocio']] }; } },
    { id: 'impostos', p: ['Quais impostos o MEI paga?'], k: [['imposto'], ['tributo'], ['inss'], ['iss'], ['icms']],
      r: () => ({ t: `O MEI paga tudo numa guia só, o DAS, com valor fixo por mês: a parte do INSS (que conta para a sua aposentadoria e auxílios) e, conforme a atividade, um valor pequeno de ISS (serviço) e/ou ICMS (comércio e indústria). O valor muda todo ano com o salário mínimo. Não tem imposto em cima de cada nota. ${AVISO}` }) },
    { id: 'dasn', p: ['O que é a declaração anual (DASN-SIMEI)?'], k: [['dasn'], ['declaracao'], ['anual']],
      r: () => { const f = CW.negocio && CW.negocio.fiscal && CW.negocio.fiscal();
        return { t: `É a declaração que todo MEI entrega uma vez por ano, até 31 de maio, com o faturamento do ano anterior. É rápida e gratuita, no site do Simples Nacional.${f ? (f.dasn.entregue ? ` A de ${f.dasn.ano} já está marcada como entregue.` : ` A de ${f.dasn.ano} ainda não está marcada como entregue.`) : ''}`, ir: [['Abrir Meu negócio', 'negocio']] }; } },
    { id: 'obrig', p: ['Quais são as minhas obrigações?'], k: [['obrigac'], ['preciso', 'fazer'], ['em', 'dia']],
      r: () => ({ t: 'Para ficar em dia, o MEI precisa: pagar o DAS todo mês (dia 20); preencher o relatório mensal das receitas brutas (o Conectwork monta em Meu negócio); entregar a declaração anual até 31 de maio; e emitir nota fiscal quando o serviço é para uma empresa.', ir: [['Abrir Meu negócio', 'negocio'], ['Ver a agenda', 'agenda']] }) },
    { id: 'nota', p: ['Como emito a nota?'], k: [['nota'], ['nfs'], ['emitir'], ['emissor']],
      r: () => ({ t: 'Quando a empresa aprova o seu serviço, o Conectwork prepara o espelho da nota com tudo o que precisa. Em "Notas a emitir", o assistente de emissão mostra cada campo pronto para copiar no Emissor Nacional, na mesma ordem das telas de lá. Depois é só anexar a nota no Conectwork.', ir: [['Abrir Notas a emitir', 'espelhos']] }) },
    { id: 'receber', p: ['O que tenho para receber?'], k: [['receber'], ['pagar', 'mim'], ['pagamento'], ['dinheiro']],
      r: ctx => { const t = (CW.titulos && CW.titulos.proximos ? CW.titulos.proximos(ctx, 20) || [] : []).filter(x => x.lado === 'prestador');
        return { t: t.length ? `Você tem ${t.length === 1 ? '1 pagamento' : t.length + ' pagamentos'} para receber: ${t.slice(0, 5).map(x => `${x.valor} de ${x.nome} (vence ${x.venc}${x.vencido ? ', atrasado' : ''})`).join('; ')}.` : 'Não há pagamento em aberto para você agora.', ir: [['Abrir A receber', 'titulos']] }; } },
    { id: 'semana', p: ['O que vence esta semana?'], k: [['vence'], ['semana'], ['agenda'], ['compromisso'], ['lembrete']],
      r: ctx => { if (!CW.agenda) return { t: 'A agenda ainda não abriu.', ir: [['Abrir a agenda', 'agenda']] };
        const h = new Date(), de = iso(h), ate = iso(new Date(h.getFullYear(), h.getMonth(), h.getDate() + 7));
        const ls = CW.agenda.linhas(ctx, de, ate).filter(l => !l.feito);
        return { t: ls.length ? `Nos próximos 7 dias: ${ls.slice(0, 8).map(l => `${dataBR(l.data).slice(0, 5)} · ${l.a ? l.a.titulo : l.x.titulo}`).join('; ')}.` : 'Nada marcado para os próximos 7 dias.', ir: [['Abrir a agenda', 'agenda']] }; } },
    { id: 'registrar', p: ['Como registro uma venda ou um gasto?'], k: [['registr'], ['lancar'], ['anotar']],
      r: () => ({ t: 'É só me escrever do seu jeito, por exemplo: "vendi R$ 200 hoje no Pix", "comprei R$ 80 de material", "o cliente me deve R$ 150". Eu mostro como entendi e só registro depois que você confirmar. Também dá para tocar em "Registrar", no canto da tela.', ir: [['Abrir o Dinheiro', 'dinheiro']] }) },
    { id: 'contador', p: ['Preciso de contador?'], k: [['contador'], ['contabil']],
      r: () => ({ t: 'O MEI não é obrigado a ter contador: dá para pagar o DAS e entregar a declaração sozinho. Mas um contador ajuda quando você chega perto do limite, quer mudar de atividade, contratar alguém ou virar microempresa.' }) },
    { id: 'clientes', p: ['Por que é bom ter mais de um cliente?'], k: [['cliente'], ['depend'], ['exclusiv']],
      r: () => ({ t: 'Atender várias empresas mostra que você tem um negócio próprio, com autonomia. Quando quase todo o faturamento vem de um cliente só, isso pode ser visto como dependência. Em Meu negócio, o Conectwork mostra de quem vem o seu faturamento.', ir: [['Ver em Meu negócio', 'negocio']] }) }
  ];
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const SUGESTOES = ['registrar', 'faturei', 'limite', 'das', 'receber', 'semana', 'obrig', 'impostos'];

  const dinOn = () => !!(CW.dinheiro && CW.dinheiro.ligado && CW.dinheiro.ligado());
  const RV = () => R.filter(x => x.id !== 'registrar' || dinOn());   /* sem o Dinheiro, não oferece registrar venda/gasto */
  function achar(texto) {
    const q = norm(texto), pal = q.split(/[^a-z0-9]+/).filter(Boolean);
    const tem = w => pal.some(x => x.startsWith(w));   /* palavra inteira ou começo dela ("das" não casa com "todas") */
    let melhor = null, nota = 0;
    RV().forEach(x => {
      if (x.p.some(p => norm(p) === q)) { melhor = x; nota = 999; return; }
      x.k.forEach(grp => { const n = grp.length * 10 + grp.join('').length; if (grp.every(tem) && n > nota) { melhor = x; nota = n; } });
    });
    return melhor;
  }
  async function responder(texto, ctx) {
    /* frase de lançamento ("vendi R$ 200 no pix"): prepara e pede confirmação; só grava depois do "Confirmar" */
    const lanc = CW.dinheiro && CW.dinheiro.ligado && CW.dinheiro.ligado() && CW.dinheiro.interpretar && CW.dinheiro.interpretar(texto);
    if (lanc) return { id: 'lanc', t: `Entendi assim: ${CW.dinheiro.resumoTxt(lanc)}. Posso registrar?`, lanc };
    const x = achar(texto);
    if (x) return Object.assign({ id: x.id }, await x.r(ctx));
    return { id: 'nao', t: 'Ainda não sei responder essa. Por enquanto eu respondo sobre faturamento, limite do MEI, DAS, impostos, declaração anual, nota fiscal, o que você tem a receber e a sua agenda. Escolha uma das perguntas abaixo.' };
  }

  function desenhar(el, ctx) {
    const { esc, ic } = U(), nome = String((ctx.sessao.perfil && ctx.sessao.perfil.nome) || '').split(' ')[0];
    const msgs = conversa.length ? conversa : [{ de: 'a', t: `Oi${nome ? ', ' + nome : ''}! Eu sou o assistente do Conectwork. Pergunte sobre o seu MEI (faturamento, limite, DAS, impostos, notas e prazos) ou me conte o que vendeu e gastou, que eu registro para você.` }];
    el.innerHTML = `<div class="as-wrap"><section class="card as-card" id="as-chat"><div class="as-msgs" id="as-msgs" aria-live="polite">
        ${msgs.map((m, i) => `<div class="as-m ${m.de === 'eu' ? 'eu' : ''}" ${m.id ? `data-resp="${esc(m.id)}"` : ''}><p>${esc(m.t)}</p>${(m.ir || []).length ? `<div class="as-ir">${m.ir.map(([t, r]) => `<button class="btn sm sec" data-ir="${esc(r)}">${esc(t)}</button>`).join('')}</div>` : ''}
          ${m.lanc && !m.feito ? `<div class="as-ir"><button class="btn sm" data-lanc-ok="${i}">${ic('check')}Confirmar</button><button class="btn sm sec" data-lanc-mudar="${i}">Mudar</button><button class="btn sm ghost" data-lanc-nao="${i}">Cancelar</button></div>` : ''}</div>`).join('')}</div>
        <div class="as-sug" id="as-sug">${SUGESTOES.map(id => RV().find(x => x.id === id)).filter(Boolean).map(x => `<button class="as-chip" data-p="${esc(x.p[0])}">${esc(x.p[0])}</button>`).join('')}</div>
        <form class="as-form" id="as-form"><input id="as-q" maxlength="200" autocomplete="off" placeholder="Pergunte ou registre: vendi R$ 200 no Pix" aria-label="Sua pergunta ou o que quer registrar"><button class="btn" type="submit">${ic('send')}Perguntar</button></form></section>
      <p class="hint" style="margin:12px 0 0;font-size:12px">${esc(AVISO)} O assistente com inteligência artificial, que conversa sobre qualquer assunto, chega numa próxima etapa.</p></div>`;
    const box = document.getElementById('as-msgs'); box.scrollTop = box.scrollHeight;
    const perguntar = async t => { t = String(t || '').trim(); if (!t) return;
      conversa = (conversa.length ? conversa : msgs).concat([{ de: 'eu', t }]); desenhar(el, ctx);
      const r = await responder(t, ctx); conversa = conversa.concat([{ de: 'a', t: r.t, ir: r.ir, id: r.id, lanc: r.lanc }]).slice(-40); desenhar(el, ctx);
      const q = document.getElementById('as-q'); if (q) q.focus(); };
    document.getElementById('as-form').onsubmit = e => { e.preventDefault(); perguntar(document.getElementById('as-q').value); };
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => perguntar(b.dataset.p));
    el.querySelectorAll('[data-ir]').forEach(b => b.onclick = () => CW.ir(b.dataset.ir));
    /* lançamento proposto: Confirmar grava; Mudar abre o formulário já preenchido; Cancelar não grava nada */
    const fecha = (i, extra) => { conversa = conversa.slice(); conversa[i] = Object.assign({}, conversa[i], { feito: true }); if (extra) conversa = conversa.concat([extra]); desenhar(el, ctx); };
    el.querySelectorAll('[data-lanc-ok]').forEach(b => b.onclick = async () => { const i = +b.dataset.lancOk, x = conversa[i].lanc; b.disabled = true;
      try { await CW.dinheiro.gravar(ctx, x, 'assistente'); fecha(i, { de: 'a', id: 'lanc-ok', t: `Pronto, registrei: ${CW.dinheiro.resumoTxt(x)}.`, ir: [['Ver no Dinheiro', 'dinheiro']] }); }
      catch (e) { b.disabled = false; U().toast(CW.fb.mensagemErro(e), 'erro'); } });
    el.querySelectorAll('[data-lanc-mudar]').forEach(b => b.onclick = async () => { const i = +b.dataset.lancMudar, x = conversa[i].lanc;
      const id = await CW.dinheiro.registrar(ctx, Object.assign({}, x, { origem: 'assistente' })); if (id) fecha(i, { de: 'a', id: 'lanc-ok', t: 'Pronto, registrei do jeito que você ajustou.', ir: [['Ver no Dinheiro', 'dinheiro']] }); });
    el.querySelectorAll('[data-lanc-nao]').forEach(b => b.onclick = () => fecha(+b.dataset.lancNao, { de: 'a', id: 'lanc-nao', t: 'Tudo bem, não registrei nada.' }));
  }

  const ehMei = ctx => { let p = ''; try { p = sessionStorage.getItem('cw.porte.' + ctx.empresaId) || ''; } catch (e) {} return String(p).startsWith('MEI'); };
  /* telas da gestão do MEI liberadas também no cadastro rápido (status 'mei') e enquanto o cadastro completo é analisado */
  const meiSemAprov = ctx => ehMei(ctx) && ['mei', 'analise', 'pendencia'].includes(((ctx.empresa) || {}).status);
  /* 13/11/2026: o Assistente num botão redondo no canto de baixo, à direita, em todas as telas do MEI (some na própria conversa) */
  let olhar = null;
  function botao(ligar) {
    let b = document.getElementById('mei-assist');
    if (!ligar) { if (b) b.remove(); if (olhar) { window.removeEventListener('hashchange', olhar); olhar = null; } return; }
    if (!b) { b = document.createElement('button'); b.id = 'mei-assist'; b.className = 'mei-assist'; b.type = 'button'; b.setAttribute('aria-label', 'Tirar uma dúvida com o Assistente'); b.title = 'Tirar uma dúvida';
      b.innerHTML = CW.ui.ic('help'); b.onclick = () => CW.ir('assistentemei'); document.body.appendChild(b); }
    if (!olhar) { olhar = () => { const x = document.getElementById('mei-assist'); if (x) x.hidden = /^#assistentemei/.test(location.hash); }; window.addEventListener('hashchange', olhar); }
    olhar();
  }
  CW.registrarModulo({
    id: 'assistentemei', nome: 'Assistente', icone: 'help', ordem: 27.5,
    para: ['empresa'], livre: true, semAprovacao: ctx => meiSemAprov(ctx),
    mostrar: ctx => ['prestador', 'ambos'].includes((ctx.empresa || {}).tipo) && ehMei(ctx),
    iniciar() { conversa = []; dados = null; botao(true); return () => { conversa = []; dados = null; botao(false); }; },
    telas: { conversa: { nome: 'Assistente', sub: 'Perguntas sobre o seu MEI respondidas em linguagem simples, com os seus números.', render: desenhar } }
  });
  CW.assistenteMei = { responder, achar };
})();
