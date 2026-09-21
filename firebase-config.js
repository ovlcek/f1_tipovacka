/* Veřejná konfigurace Firebase. apiKey není tajemství — přístup hlídají firestore.rules. */
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyDZgQO_wDtD4g7yOmmZNaD07HW41XA4K14",
  authDomain: "f1-tipovacka-1c703.firebaseapp.com",
  projectId: "f1-tipovacka-1c703",
  storageBucket: "f1-tipovacka-1c703.firebasestorage.app",
  messagingSenderId: "148846627445",
  appId: "1:148846627445:web:92db78c065058f316a863c",
  measurementId: "G-VJMBBR9EY8"
};

/* Doplň po prvním přihlášení Googlem (Firebase Console → Authentication → Users → User UID).
   Stejné UID patří i do firestore.rules místo ADMIN_GOOGLE_UID_DOPLNIT. */
var ADMIN_UID = "pyKv3EvbHMbS6Azp7KxsoVzGO0B2";

/* Hráči se přihlašují přezdívkou; doména je jen technický obal pro e-mailové přihlášení. */
var PLAYER_MAIL_DOMAIN = "hraci.f1-tipovacka.app";
