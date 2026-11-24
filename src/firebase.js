// Inicialización de Firebase y helpers de sincronización en la nube.
// Se combina con el plugin nativo @capacitor-firebase/authentication para
// el inicio de sesión con Google (necesario porque Google bloquea el login
// dentro de un WebView embebido si se hace solo con el SDK web).

import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch
} from "firebase/firestore";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";

const firebaseConfig = {
  apiKey: "AIzaSyAY9r6fSKpapebr4A9ykyL-BEHIiq3UVEU",
  authDomain: "glosa-34df0.firebaseapp.com",
  projectId: "glosa-34df0",
  storageBucket: "glosa-34df0.firebasestorage.app",
  messagingSenderId: "1063843629354",
  appId: "1:1063843629354:web:290e79232e5a16a9cb3653"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// El caché persistente es lo que permite abrir la app sin conexión, seguir
// creando/editando compras, y que Firestore suba solo los cambios cuando
// vuelva a haber internet — no hace falta ninguna cola manual.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// Inicia sesión con el SDK nativo de Google (funciona dentro del WebView de
// la app) y después "espeja" esa sesión en el SDK web de Firebase, que es el
// que usa Firestore para leer y escribir.
export async function signInWithGoogle() {
  var result = await FirebaseAuthentication.signInWithGoogle();
  var idToken = result && result.credential && result.credential.idToken;
  if (!idToken) {
    throw new Error("No se recibió credencial de Google.");
  }
  var credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export async function signOutEverywhere() {
  try { await FirebaseAuthentication.signOut(); } catch (e) { /* no-op en web */ }
  await firebaseSignOut(auth);
}

export function subscribeItems(uid, onChange) {
  var itemsCol = collection(db, "users", uid, "items");
  return onSnapshot(itemsCol, function (snap) {
    var items = [];
    snap.forEach(function (d) { items.push(d.data()); });
    onChange(items);
  }, function (err) {
    console.error("Error escuchando compras:", err);
  });
}

export function subscribeSettings(uid, onChange) {
  var settingsDoc = doc(db, "users", uid, "settings", "config");
  return onSnapshot(settingsDoc, function (snap) {
    onChange(snap.exists() ? snap.data() : null);
  }, function (err) {
    console.error("Error escuchando ajustes:", err);
  });
}

export function saveItemCloud(uid, item) {
  return setDoc(doc(db, "users", uid, "items", item.id), item);
}

export function deleteItemCloud(uid, id) {
  return deleteDoc(doc(db, "users", uid, "items", id));
}

export function saveSettingsCloud(uid, settings) {
  return setDoc(doc(db, "users", uid, "settings", "config"), settings, { merge: true });
}

// Se usa una sola vez, la primera vez que alguien inicia sesión, para subir
// las compras que ya tenía guardadas en este dispositivo antes de tener cuenta.
export async function migrateLocalToCloud(uid, items, categories, stores) {
  var batch = writeBatch(db);
  items.forEach(function (item) {
    batch.set(doc(db, "users", uid, "items", item.id), item);
  });
  batch.set(doc(db, "users", uid, "settings", "config"), { categories: categories, stores: stores }, { merge: true });
  await batch.commit();
}
