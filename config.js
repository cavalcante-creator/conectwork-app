// Configuração do Firebase do Conectwork (projeto conectwork-4c285).
// Pode ficar no repositório: no Firebase, quem protege os dados são as regras do Firestore, não esta chave.
window.CONECTWORK_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCRXQAaDuQt0W8paod9rzUCwHIVMPlRdXQ",
    authDomain: "conectwork-4c285.firebaseapp.com",
    projectId: "conectwork-4c285",
    storageBucket: "conectwork-4c285.firebasestorage.app",
    messagingSenderId: "468863538962",
    appId: "1:468863538962:web:55a0bc24e1ed4a8a69c5cb"
  },
  ambiente: "producao",            // "producao" ou "teste"
  urlApp: "https://conectwork.com.br/",
  meiDinheiro: false,              // true liga o Dinheiro do MEI (entradas, saídas e o botão Registrar); desligado a pedido da usuária em 10/11/2026
  suporteEmail: "",                // e-mail do suporte que aparece em Ajuda (vazio: a tela pede para falar com quem apresentou o Conectwork)
  suporteWhatsapp: "",             // WhatsApp do suporte com DDI e DDD, só números (ex.: 5551999990000)
  loginMicrosoft: false            // true quando o app estiver registrado no Azure e ligado no Firebase (README › Login com Google e Microsoft)
};
