# Requisitos · Fase 1 (piloto Colafix)

Referência visual e de fluxo: `docs/prototipo-referencia.html`. Este documento diz **o que** o app real faz; o protótipo mostra **como fica**.

## Etapa 0 · Base
- Casca do app no visual do protótipo (menu lateral, barra superior, modo claro e escuro, celular com barra de navegação embaixo).
- Firebase inicializado a partir de `config.js`.
- Login com **e-mail e senha** (Firebase Auth) e **"Esqueci minha senha"** (e-mail de redefinição do próprio Firebase).
- Depois do login: carrega `usuarios/{uid}`, os `acessos` da pessoa e se ela é `master`.
  - Sem nenhum acesso e não é master: tela "Você ainda não tem acesso a nenhuma empresa" com as opções "Cadastrar minha empresa" e "Tenho um convite".
  - Com mais de um acesso: escolhe a empresa (e pode trocar depois pelo topo).
- Roteamento por hash `#modulo/tela`, registro de módulos e menu montado pelas permissões.
- Helpers: toast, diálogo, painel lateral, máscaras (CNPJ, CPF, CEP, celular), validação de CNPJ/CPF, formatação de dinheiro e data.
- `log.js`: função única para gravar no histórico.
- Testes: regras do Firestore no emulador e testes de tela, no padrão do painel da Colafix.

## Etapa 1 · Acesso
1. **Cadastro de empresa** em 6 etapas (como no protótipo): tipo e dados, endereço, responsável, banco, documentos (nesta etapa guardar só nome e tamanho do arquivo), revisão com aceites (veracidade, termos, LGPD).
   - Grava `empresas/{id}` (status `analise`) e `empresas/{id}/privado/cadastro`, e cria o acesso `admin` do fundador.
   - CNPJ não pode repetir (consultar antes de gravar).
2. **Análise de cadastros** (equipe master): lista por situação, tela de análise com dados, documentos com "conferido", taxa e módulos; decisões aprovar, pedir ajuste (motivo obrigatório) e recusar (motivo obrigatório).
3. **Meu cadastro** para empresa não aprovada: situação, protocolo, histórico, motivo do ajuste e "Corrigir cadastro".
4. **Usuários e acessos** (admin): lista de pessoas da empresa com cargo, situação e o que cada uma vê; trocar cargo; ajustar acesso (extras e sem); bloquear e liberar.
5. **Convites**: admin informa nome, e-mail, WhatsApp e cargo → cria `convites/{token}` → mostra o link e o botão "Enviar pelo WhatsApp" (abre o WhatsApp com a mensagem pronta) e "Copiar link". Reenviar e cancelar convite.
6. **Primeiro acesso pelo convite**: o link abre o app com o token; a pessoa cria a conta (e-mail do convite, senha com 8+ caracteres, letras e números), aceita os termos, e o app cria o `acesso` e marca o convite como usado.
7. **Troca de empresa** no topo para quem tem mais de um acesso (ex.: contador).
8. **Histórico de alterações**: tela com filtro por pessoa e busca, para admin e master.
9. **Minha empresa**: dados aprovados, documentos e módulos contratados.

## Etapa 2 · Cobranças e notas
Cobrança manual (contratante → prestador), envio do XML da NFS-e pelo prestador com leitura e conferência de valor e CNPJs (reaproveitar a lógica de leitura do XML do `rh-pjpag.js` do painel), recusa de nota com motivo, pagamento registrado (individual e em lote), painel lateral de detalhe, situação em carimbo, filtros, avisos internos.

## Etapa 3 · Integração com o painel da Colafix
Conta de integração da Colafix no Conectwork; o `rh-pjpag.js` envia o fechamento (`tipo: periodo` ou `encerramento`) para `fechamentos/`; o Conectwork cria a cobrança. Encerramento de serviço do profissional como no protótipo.

## Etapa 4 · Completar a fase 1
Profissionais da intermediária e convite do MEI, área do MEI (faturamento, DAS, declaração), currículo e avaliações mensais, documentos com validade e renovação, relatórios e exportação, central de ajuda, avisos pelo WhatsApp (precisa de servidor e provedor: decidir antes).

## Fora da fase 1
Emissão de NFS-e pela plataforma, conta e antecipação com banco, catálogo aberto, retenções automáticas (definir com contador antes da etapa 2 terminar).
