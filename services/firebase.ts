import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  serverTimestamp,
  Firestore
} from 'firebase/firestore';

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBKR1LrqLsAU1k1gcV2Dw0Co70Ubn4j8OQ",
  authDomain: "lista-de-compras-4420b.firebaseapp.com",
  projectId: "lista-de-compras-4420b",
  storageBucket: "lista-de-compras-4420b.firebasestorage.app",
  messagingSenderId: "457388372289",
  appId: "1:457388372289:web:f210e74b357e03ca5b71c0",
  measurementId: "G-DRMYGDKDDE"
};

let db: Firestore | null = null;

try {
  // Use named imports to check for existing apps
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
  console.log("Firebase inicializado com sucesso.");
} catch (error) {
  console.warn("Erro ao inicializar Firebase. O app funcionará em modo offline/demo.", error);
}

export const getDB = () => db;

export const addReminderToDB = async (text: string, type: 'info' | 'alert' | 'action' = 'info') => {
  if (!db) {
    return;
  }
  try {
    await addDoc(collection(db, "smart_home_reminders"), {
      text,
      type,
      createdAt: serverTimestamp(),
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });
  } catch (e) {
    console.error("Erro ao salvar no Firestore:", e);
  }
};