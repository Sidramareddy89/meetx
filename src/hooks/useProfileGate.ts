import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Sends users missing their profile details (name / phone) to the
 * complete-profile step after Google sign-in / registration. Email/password
 * registration already collects the full name, so it is marked complete there.
 * Runs once the auth state has settled.
 */
export const useProfileGate = () => {
  const { currentUser, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!currentUser) return;
    const missingName = !currentUser.displayName || currentUser.displayName === 'User';
    const missingPhone = !currentUser.phoneNumber;
    if (!currentUser.hasCompletedOnboarding && (missingName || missingPhone)) {
      navigate('/complete-profile', { replace: true });
    }
  }, [currentUser, loading, navigate]);
};
