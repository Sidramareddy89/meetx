/**
 * MEETX — stub for `src/contexts/AuthContext` used by the F4 verification
 * harness. Only `useAuth` is consumed by MeetingContext; the signed-in user is
 * supplied by the harness through `globalThis.__meetxTestAuth` so the
 * authenticated-user scoping of the real code paths stays in effect.
 */

export const useAuth = () => {
  const auth = globalThis.__meetxTestAuth || {};
  return {
    currentUser: auth.currentUser || null,
    loading: false,
    register: async () => {},
    login: async () => {},
    signInWithGoogle: async () => {},
    resetPassword: async () => {},
    logout: async () => {
      if (auth) auth.currentUser = null;
    },
    loadUserProfile: async () => auth.currentUser || null,
    updateUserProfile: async () => {},
  };
};

export const AuthProvider = ({ children }) => children;
export default { useAuth, AuthProvider };
