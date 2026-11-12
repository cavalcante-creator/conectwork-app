/* Conectwork · Ajuda (12/11/2026): perguntas frequentes por assunto, com busca, e o contato com o suporte.
   Fora do menu: abre pelo "?" no cartão da pessoa (topo), pelos Primeiros passos do Início e pela busca do topo.
   O contato do suporte vem do config.js (suporteEmail, suporteWhatsapp); sem eles, a tela diz para falar com quem
   apresentou o Conectwork. Os textos explicam o que o app faz hoje; nada de promessa jurídica. */
(function () {
  const CW = window.CW;
  const U = () => CW.ui;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const AVISO = 'O Conectwork organiza a contratação e a gestão documental. A validade da relação depende da operação real, da legislação aplicável e da análise jurídica e contábil adequada.';

  /* para: 'todos' | 'contrata' | 'presta' | 'mei' | 'cidade' — decide a ordem dos assuntos; tudo continua na busca */
  const ASSUNTOS = [
    { id: 'comeco', t: 'Para começar', ic: 'star', para: 'todos', p: [
      ['O que o Conectwork faz?', 'Organiza a contratação de serviços entre empresas: o contrato, a comprovação da entrega (medição ou aceite da ordem de serviço), o espelho da nota fiscal, a conferência da nota, as contas a pagar e a receber e o histórico de cada relação. Não dá garantia jurídica: a validade da relação depende de como o serviço acontece de verdade.'],
      ['O dinheiro passa pelo Conectwork?', 'Não. O pagamento sai de quem contrata direto para quem presta o serviço. O Conectwork registra, agenda e mostra o comprovante, e só dá baixa quando o pagamento é confirmado.'],
      ['Por onde eu começo?', 'No Início, o administrador vê os Primeiros passos: pôr a logo, enviar os documentos, convidar a equipe e cadastrar o primeiro contrato. Cada passo se marca sozinho quando é feito.'],
      ['Como troco de empresa?', 'Se você tem acesso a mais de uma empresa, toque no nome da empresa no alto da tela e escolha a outra. Cada empresa só vê o que é dela.']
    ] },
    { id: 'equipe', t: 'Pessoas e cargos', ic: 'users', para: 'todos', p: [
      ['Como convido alguém da minha equipe?', 'Em Usuários e acessos, toque em "Convidar pessoa", informe o e-mail e o cargo. A pessoa recebe um link (dá para mandar pelo WhatsApp) e entra com aquele e-mail. O convite vale só para esse e-mail.'],
      ['Para que servem os cargos?', 'Cada cargo vê só o que precisa: o financeiro vê pagar e receber, o aprovador técnico aprova entregas e medições, a tesouraria confirma os pagamentos, o contador só consulta. Quem pede um serviço não aprova o pagamento sozinho.'],
      ['Posso dar uma tela a mais para uma pessoa?', 'Sim. Em Usuários e acessos, "Ajustar acesso" acrescenta ou tira telas daquela pessoa, além do que o cargo libera.'],
      ['Alguém saiu da empresa. O que faço?', 'Em Usuários e acessos, toque em "Bloquear". A pessoa deixa de entrar na empresa na hora; o histórico do que ela fez continua guardado.']
    ] },
    { id: 'contratos', t: 'Contratos e triagem', ic: 'file', para: 'contrata', p: [
      ['Quais tipos de contrato existem?', 'Dois: serviço por ordem de serviço (uma entrega que dá para identificar, com escopo, prazo e valor) e equipe contínua (uma prestadora com equipe e supervisor próprios, paga pela medição do período).'],
      ['O que é a triagem?', 'São perguntas rápidas sobre como o serviço vai funcionar: entrega ou posto, quem dá as ordens, jornada, exclusividade e relação nos últimos 18 meses. O resultado é "compatível", "requer análise jurídica" ou "não publicar neste modelo". É um controle preventivo, não um certificado jurídico.'],
      ['Como o contrato é assinado?', 'As duas empresas assinam no próprio Conectwork. A assinatura registra quem e quando; a assinatura eletrônica com validade jurídica entra numa etapa futura.'],
      ['Posso mudar o vencimento?', 'O vencimento vem do contrato e só muda com o aceite das duas empresas: uma propõe e a outra aceita.']
    ] },
    { id: 'medicoes', t: 'Medições e ordens de serviço', ic: 'ruler', para: 'contrata', p: [
      ['Como lanço a medição do período?', 'Em Medições, toque em "Nova medição", escolha o contrato e o período e informe cada profissional com as horas e o valor. A prestadora confere e depois o aprovador técnico aprova.'],
      ['Posso lançar a medição com uma planilha?', 'Sim. Na Nova medição, "Preencher com uma planilha" lê um arquivo do Excel ou CSV com as colunas Nome, Horas, Valor e, se houver, CNPJ do MEI. Baixe o modelo no mesmo lugar. Confira as linhas antes de enviar.'],
      ['A prestadora não concorda com a medição. E agora?', 'Ela marca a divergência com o motivo. Você corrige a medição e ela volta para a prestadora conferir.'],
      ['Como funciona a ordem de serviço?', 'Quem contrata abre a ordem com o que entregar, o prazo e o valor. O profissional aceita ou recusa (recusar nunca reduz a reputação), entrega, e quem contratou dá o aceite total, parcial ou aponta divergência.']
    ] },
    { id: 'notas', t: 'Espelho e nota fiscal', ic: 'receipt', para: 'todos', p: [
      ['O que é o espelho da nota?', 'É o rascunho da nota fiscal, feito a partir da medição ou da entrega aprovada: tomador, descrição, valor, retenções e líquido. A prestadora usa o espelho para emitir a nota no emissor da cidade dela.'],
      ['Como a nota é conferida?', 'A prestadora anexa a nota (PDF ou XML). O Conectwork confere a nota com o contrato, com a medição ou o aceite e com o espelho. Nota divergente não pode ser paga, e uma nota não gera dois títulos.'],
      ['A nota foi recusada. O que faço?', 'O motivo aparece no espelho. Cancele a nota no emissor, emita outra e anexe no mesmo espelho.']
    ] },
    { id: 'pagar', t: 'Pagar e receber', ic: 'wallet', para: 'todos', p: [
      ['Quando aparece o título para pagar?', 'Quando a nota é conferida, o título entra em Pagar e receber no dia do vencimento do contrato.'],
      ['"Agendado" já é pago?', 'Não. A tesouraria agenda o pagamento e só marca como pago quando o dinheiro sai de verdade, com a data e o comprovante.'],
      ['Onde vejo o relatório do mês?', 'Em Relatórios: notas da competência, retenções, pagamentos e o que está em aberto, para baixar em Excel ou PDF e mandar para o contador.']
    ] },
    { id: 'docs', t: 'Documentos e certidões', ic: 'folder', para: 'todos', p: [
      ['Quem vê os documentos da minha empresa?', 'Só a sua empresa e a equipe Conectwork (para analisar o cadastro). Quem contrata vê a situação das certidões da prestadora (em dia ou vencida), não os arquivos de outros assuntos.'],
      ['Como sei que uma certidão vai vencer?', 'Cada documento tem a validade. Quando falta pouco, ele aparece em "Precisa de você" no Início.']
    ] },
    { id: 'mei', t: 'Para o MEI', ic: 'star', para: 'mei', p: [
      ['O cadastro do profissional é pago?', 'Não. O cadastro do profissional MEI é gratuito.'],
      ['O Conectwork emite o meu DAS?', 'Ainda não. Em Meu MEI › DAS você acompanha mês a mês, abre o site oficial para gerar a guia e marca "Paguei". A consulta direta na Receita depende de uma integração oficial que vem depois.'],
      ['Como recebo pedidos de empresas?', 'Complete o cadastro em "Meu cadastro" com os documentos. Depois da conferência da equipe Conectwork, a sua empresa pode receber demandas e contratos.'],
      ['Posso recusar uma demanda?', 'Pode, sempre. Recusar não reduz a sua reputação nem gera punição. Você decide como, quando e onde faz o trabalho.']
    ] },
    { id: 'cidade', t: 'Na sua cidade', ic: 'building', para: 'mei', p: [
      ['O que aparece em "Na sua cidade"?', 'Cursos, eventos, licitações, crédito, avisos e serviços que a Prefeitura da sua cidade publica no Conectwork. Primeiro vem o que serve para você agora, como uma oficina de DAS quando há guia vencida.'],
      ['Quais dados a Prefeitura recebe quando me inscrevo?', 'Só o nome do negócio, o seu nome, e-mail e telefone, e só para aquela inscrição, depois que você autoriza. Você pode cancelar a inscrição quando quiser.'],
      ['O comprovante de recebimentos é enviado para o banco?', 'Não. Você baixa o PDF e leva para quem pedir. O Conectwork não manda os seus dados para ninguém.']
    ] },
    { id: 'lgpd', t: 'Segurança e dados pessoais', ic: 'shield', para: 'todos', p: [
      ['Como os meus dados são protegidos?', 'Cada empresa só lê o que é dela; a regra fica no servidor do banco de dados, não só na tela. Toda mudança fica no Histórico de alterações, com quem e quando, e o histórico não pode ser apagado.'],
      ['Posso mudar o que autorizei?', 'Sim. Em Minhas autorizações (o escudo no alto da tela) você vê cada autorização com data e versão do texto e muda as opcionais quando quiser. Cursos e ofertas começam desmarcados.'],
      ['Como troco o meu e-mail ou a senha?', 'Toque no seu nome no alto da tela, em Meus dados. O e-mail novo só passa a valer depois que você abre o link enviado para ele.']
    ] }
  ];
  const ORDEM = { contrata: ['comeco', 'contratos', 'medicoes', 'notas', 'pagar', 'equipe', 'docs', 'lgpd'], presta: ['comeco', 'notas', 'medicoes', 'contratos', 'pagar', 'docs', 'equipe', 'lgpd'], mei: ['comeco', 'mei', 'notas', 'pagar', 'cidade', 'docs', 'lgpd'] };
  let q = '';

  const perfil = ctx => {
    const c = ctx.contexto || {}; if (c.tipo !== 'empresa') return 'contrata';
    if (CW.app.mei && CW.app.mei()) return 'mei';
    return (c.empresa || {}).tipo === 'prestador' ? 'presta' : 'contrata';
  };
  function assuntos(ctx) {
    const o = ORDEM[perfil(ctx)], vistos = new Set(o);
    return o.map(id => ASSUNTOS.find(a => a.id === id)).concat(ASSUNTOS.filter(a => !vistos.has(a.id)));
  }
  function suporte() {
    const cfg = window.CONECTWORK_CONFIG || {}, email = String(cfg.suporteEmail || '').trim(), zap = String(cfg.suporteWhatsapp || '').replace(/\D/g, '');
    return { email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : '', zap: zap.length >= 12 ? zap : '' };
  }

  function render(el, ctx) {
    const { esc, ic } = U(), S = suporte(), As = assuntos(ctx);
    try { localStorage.setItem('cw.ajuda.vista', '1'); } catch (e) {}
    document.getElementById('acoes').innerHTML = '';
    const emp = (ctx.contexto && ctx.contexto.nome) || '', tela = (ctx.params || [])[0];
    const corpo = encodeURIComponent(`Olá, preciso de ajuda no Conectwork.\n\nEmpresa: ${emp}\nO que aconteceu: `);
    el.innerHTML = `<div class="aj-busca"><span class="ic">${ic('busca')}</span><input id="aj-q" type="search" placeholder="Procure uma dúvida (ex.: nota recusada)" autocomplete="off" value="${esc(q)}" aria-label="Procurar na ajuda"></div>
      <div class="aj-grade">
        <div class="aj-col" id="aj-lista">${As.map(a => `<section class="card aj-ass" data-ass="${a.id}"><div class="card-h"><span class="ic">${ic(a.ic)}</span><h3>${esc(a.t)}</h3></div>
          ${a.p.map(([pg, rs], i) => `<details class="aj-p" data-txt="${esc(norm(a.t + ' ' + pg + ' ' + rs))}"${a.id === tela && !i ? ' open' : ''}><summary>${esc(pg)}</summary><p>${esc(rs)}</p></details>`).join('')}</section>`).join('')}
          <div class="card" id="aj-nada" hidden><div class="empty"><div class="ic">${ic('help')}</div><strong>Não achei nada com essas palavras</strong><span>Tente outra palavra ou fale com o suporte.</span></div></div></div>
        <aside class="aj-lado">
          <section class="card" id="aj-suporte"><div class="card-h"><span class="ic">${ic('mail')}</span><h3>Falar com o suporte</h3></div><div class="card-b stack" style="gap:10px">
            ${S.email || S.zap ? `<p class="hint" style="margin:0">Conte o que aconteceu e em qual tela. Não mande senhas nem documentos pessoais pela mensagem.</p>
              ${S.zap ? `<a class="btn" id="aj-zap" href="https://wa.me/${S.zap}?text=${corpo}" target="_blank" rel="noopener noreferrer">${ic('send')}WhatsApp do suporte</a>` : ''}
              ${S.email ? `<a class="btn ${S.zap ? 'sec' : ''}" id="aj-email" href="mailto:${esc(S.email)}?subject=${encodeURIComponent('Ajuda no Conectwork · ' + emp)}&body=${corpo}">${ic('mail')}${esc(S.email)}</a>` : ''}`
              : `<p style="margin:0" id="aj-sem-contato">Fale com a pessoa da equipe Conectwork que apresentou o app para a sua empresa. O canal de suporte aparece aqui assim que for definido.</p>`}
          </div></section>
          <section class="card" id="aj-atalhos"><div class="card-h"><span class="ic">${ic('star')}</span><h3>Atalhos</h3></div><div class="card-b aj-at">
            ${[['inicio', 'Início e Primeiros passos'], ['autorizacoes', 'Minhas autorizações'], ['meusdados', 'Meus dados (e-mail e senha)'], ['usuarios', 'Usuários e acessos'], ['historico', 'Histórico de alterações']]
              .filter(([id]) => CW.app.visiveis().some(m => m.id === id)).map(([id, t]) => `<a class="linkbtn" href="#${id}">${ic('chev')}${esc(t)}</a>`).join('')}
          </div></section>
          <p class="hint" style="font-size:12.5px;margin:0">${esc(AVISO)}</p>
        </aside></div>`;
    const inp = el.querySelector('#aj-q');
    const filtra = () => {
      q = inp.value; const ps = norm(q).split(/\s+/).filter(Boolean); let n = 0;
      el.querySelectorAll('.aj-ass').forEach(sec => { let v = 0;
        sec.querySelectorAll('.aj-p').forEach(d => { const ok = ps.every(p => d.dataset.txt.includes(p)); d.hidden = !ok; if (ok) v++; if (ps.length) d.open = ok && v <= 3; });
        sec.hidden = !v; n += v; });
      el.querySelector('#aj-nada').hidden = !!n;
    };
    inp.oninput = filtra; if (q) filtra();
    const at = tela && el.querySelector(`[data-ass="${CSS.escape(tela)}"]`); if (at) at.scrollIntoView({ block: 'start' });
  }

  CW.registrarModulo({
    id: 'ajuda', nome: 'Ajuda', icone: 'help', ordem: 99, menu: false,
    para: ['empresa', 'master'], livre: true, semAprovacao: true,
    buscar() { return ASSUNTOS.flatMap(a => a.p.map(([pg]) => ({ t: pg, s: 'Ajuda · ' + a.t, rota: 'ajuda/lista/' + a.id, txt: a.t }))); },
    telas: { lista: { nome: 'Ajuda', sub: 'Respostas curtas sobre como o Conectwork funciona e o contato com o suporte.', render } }
  });
  CW.ajuda = { ASSUNTOS, suporte };
})();
