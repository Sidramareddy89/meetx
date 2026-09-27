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
import { auth, db, isFirebaseConfigured } from '../config/firebase';
import { UserProfile } from '../types/user';

interface AuthContextType {
  currentUser: UserProfile | null;
  loading: boolean;
  isRegisteredUser: boolean;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  setIsRegisteredUser: (val: boolean) => void;
  loadUserProfile: (uid: string) => Promise<UserProfile | null>;
  updateUserProfile: (updates: { displayName?: string; phoneNumber?: string | null }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Best-effort Firestore profile write with a timeout guard. Authentication
// must never hang on this call: a blocked network, a missing Firestore
// database, or a denied security rule must not stall sign-in/registration.
// The write is raced against a timeout and every failure is only logged.
const PROFILE_WRITE_TIMEOUT_MS = 8000;

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
  const [isRegisteredUser, setIsRegisteredUserState] = useState<boolean>(() => {
    return localStorage.getItem('meetx_user_registered') === 'true';
  });

  const setIsRegisteredUser = (val: boolean) => {
    setIsRegisteredUserState(val);
    if (val) {
      localStorage.setItem('meetx_user_registered', 'true');
    } else {
      localStorage.removeItem('meetx_user_registered');
    }
  };

  useEffect(() => {
    // Set local persistence for Firebase auth
    setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('Firebase persistence warning:', err);
    });

    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        // Start from the Auth record, then overlay the Firestore profile
        // (display name / phone number / onboarding state) when available.
        const profile = await loadUserProfileDoc(user);
        setCurrentUser(profile);
        setIsRegisteredUser(true);
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const register = async (email: string, password: string, displayName: string) => {
    // 1. Create authenticated Firebase user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Update Firebase auth profile
    if (displayName && user) {
      await updateProfile(user, { displayName });
    }

    // 3. Store the user's profile document in Firestore (best-effort: never
    // blocks registration if Firestore is unreachable or the write is denied).
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
    setIsRegisteredUser(true);
  };

  const login = async (email: string, password: string) => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const profile = await loadUserProfileDoc(user);
    setCurrentUser(profile);
    setIsRegisteredUser(true);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;

    if (user) {
      // Complete sign-in state first (with any stored profile fields), then
      // persist our copy in the background. The previously awaited Firestore
      // write stalled the Google button spinner whenever Firestore was slow,
      // blocked, or denied.
      const profile = await loadUserProfileDoc(user);
      setCurrentUser(profile);
      setIsRegisteredUser(true);

      saveUserProfileBestEffort(user.uid, {
        uid: user.uid,
        displayName: profile.displayName,
        email: user.email,
        photoURL: user.photoURL || null,
        lastLoginAt: serverTimestamp(),
      });
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
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

    const refreshed = await loadUserProfileDoc(user);
    setCurrentUser(refreshed);
    setIsRegisteredUser(true);
  };

  const logout = async () => {
    if (isFirebaseConfigured()) {
      await fbSignOut(auth);
    }
    localStorage.removeItem('meetx_user_registered');
    setCurrentUser(null);
    setIsRegisteredUserState(false);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loading, isRegisteredUser, register, login, signInWithGoogle, resetPassword, logout, setIsRegisteredUser, loadUserProfile, updateUserProfile }}>
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
