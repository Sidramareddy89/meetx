/**
 * Turns a Firebase Google sign-in failure into something a user can act on.
 *
 * `auth/deleted-client` is not a bug in this app: it means the OAuth client
 * that Google issued for this Firebase web app was removed in Google Cloud
 * Console, so Google's popup refuses to issue an id_token. The raw message
 * ("Error 401: deleted_client") tells the user nothing actionable, so map the
 * config-class failures to the console page that fixes them and fall back to
 * the original message (or the caller-supplied default) otherwise.
 */
export const describeGoogleAuthError = (err: any, fallback: string): string => {
  switch (err?.code) {
    case 'auth/deleted-client':
      return 'Google sign-in is unavailable: this app\u2019s Google OAuth client was deleted. Recreate it in Google Cloud Console \u203a APIs & Services \u203a Credentials, or re-enable the Google provider in Firebase Console \u203a Authentication \u203a Sign-in method. Use email/password below in the meantime.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is OFF. Enable the Google provider in Firebase Console \u203a Authentication \u203a Sign-in method.';
    case 'auth/unauthorized-domain':
      return 'This site is not an authorized domain. Add it in Firebase Console \u203a Authentication \u203a Settings \u203a Authorized domains.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'The Google sign-in window was closed before finishing. Please try again.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Allow pop-ups for this site and try again.';
    case 'auth/network-request-failed':
      return 'Network error during Google sign-in. Check your connection and try again.';
    case 'auth/api-key-not-valid':
      return 'Firebase API key invalid. Verify VITE_FIREBASE_API_KEY in .env and restart npm run dev.';
    default:
      return err?.message || fallback;
  }
};
