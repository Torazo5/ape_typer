import { initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithPopup, type User } from "firebase/auth";
import { doc, getFirestore, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { TestResult } from "./types";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const configured = Object.values(config).every(Boolean);
const app = configured ? initializeApp(config) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const functions = app ? getFunctions(app) : null;

export const firebaseEnabled = Boolean(app);

export async function startGuest() {
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

export function watchUser(callback: (user: User | null) => void) {
  if (!auth) return () => callback(null);
  return onAuthStateChanged(auth, callback);
}

export async function connectGoogle() {
  if (!auth) throw new Error("Add Firebase variables to .env.local before connecting an account.");
  const provider = new GoogleAuthProvider();
  if (auth.currentUser?.isAnonymous) {
    const guest = auth.currentUser;
    const sourceToken = await guest.getIdToken();
    try {
      return (await linkWithPopup(guest, provider)).user;
    } catch (error: unknown) {
      if (!(error instanceof Error) || !("code" in error) || !["auth/credential-already-in-use", "auth/email-already-in-use"].includes(String(error.code))) throw error;
      const account = (await signInWithPopup(auth, provider)).user;
      if (functions) await httpsCallable(functions, "mergeAnonymousResults")({ sourceUid: guest.uid, sourceToken });
      return account;
    }
  }
  return (await signInWithPopup(auth, provider)).user;
}

export async function saveCloudResult(result: TestResult, user: User | null) {
  if (!db || !user) return;
  const { prompt, ...summary } = result;
  await setDoc(doc(db, "users", user.uid, "results", result.id), summary);
}
