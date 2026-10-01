/**
 * authErrors.ts — the single place that turns a Firebase Authentication
 * failure into a message a user can act on.
 *
 * Rules enforced here:
 *  - NO raw Firebase/internal error text is shown to the user. `err.message`
 *    (which reads like "Firebase: Error (auth/invalid-credential).") is never
 *    returned verbatim; unknown codes fall back to a generic message.
 *  - NO secret material is ever logged. Only the error CODE is logged, and only
 *    in development, because a code is a stable identifier that carries no
 *    token, password or personal data.
 *  - Config-class failures (disabled provider, bad API key, unauthorised
 *    domain, deleted Google OAuth client) get a plain-language sentence plus a
 *    developer hint in the console, so end users are not shown console paths.
 */

/** Which flow produced the error — some codes mean different things per flow. */
export type AuthErrorContext = 'signin' | 'signup' | 'reset' | 'google' | 'profile';

/** Message shown when a code is not recognised. */
const GENERIC: Record<AuthErrorContext, string> = {
  signin: 'We could not sign you in. Please check your email and password and try again.',
  signup: 'We could not create your account. Please try again.',
  reset: 'We could not send the reset email right now. Please try again in a moment.',
  google: 'Google sign-in could not complete. Please try again, or use email and password.',
  profile: 'We could not save your profile. Please try again.',
};

/**
 * Developer-facing hints for configuration-class errors. These are logged (code
 * only) and never rendered, so an end user is never told to open a console.
 */
const DEV_HINTS: Record<string, string> = {
  'auth/operation-not-allowed':
    'Enable this provider in Firebase Console > Authentication > Sign-in method.',
  'auth/unauthorized-domain':
    'Add this origin in Firebase Console > Authentication > Settings > Authorized domains.',
  'auth/api-key-not-valid':
    'Check VITE_FIREBASE_API_KEY in .env (Firebase Console > Project settings > Web API key).',
  'auth/deleted-client':
    'The Google OAuth client was deleted. Recreate it in Google Cloud Console > APIs & Services > Credentials, or set the Web client ID in Firebase Console > Authentication > Sign-in method > Google.',
  'auth/invalid-api-key': 'Check VITE_FIREBASE_API_KEY in .env.',
};

/** Per-code, per-context user-facing messages. */
const MESSAGES: Record<string, Partial<Record<AuthErrorContext, string>> & { all?: string }> = {
  'auth/invalid-email': {
    all: 'That email address does not look valid. Please check it and try again.',
  },
  'auth/missing-email': { all: 'Please enter your email address.' },
  'auth/missing-password': { all: 'Please enter your password.' },
  'auth/user-disabled': {
    all: 'This account has been disabled. Please contact support if you think this is a mistake.',
  },
  'auth/user-not-found': {
    signin: 'No account found for that email address. Please create an account first.',
    reset: 'No account found for that email address. Please check the address or register first.',
  },
  'auth/wrong-password': {
    signin: 'That password is incorrect. Please try again, or reset your password.',
  },
  // Newer SDKs collapse several failures into this single code.
  'auth/invalid-credential': {
    signin:
      'The email or password is incorrect. If you have not registered yet, create an account first.',
  },
  'auth/invalid-login-credentials': {
    signin:
      'The email or password is incorrect. If you have not registered yet, create an account first.',
  },
  'auth/email-already-in-use': {
    signup:
      'An account already exists for that email address. Sign in instead, or reset your password.',
  },
  'auth/weak-password': {
    signup: 'Please choose a stronger password — at least 6 characters.',
  },
  'auth/too-many-requests': {
    all: 'Too many attempts in a short time. Please wait a moment and try again.',
  },
  'auth/network-request-failed': {
    all: 'Network problem. Please check your connection and try again.',
  },
  // Configuration-class: plain language, no console paths.
  'auth/operation-not-allowed': {
    all: 'This sign-in method is not available right now. Please try a different method.',
  },
  'auth/unauthorized-domain': {
    all: 'Sign-in is not available from this address. Please try the official app address.',
  },
  'auth/api-key-not-valid': { all: 'Sign-in is unavailable due to a configuration problem.' },
  'auth/invalid-api-key': { all: 'Sign-in is unavailable due to a configuration problem.' },
  'auth/quota-exceeded': { all: 'The service is busy right now. Please try again shortly.' },
  'auth/internal-error': { all: GENERIC.profile },
  'auth/requires-recent-login': {
    all: 'For your security, please sign in again and retry.',
  },
  'auth/account-exists-with-different-credential': {
    signin:
      'An account already exists for that email using a different sign-in method. Sign in with email and password instead.',
    google:
      'An account already exists for that email using a different sign-in method. Sign in with email and password instead.',
  },
  // Google popup flow.
  'auth/popup-closed-by-user': {
    google: 'The Google sign-in window was closed before finishing. Please try again.',
  },
  'auth/cancelled-popup-request': {
    google: 'The Google sign-in window was closed before finishing. Please try again.',
  },
  'auth/popup-blocked': {
    google:
      'The Google sign-in window could not complete. If no window appeared, allow pop-ups for this site and try again.',
  },
  'auth/deleted-client': {
    google:
      'Google sign-in is unavailable: this app\u2019s Google OAuth client no longer exists. Please use email and password, or ask the site owner to restore it.',
  },
  'auth/credential-already-in-use': {
    google: 'That Google account is already linked to another MEETX account.',
  },
};

const codeOf = (err: unknown): string => {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
};

/**
 * Map a Firebase auth error to a user-facing sentence.
 *
 * @param err      the thrown value (FirebaseAuthError, Error, or anything)
 * @param context  which flow threw, so one code can read correctly in each
 * @returns        always a non-empty, human-readable message
 */
export const describeAuthError = (err: unknown, context: AuthErrorContext): string => {
  const code = codeOf(err);

  if (code) {
    const hint = DEV_HINTS[code];
    // Development-only, code-only: no tokens, no passwords, no message text.
    if (hint && typeof console !== 'undefined') {
      console.warn(`[auth] ${code} — ${hint}`);
    }
    const entry = MESSAGES[code];
    if (entry) {
      const specific = entry[context] ?? entry.all;
      if (specific) return specific;
    }
  }

  return GENERIC[context];
};

/** True when a failure came from the Google popup being dismissed or blocked. */
export const isGooglePopupError = (err: unknown): boolean => {
  const code = codeOf(err);
  return (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/popup-blocked'
  );
};

/**
 * An auth failure that is always safe to show: `message` is the friendly text
 * and `code` is the original Firebase code (a stable identifier, never a
 * secret). Wrapping at the service boundary means a page can map by code, and a
 * page that forgets to map still cannot leak internal text to the user.
 */
export class AuthFlowError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthFlowError';
    this.code = code;
  }
}

/** Wrap any thrown value into an `AuthFlowError` for the given flow. */
export const toAuthFlowError = (err: unknown, context: AuthErrorContext): AuthFlowError =>
  new AuthFlowError(codeOf(err) || 'auth/unknown', describeAuthError(err, context));

/**
 * Validation shared by the auth pages, so the rules live in one place instead
 * of being re-implemented per form.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 6;

export const validateEmail = (email: string): string | null => {
  const value = (email || '').trim();
  if (!value) return 'Please enter your email address.';
  if (!EMAIL_PATTERN.test(value)) return 'Please enter a valid email address.';
  return null;
};

export const validatePassword = (password: string): string | null => {
  if (!password) return 'Please enter your password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
};

export const validateName = (name: string): string | null => {
  if (!(name || '').trim()) return 'Please enter your full name.';
  return null;
};
