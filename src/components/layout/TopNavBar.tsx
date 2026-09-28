import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Eye,
  EyeOff,
  Globe,
  User,
  LogOut,
  Clock,
  Settings,
  Sparkles,
  ChevronDown,
  Pencil
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useMeeting } from '../../contexts/MeetingContext';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '../../types/meeting';

export const TopNavBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useAuth();
  const { isDetectable, setIsDetectable, selectedLanguage, setSelectedLanguage, searchQuery, setSearchQuery } = useMeeting();

  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  // Avatar fallback state keyed by the loaded URL: if the provider photo fails
  // to load (hardcoded/stale URL, blocked referrer, broken link), show the
  // display-name initial instead of an endless spinner / broken image.
  const [avatarErrorFor, setAvatarErrorFor] = useState<string | null>(null);
  const avatarSrc = currentUser?.photoURL && avatarErrorFor !== currentUser.photoURL
    ? currentUser.photoURL
    : null;

  const langRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setIsLangOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Linear page stepper: Home -> Meeting History.
  // Nothing exists before Home (back is a no-op there) and Forward
  // stops permanently at Meeting History (no page beyond it).
  const onHomePage = location.pathname === '/' || location.pathname === '/home';
  const onHistoryPage = location.pathname === '/history';
  const canGoBack = !onHomePage;
  const canGoForward = onHomePage;

  const handleBack = () => {
    if (!canGoBack) return; // initial page: nothing before Home
    if (onHistoryPage) {
      navigate('/home'); // back from History -> Home, then it ends
      return;
    }
    navigate(-1); // other pages (detail/profile): browser history
  };

  const handleForward = () => {
    if (!canGoForward) return; // Forward stops at Meeting History
    navigate('/history');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/landing');
  };

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-all select-none">
      {/* Left: Navigation arrows & Brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-lg border border-slate-200/80 shadow-xs">
          <button
            onClick={handleBack}
            disabled={!canGoBack}
            aria-label="Previous page"
            className="p-1.5 rounded-md hover:bg-white text-slate-700 hover:text-blue-600 transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
            title={canGoBack ? (onHistoryPage ? 'Back to Home' : 'Previous page') : 'This is the first page'}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleForward}
            disabled={!canGoForward}
            aria-label="Next page"
            className="p-1.5 rounded-md hover:bg-white text-slate-700 hover:text-blue-600 transition-all cursor-pointer shadow-xs active:scale-95 flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
            title={canGoForward ? 'Go to Meeting History' : 'Meeting History is the last page'}
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* MEETX Platform Brand */}
        <div
          onClick={() => navigate('/home')}
          className="flex items-center gap-2 cursor-pointer group px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 group-hover:scale-105 transition-transform">
            <span className="font-bold text-sm tracking-wider">MX</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-blue-900 to-slate-800 bg-clip-text text-transparent">
              MEETX
            </span>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60">
              v2.0
            </span>
          </div>
        </div>
      </div>

      {/* Center: Search & Ask Anything */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search meetings or ask anything..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-100/90 hover:bg-slate-100 focus:bg-white border border-transparent focus:border-blue-400 rounded-full outline-none transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Right Controls: Detectable toggle, Language, Profile */}
      <div className="flex items-center gap-3">
        {/* Detectable / Private switch */}
        <button
          onClick={() => setIsDetectable(!isDetectable)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${isDetectable
              ? 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border-slate-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
            }`}
          title={isDetectable ? 'Detectable mode is ON' : 'Private Mode: tab/window sharing can exclude the separate assistant; Entire Screen may include it'}
        >
          {isDetectable ? (
            <>
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span>Detectable</span>
              <div className="w-7 h-4 bg-slate-300 rounded-full relative p-0.5 transition-colors">
                <div className="w-3 h-3 bg-white rounded-full shadow-sm"></div>
              </div>
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5 text-emerald-600" />
              <span>Private</span>
              <div className="w-7 h-4 bg-emerald-500 rounded-full relative p-0.5 transition-colors">
                <div className="w-3 h-3 bg-white rounded-full shadow-sm ml-auto"></div>
              </div>
            </>
          )}
        </button>

        {/* Language Selection */}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200"
            title="Transcription & Assistant Language"
          >
            <Globe className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">{selectedLanguage.name}</span>
            <span className="sm:hidden">{selectedLanguage.code.split('-')[0].toUpperCase()}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isLangOpen && (
            <div className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Language
              </div>
              <div className="max-h-56 overflow-y-auto">
                {SUPPORTED_LANGUAGES.map((lang: SupportedLanguage) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setSelectedLanguage(lang);
                      setIsLangOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${selectedLanguage.code === lang.code ? 'font-semibold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                      }`}
                  >
                    <span>{lang.name}</span>
                    <span className="text-[11px] text-slate-400">{lang.nativeName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Account / Profile */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-1.5 p-1 rounded-full hover:ring-2 hover:ring-blue-100 transition-all focus:outline-none"
          >
            <div className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-semibold text-xs overflow-hidden">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt="Avatar"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={() => setAvatarErrorFor(avatarSrc)}
                />
              ) : (
                currentUser?.displayName?.charAt(0).toUpperCase() || <User className="w-4 h-4 text-slate-500" />
              )}
            </div>
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={() => {
                  navigate('/profile');
                  setIsProfileOpen(false);
                }}
                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-700 font-semibold text-xs overflow-hidden flex-shrink-0">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt="Avatar"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                      onError={() => setAvatarErrorFor(avatarSrc)}
                    />
                  ) : (
                    currentUser?.displayName?.charAt(0).toUpperCase() || <User className="w-4 h-4 text-slate-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-slate-900 truncate">
                    {currentUser?.displayName || 'MEETX User'}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {currentUser?.email || 'Guest Session'}
                  </div>
                  {currentUser?.phoneNumber && (
                    <div className="text-[11px] text-slate-500 truncate">
                      {currentUser.phoneNumber}
                    </div>
                  )}
                </div>
              </button>

              <div className="mx-3.5 my-1.5 border-t border-slate-100" />

              <div className="py-1">
                <button
                  onClick={() => {
                    navigate('/profile');
                    setIsProfileOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit Profile
                </button>

                <button
                  onClick={() => {
                    navigate('/history');
                    setIsProfileOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Meeting History
                </button>

                <button
                  onClick={() => {
                    navigate('/profile');
                    setIsProfileOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  My Profile
                </button>

              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  onClick={() => {
                    handleLogout();
                    setIsProfileOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
