export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  phoneNumber?: string | null;
  hasCompletedOnboarding?: boolean;
}
