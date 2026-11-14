/* A prestadora dá o acesso de quem emite pelos MEIs sem depender da equipe Conectwork (14/11/2026). Só dados inventados. */
const H = require('./harness');
const { ok, fim } = H.placar('emissorprest');

(async () => {
  const { browser, page, erros } = await H.abrir();
  const { d } = H.seed(d => {
    const pessoa = (uid, email, nome, emp, cargo) => { d.users[email] = d.users[email] || { uid, pass: 'senha123' }; d.docs['usuarios/' + uid] = { nome, email }; d.docs[`acessos/${emp}_${uid}`] = { uid, empresaId: emp, nome, email, cargo, extras: [], sem: [], ativo: true }; };
    pessoa('uLEO', 'leo@nexo.com.br', 'Leo Matos', 'nexo', 'admin');
    pessoa('uJU', 'ju@nexo.com.br', 'Julia Prado', 'nexo', 'operacional');
    d.docs['empresas/col'] = { nome: 'Colina Indústria', status: 'aprovado', tipo: 'contratante', modulos: ['cobrancas'], criadoPor: 'uX' };
    d.docs['empresas/nexo'] = { nome: 'Nexo Serviços', razao: 'Nexo Serviços Ltda', cnpj: '04.252.011/0001-10', status: 'aprovado', tipo: 'prestador', modulos: ['cobrancas'], criadoPor: 'uX' };
    d.docs['empresas/meic'] = { nome: 'Carlos Ramos', cnpj: '33.000.167/0001-01', status: 'aprovado', preCadastro: true, tipo: 'prestador', modulos: [], criadoPor: 'uX' };
    d.docs['empresas/meib'] = { nome: 'Bia Costa', cnpj: '11.222.333/0001-81', status: 'aprovado', preCadastro: true, tipo: 'prestador', modulos: [], criadoPor: 'uX' };
    d.docs['cnpjs/33000167000101'] = { empresaId: 'meic' }; d.docs['cnpjs/11222333000181'] = { empresaId: 'meib' };
    d.docs['medicoes/cn_2026-10-2'] = { contratoId: 'cn', tomadorId: 'col', prestadorId: 'nexo', partes: ['col', 'nexo'], tomadorNome: 'Colina Indústria', prestadorNome: 'Nexo Serviços', periodicidade: 'quinzena', periodo: '2026-10-2',
      valorCentavos: 650000, memoria: [{ nome: 'Sem CNPJ', horas: 10, valorCentavos: 0 }, { nome: 'Carlos Ramos', horas: 96.8, valorCentavos: 350000, cnpj: '33000167000101' }, { nome: 'Bia Costa', horas: 90, valorCentavos: 300000, cnpj: '11222333000181' }],
      obs: '', origem: 'manual', ref: '', status: 'aprovada', divergencia: null, criadoPor: 'uRH', criadoPorNome: 'Rita' };
  });
  const srv = () => page.evaluate(() => JSON.parse(localStorage.getItem('__srv')).docs);
  await H.preparar(page, d); await page.goto(H.BASE);
  await H.entrar(page, 'leo@nexo.com.br', 'senha123'); await page.waitForSelector('.shell', { timeout: 8000 }); await H.dorme(800);
  await page.evaluate(() => { location.hash = '#repasse/ver/cn_2026-10-2'; });
  const tem = await page.waitForSelector('#rp-em-dar', { timeout: 10000 }).then(() => true).catch(() => false);
  ok('P1 o administrador da prestadora vê "Quem emite as notas dos MEIs" (sem a equipe Conectwork)', tem);
  if (tem) {
    await page.selectOption('#rp-em-quem', 'uJU'); await page.click('#rp-em-dar'); await page.waitForSelector('#rp-em-lista', { timeout: 8000 }).catch(() => null);
    const S = await srv(), a1 = S['acessos/meic_uJU'] || {}, a2 = S['acessos/meib_uJU'] || {};
    ok('P2 grava o acesso com o vínculo pela linha da medição (viaMedicao + viaItem)', a1.cargo === 'operacional' && a1.emissorPor === 'nexo' && a1.viaMedicao === 'cn_2026-10-2' && a1.viaItem === 1 && a2.viaItem === 2, JSON.stringify([a1, a2]));
    const log = Object.values(S).filter(x => x && x.acao === 'acesso.emissor').map(x => x.texto).join(' | ');
    ok('P3 o histórico diz quem liberou (o administrador da prestadora)', /liberado pelo\(a\) administrador\(a\) da Nexo/.test(log), log);
  }
  ok('P5 sem erro de JavaScript na página', !erros.filter(x => !/ERR_NAME_NOT_RESOLVED/.test(x)).length, erros.join(' | '));
  await browser.close(); process.exit(fim());
})().catch(e => { console.error('ERRO NO TESTE', e); process.exit(1); });
