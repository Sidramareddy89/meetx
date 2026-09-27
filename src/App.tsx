import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { MeetingProvider } from './contexts/MeetingContext';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

import { SplashPage } from './pages/SplashPage';
import { LandingPage } from './pages/auth/LandingPage';
import { SignUpPage } from './pages/auth/SignUpPage';
import { SignInPage } from './pages/auth/SignInPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { HomePage } from './pages/HomePage';
import { CompleteProfilePage } from './pages/CompleteProfilePage';
import { ProfilePage } from './pages/ProfilePage';
import { MeetingHistoryPage } from './pages/MeetingHistoryPage';
import { MeetingDetailPage } from './pages/MeetingDetailPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MeetingProvider>
          <Routes>
            {/* Startup Splash Logo Screen */}
            <Route path="/" element={<SplashPage />} />

            {/* Authentication and Onboarding Screens */}
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Core Application Pages (Protected with AppLayout) */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              {/* PAGE 1: HOME */}
              <Route path="/home" element={<HomePage />} />

              {/* Profile completion (post-Google sign-up details) */}
              <Route path="/complete-profile" element={<CompleteProfilePage />} />

              {/* User profile: name, Gmail, mobile number */}
              <Route path="/profile" element={<ProfilePage />} />

              {/* PAGE 2: MEETING HISTORY */}
              <Route path="/history" element={<MeetingHistoryPage />} />

              {/* PAGE 3: MEETING DETAILS */}
              <Route path="/meeting/:id" element={<MeetingDetailPage />} />
            </Route>

            {/* Fallback route for /live to /home */}
            <Route path="/live" element={<Navigate to="/home" replace />} />

            {/* Wildcard Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MeetingProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
