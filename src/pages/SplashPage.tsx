import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Loader2, Sparkles, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { MeetXLogo } from '../components/common/MeetXLogo';

export const SplashPage: React.FC = () => {
  const navigate = useNavigate();
  const { isRegisteredUser, currentUser, loading } = useAuth();
  const [platformLoadingProgress, setPlatformLoadingProgress] = useState(20);

  const isUserRegistered = isRegisteredUser || Boolean(currentUser);

  useEffect(() => {
    if (loading) return;

    if (currentUser) {
      // Authenticated user: platform loading animation -> Home Page
      const interval = setInterval(() => {
        setPlatformLoadingProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => {
              navigate('/home', { replace: true });
            }, 300);
            return 100;
          }
          return prev + 25;
        });
      }, 300);

      return () => clearInterval(interval);
    } else if (isRegisteredUser) {
      // Registered user returning without active session: platform loading -> Sign In
      const interval = setInterval(() => {
        setPlatformLoadingProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setTimeout(() => {
              navigate('/signin', { replace: true });
            }, 300);
            return 100;
          }
          return prev + 25;
        });
      }, 300);

      return () => clearInterval(interval);
    }
  }, [currentUser, isRegisteredUser, loading, navigate]);

  const handleScrollToLanding = () => {
    navigate('/landing');
  };

  return (
    <div className="relative min-h-screen w-full bg-[#0b1120] text-white flex flex-col items-center justify-between p-6 sm:p-10 select-none overflow-hidden">
      {/* Background ambient decorative glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top minimal header */}
      <div className="w-full max-w-5xl flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-xs font-medium tracking-wider text-slate-400 uppercase">
            MEETX • AI Assistant
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <span>Screen Protection Ready</span>
        </div>
      </div>

      {/* Center: MEETX Logo with Flowing Lines exactly matching user reference */}
      <div className="flex flex-col items-center justify-center text-center my-auto z-10 max-w-md w-full">
        {/* Render the custom MeetX Logo with Flowing Sound Lines */}
        <div className="my-8">
          <MeetXLogo
            size="xl"
            showLines={true}
            statusText={isUserRegistered ? `Loading platform... ${platformLoadingProgress}%` : 'Ready.'}
            theme="dark"
            animated={true}
          />
        </div>

        {/* Returning user progress bar */}
        {isUserRegistered && (
          <div className="w-60 mt-4 flex flex-col items-center gap-2">
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-teal-400 via-blue-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${platformLoadingProgress}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400">
              Welcome back{currentUser?.displayName ? `, ${currentUser.displayName}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Bottom Area: For initial users, arrow button at the down to switch to landing page */}
      {!isUserRegistered && (
        <div className="flex flex-col items-center gap-2.5 z-10 pb-4 animate-bounce">
          <span className="text-[11px] uppercase tracking-widest text-slate-400 font-medium">
            Continue to Overview
          </span>
          <button
            onClick={handleScrollToLanding}
            aria-label="Switch to Landing Page"
            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-xl hover:scale-110 active:scale-95 transition-all cursor-pointer group"
            title="Switch to Landing Page"
          >
            <ChevronDown className="w-6 h-6 text-teal-300 group-hover:text-white transition-colors" />
          </button>
        </div>
      )}

      {isUserRegistered && (
        <div className="text-[11px] text-slate-600 z-10 pb-2">
          MEETX Multilingual Session Loading
        </div>
      )}
    </div>
  );
};
