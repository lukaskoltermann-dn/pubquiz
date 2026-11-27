import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, deleteField } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export const configured = !String(firebaseConfig.apiKey).startsWith("DEIN");
const emu = new URLSearchParams(location.search).has("emu");
export const app = initializeApp(emu ? { apiKey: "demo", projectId: "demo-pubquiz", authDomain: "localhost" } : firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
if (emu) { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(db, "127.0.0.1", 8080); }
export const ready = emu || configured;

export { signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, deleteField };

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const params = new URLSearchParams(location.search);
export const keepEmu = url => emu ? url + (url.includes("?") ? "&" : "?") + "emu" : url;
export const until = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
