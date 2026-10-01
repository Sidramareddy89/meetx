import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { auth, db, isFirebaseConfigured } from '../config/firebase';
import { UserProfile } from '../types/user';
import { toAuthFlowError } from '../services/authErrors';

interface AuthContextType {
  currentUser: UserProfile | null;
  loading: boolean;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUserProfile: (uid: string) => Promise<UserProfile | null>;
  updateUserProfile: (updates: { displayName?: string; phoneNumber?: string | null }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Best-effort Firestore profile write with a timeout guard. Authentication
// must never hang on this call: a blocked network, a missing Firestore
// database, or a denied security rule must not stall sign-in/registration.
// The write is raced against a timeout and every failure is only logged.
const PROFILE_WRITE_TIMEOUT_MS = 8000;

/**
 * Browser-local keys retired from earlier auth designs. Firebase Auth now owns
 * "who is signed in"; these are only referenced so they can be cleaned up from
 * browsers that still carry them.
 *
 * Deliberately NOT cleared on sign-out: the user's own DATA (`meetx_meetings_<uid>`)
 * and device UI preferences (`meetx_widget_position`). Signing out must not
 * delete a user's saved meetings, and it must not reset their widget layout.
 */
const RETIRED_SESSION_KEYS = ['meetx_user_registered'];

const clearRetiredSessionKeys = (): void => {
  try {
    for (const key of RETIRED_SESSION_KEYS) localStorage.removeItem(key);
  } catch {
    // Storage unavailable (private mode / blocked): nothing to clear.
  }
};

const saveUserProfileBestEffort = (uid: string, data: Record<string, unknown>): void => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Profile write timed out after ${PROFILE_WRITE_TIMEOUT_MS}ms`)),
      PROFILE_WRITE_TIMEOUT_MS
    );
  });
  Promise.race([setDoc(doc(db, 'users', uid), data, { merge: true }), timeout]).catch((err) => {
    console.warn('Firestore profile storage warning (non-blocking):', err);
  });
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  // Merge a raw Firebase Auth user with the stored Firestore profile document.
  // Auth gives email/displayName/photoURL; Firestore owns phone number and the
  // onboarding flag. Never throws: on any failure it falls back to Auth data.
  const loadUserProfileDoc = async (user: User): Promise<UserProfile> => {
    const fallback: UserProfile = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split('@')[0] || 'User',
      photoURL: user.photoURL,
      phoneNumber: user.phoneNumber || null,
      hasCompletedOnboarding: false,
    };
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) return fallback;
      const data = snap.data() as Record<string, unknown>;
      return {
        uid: user.uid,
        email: (data.email as string | null) ?? user.email,
        displayName: (data.displayName as string | null) ?? fallback.displayName,
        photoURL: (data.photoURL as string | null) ?? user.photoURL,
        phoneNumber: (data.phoneNumber as string | null) ?? user.phoneNumber ?? null,
        hasCompletedOnboarding: (data.hasCompletedOnboarding as boolean) ?? false,
      };
    } catch (err) {
      console.warn('Firestore profile read warning (using auth data):', err);
      return fallback;
    }
  };
  const [loading, setLoading] = useState<boolean>(true);

  // Firebase Auth is the ONLY source of truth for "is this person signed in".
  // The previous `meetx_user_registered` localStorage flag duplicated that
  // state and could disagree with Firebase (a stale flag sent a signed-out
  // visitor to /signin, and clearing site data logged a live user out of the
  // splash flow). It is gone on purpose.
  const applyAuthenticatedUser = async (user: User): Promise<void> => {
    const profile = await loadUserProfileDoc(user);
    setCurrentUser(profile);
  };

  // ONE auth-state listener for the whole application (registered here, in the
  // single AuthProvider). `browserLocalPersistence` is requested BEFORE the
  // listener is attached, so a restored session is picked up by that listener
  // rather than being missed.
  useEffect(() => {
    let cancelled = false;
    let unsubscribeAuth: (() => void) | undefined;

    const initializeAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (err) {
        console.warn('Firebase auth initialization warning:', err);
      }
      if (cancelled) return;

      unsubscribeAuth = onAuthStateChanged(auth, async (user: User | null) => {
        if (user) {
          await applyAuthenticatedUser(user);
        } else {
          // Signed out (or session expired/revoked): Firebase is authoritative.
          setCurrentUser(null);
          clearRetiredSessionKeys();
        }
        setLoading(false);
      });
    };

    void initializeAuth();
    return () => {
      cancelled = true;
      unsubscribeAuth?.();
    };
  }, []);

  const register = async (email: string, password: string, displayName: string) => {
    // Wrap every failure so the page can show a friendly, actionable message
    // and can never surface raw Firebase text.
    try {
      // 1. Create the authenticated Firebase user.
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Update the Firebase Auth profile.
      if (displayName && user) {
        await updateProfile(user, { displayName });
      }

      // 3. Store the profile document (best-effort: never blocks registration
      //    if Firestore is unreachable or the write is denied).
      saveUserProfileBestEffort(user.uid, {
        uid: user.uid,
        displayName: displayName || email.split('@')[0],
        email: user.email,
        hasCompletedOnboarding: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const profile: UserProfile = {
        uid: user.uid,
        email: user.email,
        displayName: displayName || user.email?.split('@')[0] || 'User',
        photoURL: user.photoURL,
        phoneNumber: null,
        hasCompletedOnboarding: true,
      };
      setCurrentUser(profile);
    } catch (err) {
      throw toAuthFlowError(err, 'signup');
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const profile = await loadUserProfileDoc(user);
      setCurrentUser(profile);
    } catch (err) {
      throw toAuthFlowError(err, 'signin');
    }
  };

  const signInWithGoogle = async () => {
    try {
      // Firebase WEB Authentication only: the OAuth client is resolved
      // server-side by Google from the project's authDomain. There is no
      // Tauri/native window, no loopback callback, no desktop client id and
      // no client secret anywhere in this flow.
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      if (user) {
        // Complete sign-in state first (with any stored profile fields), then
        // persist our copy in the background. Awaiting the Firestore write here
        // used to stall the Google button spinner whenever Firestore was slow,
        // blocked, or denied.
        const profile = await loadUserProfileDoc(user);
        setCurrentUser(profile);

        saveUserProfileBestEffort(user.uid, {
          uid: user.uid,
          displayName: profile.displayName,
          email: user.email,
          photoURL: user.photoURL || null,
          lastLoginAt: serverTimestamp(),
        });
      }
    } catch (err) {
      throw toAuthFlowError(err, 'google');
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      throw toAuthFlowError(err, 'reset');
    }
  };

  // Read the stored Firestore profile for a uid (merged over Auth data).
  // Used by the Profile page. Resolves to null when there is no signed-in
  // user to read for, and falls back to Auth data on any read failure.
  const loadUserProfile = async (uid: string): Promise<UserProfile | null> => {
    const user = auth.currentUser;
    if (!user || user.uid !== uid) return currentUser;
    return loadUserProfileDoc(user);
  };

  // Save display name / phone number from the Complete-Profile or Profile
  // pages. Updates Auth (display name) and the Firestore users/{uid} doc,
  // flips hasCompletedOnboarding to true, then refreshes local state.
  // Throws so the UI can show validation/network errors.
  const updateUserProfile = async (updates: {
    displayName?: string;
    phoneNumber?: string | null;
  }): Promise<void> => {
    const user = auth.currentUser;
    if (!user) throw new Error('No signed-in user.');

    const displayName = (updates.displayName ?? '').trim();
    if (!displayName) throw new Error('Please enter your full name.');
    const phoneNumber = (updates.phoneNumber ?? '').trim();

    await updateProfile(user, { displayName });
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          displayName,
          phoneNumber: phoneNumber || null,
          hasCompletedOnboarding: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      // Never surface a raw Firestore error; the page shows err.message.
      throw toAuthFlowError(err, 'profile');
    }

    const refreshed = await loadUserProfileDoc(user);
    setCurrentUser(refreshed);
  };

  /**
   * Sign out and clear the application's session state.
   *
   * Firebase sees the sign-out first (it also fires `onAuthStateChanged`, which
   * is what resets the meeting session in MeetingContext). `setCurrentUser(null)`
   * is applied immediately afterwards so the UI cannot render an authenticated
   * view for a frame after the call resolves, even when Firebase is
   * unconfigured (local/demo mode) and there is nothing to sign out of.
   *
   * The user's own DATA is intentionally left intact: `meetx_meetings_<uid>`
   * keyed records belong to that account and must still be there on next login.
   */
  const logout = async () => {
    try {
      if (isFirebaseConfigured()) {
        await fbSignOut(auth);
      }
    } finally {
      clearRetiredSessionKeys();
      setCurrentUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, register, login, signInWithGoogle, resetPassword, logout, loadUserProfile, updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
