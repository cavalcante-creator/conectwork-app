# Plano · Conectwork para o MEI (10/11/2026)

Base: o prompt "plataforma inteligente de gestão para MEI" e o plano de parceria com a Prefeitura de Gravataí (piloto de 6 meses, Sala do Empreendedor).
Não é um app novo: é o **perfil MEI do Conectwork**, no mesmo login, banco e regras. Na tela aparece só o nome Conectwork (CLAUDE.md).
O que vier de fora (IA, leitura de comprovante, banco, NFS-e, WhatsApp) precisa de servidor e fica marcado como **servidor**.

## 1. O que já existe e é reaproveitado

| Prompt | Já existe no Conectwork | Arquivo |
|---|---|---|
| Dashboard | Início do MEI com botões grandes, "Hoje", limite | `modulos/inicio.js` |
| Faturamento anual e limite | Meu negócio: notas + faturamento fora, barra do limite | `modulos/negocio.js` |
| Fiscal (DAS, DASN, relatório mensal) | Empresa em dia, relatório mensal em PDF | `modulos/negocio.js` |
| Notas fiscais | Espelho da nota + assistente de emissão (Emissor Nacional) | `modulos/espelhos.js`, `modulos/assistente.js` |
| Contas a receber (das empresas da rede) | Pagar e receber, com comprovante | `modulos/titulos.js` |
| Agenda e lembretes | Agenda com prazos automáticos | `modulos/agenda.js` |
| Assistente | Assistente guiado, sem IA | `modulos/assistentemei.js` |
| Segurança, LGPD, histórico, permissões | Regras por empresa, `log`, consentimentos | `firestore.rules`, `js/log.js` |

## 2. Arquitetura

- Front: JavaScript puro, sem build, GitHub Pages (`conectwork.com.br`). Um arquivo por módulo (`CW.registrarModulo`).
- Banco: Firestore, cada documento com `empresaId`; regras + testes no emulador (`teste-regras.js`).
- Regras de cálculo (faturamento, limite, DAS, resultado do mês) em funções verificáveis no front, com teste. A IA nunca faz conta: só entende a frase e prepara o lançamento.
- **Servidor (etapa futura, Cloud Functions, plano Blaze):** IA de conversa livre, leitura de comprovante por foto, Open Finance, emissão de NFS-e, WhatsApp/e-mail automático, painel agregado da Prefeitura. Nenhuma chave fica no front.

## 3. Banco de dados (novo no MVP)

`movimentos/{id}` · dinheiro do MEI fora das notas do Conectwork
```
empresaId, tipo: 'entrada' | 'saida', valorCentavos (int > 0), data 'AAAA-MM-DD',
descricao (≤120), categoria (lista fixa por tipo), forma: pix|dinheiro|cartao|boleto|transferencia|outro,
situacao: 'pago' | 'aberto'  (aberto = a receber / a pagar), vencimento 'AAAA-MM-DD' | '',
cliente (≤80, opcional), origem: 'manual' | 'assistente', removido (bool),
criadoPor, criadoPorNome, criadoEm, atualizadoEm, pagoEm
```
- Categorias de entrada: Venda, Serviço, Outra entrada. De saída: Material, Mercadoria para revenda, Transporte, Aluguel, Contas (luz, água, internet), Impostos (DAS), Equipamento, Outra despesa.
- Regras: membro lê; admin/financeiro criam e mudam; ninguém apaga (`removido`); histórico em `log`.
- O que vem do Conectwork (notas e títulos) **não** é copiado para `movimentos`: a tela soma as duas fontes, marcando a origem, para nunca contar duas vezes.

Faturamento do ano (limite do MEI) = notas do Conectwork + entradas `pago` de `movimentos` (Venda/Serviço) + o "faturamento fora" que já existe em `faturamento/{emp}` (meses antigos).

## 4. Telas e navegação do MEI

Barra de baixo (celular) e menu simples: **Início · Dinheiro · Agenda · Demandas · Mais**, com o botão **+ Registrar** sempre à mão.
- **Início**: o de hoje + "Este mês" (entrou, saiu, sobrou) e "Atenção para hoje".
- **Dinheiro**: resumo do mês, lista de movimentos, a receber e a pagar (os do Conectwork e os próprios), gráfico de 6 meses, PDF e Excel do mês.
- **+ Registrar**: formulário curto (Entrou / Saiu → valor → o quê → como pagou → pago ou em aberto) ou uma frase para o assistente.
- **Assistente**: entende frases como "Vendi R$ 200 hoje no Pix", "Comprei R$ 80 de material", "Um cliente me deve R$ 150", mostra o lançamento pronto e só grava depois do "Confirmar".
- **Mais**: Meu negócio (fiscal e limite), Notas a emitir, A receber do Conectwork, Contratos, Documentos, Assistente, Minha empresa.

## 5. Fluxos principais

1. Registrar em segundos: + Registrar → Entrou/Saiu → valor → categoria → pronto (data hoje e "pago" já vêm marcados).
2. Pela frase: Assistente → "vendi 200 no pix" → cartão "Entrada · R$ 200,00 · Venda · Pix · hoje" → Confirmar → grava e o Início atualiza.
3. Receber o que está em aberto: Dinheiro › A receber → "Recebi" → vira pago com a data.
4. Fim do mês: Dinheiro › "Relatório do mês" (PDF/Excel) e Meu negócio › relatório mensal das receitas brutas (já existe).

## 6. Etapas

- **Etapa 1 · MVP (agora, sem servidor):** `movimentos` (regras e testes), Dinheiro, + Registrar, assistente que lança por frase (regras, sem IA), Início com "Este mês", faturamento anual somando os lançamentos, relatório do mês.
- **Etapa 2:** voz (ditado do navegador, sem servidor), clientes e cobrança (lembrete), orçamento. **Servidor:** foto de comprovante, Open Finance, NFS-e.
- **Etapa 3:** produtos, serviços e estoque (liga só para quem vende), formação de preço e margem.
- **Etapa 4:** previsão de caixa, despesas fora do comum, recomendações. **Servidor:** IA de conversa livre.
- **Piloto com a Prefeitura:** painel mensal agregado e anônimo (quantos MEIs com DAS em dia, notas no padrão nacional, uso) e selo "prestador em dia". Os números saem de contas agregadas, sem nome nem CNPJ.

## 7. Decisões (10/11/2026)

- **Planos do MEI:** a definir depois. Nada de plano ou cobrança no app por enquanto; tudo liberado no perfil MEI.
- **Cadastro rápido:** o MEI entra na hora com CNPJ, nome e atividade e já usa a gestão do próprio negócio; para receber demandas e contratos de empresas da rede, passa pela análise e envia os documentos. *(feito: `modulos/cadastromei.js`)*
- **Público:** todos os MEIs. Demandas e contratos para quem presta serviço; estoque só para quem vende (etapa 3).
- **Cor:** sem verde. Entrada em azul, saída em laranja.

## 8. Feito na etapa 1

- `movimentos` com regras e testes (`teste-regras.js`), tela **Dinheiro** (`modulos/dinheiro.js`), botão **Registrar** sempre à mão, assistente que lança por frase com confirmação, Início com "Este mês", faturamento do ano e relatório mensal das receitas somando as vendas e serviços lançados, relatório do mês em PDF e Excel. Teste: `teste-dinheiro.js`.
- **Cadastro rápido do MEI** (`modulos/cadastromei.js`): "Sou MEI" na tela de entrar; conta + MEI numa tela só; empresa com status `mei` (só gestão, fora da rede, não pode ser contratada); "Completar cadastro para receber pedidos" leva ao cadastro completo e à análise. Teste: `teste-cadastromei.js`.
