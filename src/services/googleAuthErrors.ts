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
      // Misleading on its own: Firebase also reports "popup-blocked" when the
      // popup DID open but the OAuth page inside it failed (for example the
      // deleted-client screen). Telling someone to allow pop-ups when the
      // popup is plainly visible just sends them down the wrong path, so name
      // both causes and let the visible Google error decide.
      return 'The Google sign-in window could not complete. If no window appeared, allow pop-ups for this site. If you saw a Google error page inside the window, the cause is this: the Google OAuth client for this app was deleted - recreate it in Google Cloud Console > APIs & Services > Credentials, or set a Web client ID in Firebase Console > Authentication > Sign-in method > Google. Use email/password below in the meantime.';
    case 'auth/network-request-failed':
      return 'Network error during Google sign-in. Check your connection and try again.';
    case 'auth/api-key-not-valid':
      return 'Firebase API key invalid. Verify VITE_FIREBASE_API_KEY in .env and restart npm run dev.';
    default:
      return err?.message || fallback;
  }
};
