import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = (): boolean => {
  const key = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
  return Boolean(key) && key !== 'your_api_key_here' && key !== 'demo-api-key';
};

const configured = isFirebaseConfigured();

export const app = !getApps().length
  ? initializeApp(configured ? firebaseConfig : { apiKey: 'demo-api-key', projectId: 'demo-project' })
  : getApp();

// Firebase App Check — only when a real config + site key exist.
// Initializing it unconditionally (as before) is the #1 cause of the blank
// screen / console "FirebaseError: App Check ..." failures: an invalid or
// non-production site key like "6LcwT8kt..." breaks initializeAppCheck and
// the module import crashes the whole app before anything renders.
export const appCheck = (() => {
  try {
    const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string | undefined;
    const looksRealSiteKey =
      Boolean(siteKey) &&
      siteKey !== 'your_site_key_here' &&
      !(siteKey as string).startsWith('6LcwT8kt');
    if (!configured || !looksRealSiteKey) return null;
    if (import.meta.env.DEV) {
      // Lets localhost pass App Check enforcement during development.
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    return initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey as string),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('Firebase App Check disabled (non-blocking):', err);
    return null;
  }
})();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);