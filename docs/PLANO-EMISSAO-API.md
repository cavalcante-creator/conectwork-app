# Plano · Emitir a NFS-e pelo próprio Conectwork

Hoje o profissional emite no Emissor Nacional (ou na prefeitura) com o **assistente de emissão** (campos prontos para
copiar) e anexa o PDF/XML. O próximo passo é o Conectwork emitir sozinho, com um toque. Isso **não pode** ser feito só no
navegador: exige o certificado digital da empresa e assinatura do XML, que pela regra 4 do CLAUDE.md ficam só no
servidor. Este documento é o plano para quando houver servidor.

> Endereços, versões de layout e regras da API mudam: confirmar tudo na documentação oficial da NFS-e Nacional
> (gov.br/nfse › Documentação técnica) antes de começar.

## Como funciona a emissão nacional (visão geral)
- A empresa monta a **DPS** (Declaração de Prestação de Serviço) em XML, no leiaute nacional.
- A DPS é **assinada** com o certificado digital ICP-Brasil da própria empresa (A1, arquivo .pfx), no padrão XMLDSig.
- A DPS assinada vai para a **API da Sefin Nacional** numa conexão com o mesmo certificado (TLS mútuo).
- A API valida e devolve a **NFS-e** (XML com a chave de acesso de 50 números); o DANFSe (PDF) é gerado a partir dela.
- Existe um ambiente de **produção restrita** (testes, sem valor fiscal) separado da produção.
- Prefeituras que ainda não usam o padrão nacional têm API própria (fica fora da primeira versão).

## O que precisa existir
1. **Plano Blaze do Firebase** (pago por uso) para usar **Cloud Functions**.
2. **Cofre do certificado:** o .pfx e a senha de cada empresa guardados cifrados no servidor (Secret Manager do Google
   Cloud, um segredo por empresa). O navegador envia o arquivo uma vez, por HTTPS, direto para a função, que guarda e
   nunca devolve. Ninguém do Conectwork vê a senha. Aviso de vencimento do certificado (eles valem 1 ano).
3. **Consentimento específico** ("autorizo o Conectwork a emitir notas fiscais em nome da minha empresa com o meu
   certificado"), com texto, versão, data e revogação (regra de consentimentos separados). Revogar apaga o certificado.
4. **Cloud Function `emitirNota`** (chamada pelo app, com o login da pessoa):
   - confere nas regras do banco que a pessoa é admin/financeiro/operacional da prestadora e que o espelho está
     "esperando a nota";
   - monta a DPS a partir do espelho + "meu modelo de nota" (código de tributação, município, complemento) + cadastro;
   - numera a DPS (série e número sequencial por empresa, guardados no servidor, sem buraco nem repetição);
   - assina, envia, recebe a NFS-e, guarda o XML e o PDF e atualiza o espelho como "nota enviada" (mesma conferência
     tripla de hoje: emitente, tomador, valor, competência, nota repetida);
   - grava no histórico quem emitiu e quando.
5. **Cancelamento e substituição** pela mesma função (evento de cancelamento com motivo), ligados à recusa de nota.
6. **Testes:** emulador do Firebase + produção restrita da Sefin com um certificado de teste.

## Custos e prazos (estimativa)
- Firebase Blaze: no volume do piloto, alguns reais por mês (funções + armazenamento).
- Certificado A1 de cada empresa: a empresa já tem ou compra (cerca de R$ 150 a R$ 250 por ano).
- Desenvolvimento: 3 a 4 semanas para a primeira versão (emitir, cancelar, guardar certificado), contando os testes na
  produção restrita.

## Riscos e cuidados
- O certificado permite emitir notas em nome da empresa: acesso só pela função, com registro de cada uso.
- Erro de leiaute ou de código de tributação recusa a nota: mostrar o motivo devolvido pela API em português simples.
- MEI: muitos emitem com a conta gov.br (sem certificado). A API exige certificado; para esses, o assistente continua
  sendo o caminho.

## O que já está pronto e será reaproveitado
Espelho com todos os dados da nota, "meu modelo de nota", conferência da nota (XML), chave única contra nota repetida,
recusa com motivo, título e pagamento. A emissão pela API só troca o "copiar e colar" por um botão.
