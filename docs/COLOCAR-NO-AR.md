# Colocar o Conectwork no ar (piloto Colafix · Zenith · Nexus)

Revisão de 07/11/2026. O app está publicado no GitHub Pages; o que falta para funcionar de verdade é do console do
Firebase (projeto `conectwork`) e dos cadastros. Siga na ordem.

## 1. Console do Firebase (uma vez)
1. **Firestore › Regras:** colar o `firestore.rules` inteiro e **Publicar**. Sem isso nada grava (as regras de hoje do
   console não conhecem contratos, medições, espelhos, notas, títulos, documentos, logos nem triagem).
2. **Firestore › Índices:** criar o índice da coleção `log` (empresaId crescente, em decrescente), igual ao
   `firestore.indexes.json`. O histórico funciona sem ele, mas mais lento.
3. **Firestore › Dados:** criar o documento `master/{seu uid}` com `{ nome: "Iasmyn" }` (o uid aparece em
   Authentication › Usuários depois do seu primeiro login). É o que dá o acesso de equipe Conectwork.
4. **Authentication › Método de login:** ligar E-mail/senha, Google e Microsoft (o README tem o passo a passo da
   Microsoft). Em **Configurações › Domínios autorizados**, conferir que o endereço do GitHub Pages está na lista.
5. **Recomendado:** ligar o **App Check** (reCAPTCHA Enterprise) para o app web, para só o próprio Conectwork usar o banco.
6. **Orçamento:** criar um alerta de gasto no Google Cloud (Faturamento › Orçamentos). No plano grátis o Firestore tem
   limite diário de leituras e gravações; o piloto cabe com folga.

## 2. Cadastros do piloto
1. Entrar com o seu e-mail (equipe Conectwork).
2. Colafix, Zenith e Nexus fazem o cadastro em "Cadastrar empresa" e enviam os arquivos em **Documentos e certidões**
   (contrato social, cartão CNPJ, comprovante de endereço, documento do responsável).
3. Em **Cadastros**, conferir os arquivos, escolher o plano e os módulos (Cobranças e notas + Contratos) e aprovar.
4. Cada administrador convida as pessoas (**Usuários e acessos**) nos cargos:
   - Colafix: RH (lança a medição), Aprovador técnico (aprova a medição e avalia o serviço), Financeiro (espelho,
     confere a nota, libera), Tesouraria (agenda e paga com comprovante). Quem confere a nota não libera, e quem
     libera não confirma o pagamento.
   - Zenith e Nexus: Admin ou Financeiro (confere a medição, emite a nota, informa a conta, dá baixa).
5. Zenith e Nexus enviam as certidões (federal, FGTS, trabalhista, municipal), o PGR e o PCMSO com a validade.
6. Colafix cria o contrato com cada prestadora, faz a **triagem** e assina; a prestadora assina e informa o interlocutor.
   Se a triagem der "requer análise jurídica", registrar o parecer favorável antes de assinar.
7. No painel da Colafix, aprovar o pull request do botão "Enviar ao Conectwork" (PR #21).

## 3. Piloto (uma quinzena em paralelo com a planilha)
Medição pelo painel do RH → prestadora confere → aprovador aprova → financeiro prepara o espelho → prestadora emite a
nota e anexa → financeiro confere → título: libera, tesouraria agenda e paga com comprovante → prestadora dá baixa →
aprovador avalia. Comparar valores, retenções e datas com a planilha. Anotar o que travou.

## 4. Antes de usar sem a planilha
- Parecer jurídico sobre o modelo de equipe contínua (a triagem é controle preventivo, não substitui).
- Regras de retenção com o contador (hoje digitadas à mão em cada espelho).

## O que a revisão de 07/11 verificou e corrigiu
- **Regras grandes demais:** a regra do contrato passava do limite de avaliação do Firestore em alguns caminhos
  (a triagem era recusada sem motivo). Contratos, medições, espelhos e títulos agora vão direto à verificação de cada
  ação, longe do limite.
- **Nota conferida sem conta a pagar:** a regra agora exige que o título seja criado na mesma gravação.
- **Chave da nota:** só as duas empresas da nota consultam se a chave já foi usada.
- **Financeiro** passou a ver Contratos (precisa para conferir documentos e prazos da prestadora).
- Conferido: convite exige o código secreto do link e o mesmo e-mail; conta bancária da prestadora só para quem cuida
  de dinheiro; documentos do cadastro nunca saem da empresa; nada se apaga; toda ação grava no histórico.

## Limites conhecidos (fase 1, sem servidor)
- Avisos só dentro do app (Precisa de você, contadores, número no ícone) e pelo botão "Avisar no WhatsApp". E-mail e
  notificação automáticos precisam de servidor (Cloud Functions, plano Blaze).
- Arquivos (notas, comprovantes, documentos) ficam no próprio banco, até 3 a 5 MB cada. Com mais volume, mudar para o
  Storage (plano Blaze).
- Nota fiscal emitida fora do app (Emissor Nacional ou prefeitura); emitir pelo app exige certificado no servidor.
- O histórico grava o nome que a pessoa tem no perfil; o uid gravado junto é o que identifica de verdade.
