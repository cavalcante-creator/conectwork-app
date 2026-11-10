// Copie este arquivo para config.js e cole aqui o firebaseConfig do projeto "conectwork".
// A apiKey do Firebase pode ficar no front: quem protege os dados são as regras do Firestore.
window.CONECTWORK_CONFIG = {
  firebase: {
    apiKey: "COLE_AQUI",
    authDomain: "COLE_AQUI.firebaseapp.com",
    projectId: "COLE_AQUI",
    storageBucket: "COLE_AQUI.appspot.com",
    messagingSenderId: "COLE_AQUI",
    appId: "COLE_AQUI"
  },
  ambiente: "producao",            // "producao" ou "teste"
  urlApp: "https://conectwork.com.br/",
  meiDinheiro: false,              // true liga o Dinheiro do MEI (entradas, saídas e o botão Registrar)
  loginMicrosoft: false            // true quando o app estiver registrado no Azure e ligado no Firebase
};
