# Plano · Pagamento em lote conectado ao banco (remessa)

Pedido da reunião (12/11/2026): "já começar a planejar o pagamento de remessa em lote conectada no banco".
Este documento é o **plano**. Nada disso está no ar ainda.

## O que não muda (regras do CLAUDE.md)
- **O dinheiro não passa pelo Conectwork.** O lote sai da conta do tomador direto para a conta de cada prestador.
  O Conectwork monta o lote, registra, concilia e mostra o comprovante.
- **"Agendado" não é "pago".** O título só baixa com a **liquidação confirmada pelo banco** (o arquivo ou a API de retorno).
- **Funções separadas:** quem libera o pagamento (financeiro) não é quem monta e manda o lote (tesouraria).
- **Troca de conta bancária exige revisão reforçada.** Título com a conta em revisão não entra no lote.
- **Uma nota não gera dois títulos, e um título não entra em dois lotes abertos.**
- **Nada de segredo no front** (regra de ouro 4): certificado, chave da API do banco e senha só no servidor.

## Hoje
`titulos/{id}`: aprovado → **liberado** (financeiro) → **agendado** (tesouraria, data) → **liquidado** (com o comprovante) → baixado (a prestadora confirma que o dinheiro chegou).
Cada título é pago um a um, fora do Conectwork, e a tesouraria anexa o comprovante.

## Como vai ficar
```
Pagar e receber › "Montar lote"   (tesouraria)
  1. Escolhe os títulos liberados (filtro por vencimento e por banco)
  2. O Conectwork confere: conta da prestadora ok e sem revisão, título em nenhum outro lote aberto
  3. Gera o lote:  lotes/{id}  (rascunho → gerado)
  4a. FASE 1: baixa o arquivo de remessa (CNAB 240) e envia no internet banking da empresa
  4b. FASE 2: manda direto pela API do banco (servidor)
  5. O banco processa e devolve o retorno
  6. O Conectwork lê o retorno: cada título vira "liquidado" (com a data e a autenticação do banco)
     ou volta para "liberado" com o motivo da recusa (ex.: conta encerrada, dados divergentes)
  7. A prestadora vê "Pago" e o comprovante; o histórico registra tudo
```

## Fase 1 · Arquivo de remessa (sem servidor)
Padrão **CNAB 240 da FEBRABAN**, "Pagamento a Fornecedores" (cada banco chama de um jeito: SISPAG no Itaú, Multipag no Bradesco, Pag-For, etc.).
- **Gerado no navegador** (texto de largura fixa): cabeçalho do arquivo, um lote por forma de pagamento e rodapé.
  - **PIX**: segmento A + B (chave Pix ou dados da conta).
  - **TED / crédito em conta**: segmento A + B.
  - **Boleto** (se a prestadora mandar boleto): segmento J.
- A tesouraria **baixa o arquivo** e envia no internet banking da empresa (ela autoriza lá, com a senha e o token dela).
  O Conectwork não guarda senha nem certificado.
- O **retorno** (arquivo `.RET` que o banco devolve) é enviado de volta ao Conectwork e lido no navegador:
  código de ocorrência por título → liquidado ou recusado.
- Precisa, do tomador: o **convênio de pagamento** com o banco (código do convênio, agência e conta da empresa).
  É pedido ao gerente do banco; sem o convênio o banco não aceita o arquivo.

**Por que começar por aqui:** funciona com qualquer banco, sem servidor, e a autorização final continua no banco do cliente.

## Fase 2 · API do banco (com servidor)
Para mandar e receber sem arquivo: API de pagamentos do banco (ou Pix em lote / Open Finance).
- Precisa de **servidor** (Cloud Functions): certificado digital (mTLS), chaves OAuth e o registro de webhooks ficam lá.
- O front só pede "mandar o lote X" e lê o resultado. Cada banco tem a sua API e o seu processo de homologação.
- A liquidação chega por webhook do banco → o servidor marca os títulos como liquidados.

## Dados (proposta)
`lotes/{id}`
```
tomadorId, banco: { codigo, agencia, conta, convenio }, forma: 'pix'|'ted'|'boleto'|'misto',
titulos: [titId…], totalCentavos, qtd, dataPagamento,
status: 'rascunho'|'gerado'|'enviado'|'retorno_parcial'|'concluido'|'cancelado',
arquivo: { nome, sha, geradoEm, geradoPor },          // fase 1
retorno: { nome, lidoEm, lidoPor, liquidados, recusados },
criadoPor, criadoPorNome, criadoEm, atualizadoEm
```
No título: `lote: { id, em }` enquanto o lote está aberto; na liquidação pelo retorno, `liquidacao: { via: 'retorno', banco, autenticacao, data }`.
A conta do convênio do tomador fica em `empresas/{id}/privado/pagamentos` (só admin, financeiro e tesouraria).

**Regras do banco a escrever:** só a tesouraria (ou o admin) cria e mexe no lote; título só entra se `liberado`, com a conta ok e sem revisão, e sem outro lote aberto; quem liberou o título não monta o lote dele; retorno só marca liquidado o que estava no lote; nada se apaga.

## Etapas sugeridas
1. **Montar o lote e baixar o arquivo** (um banco do piloto, PIX + TED).
2. **Ler o retorno** e dar baixa automática (com o comprovante do banco).
3. Boletos (segmento J) e mais bancos.
4. **API do banco** pelo servidor (quando houver o servidor das notas/WhatsApp).

## Decisões para a usuária
- **Qual banco a Colafix usa** para pagar fornecedores (o layout CNAB tem detalhes por banco) e se já tem o convênio de pagamento.
- Formas no piloto: **PIX e TED** (recomendado) ou também boleto.
- Quem monta o lote: **tesouraria** (recomendado, pelas funções separadas).
