import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LogIn } from 'lucide-react';
import { MeetXLogo } from '../../components/common/MeetXLogo';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col justify-between font-sans selection:bg-blue-500 selection:text-white">
      {/* Top Bar */}
      <header className="w-full max-w-5xl mx-auto px-6 py-5 flex items-center justify-between border-b border-slate-800/80">
        <div 
          onClick={() => navigate('/')} 
          className="flex items-center gap-2 cursor-pointer"
        >
          <MeetXLogo size="sm" showLines={false} theme="dark" />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/signin')}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-900 rounded-xl transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => navigate('/signup')}
            className="px-4 py-2 text-xs sm:text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5"
          >
            <span>Get Started / Register</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Concise Content */}
      <main className="w-full max-w-3xl mx-auto px-6 py-20 flex flex-col items-center text-center my-auto">
        <div className="mb-4">
          <MeetXLogo size="xl" showLines={true} theme="dark" animated={true} />
        </div>

        <p className="mt-4 text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed">
          MEETX is a multilingual meeting assistant that helps you prepare for, participate in, record, transcribe, review, summarize, and retrieve meeting conversations.
        </p>

        {/* Action Controls */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <button
            onClick={() => navigate('/signup')}
            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
          >
            <span>Get Started / Register</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => navigate('/signin')}
            className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-800 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 text-sm sm:text-base cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In</span>
          </button>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="w-full max-w-5xl mx-auto px-6 py-6 border-t border-slate-800/80 text-center text-xs text-slate-500">
        MEETX — Multilingual Online Meeting Assistant
      </footer>
    </div>
  );
};
