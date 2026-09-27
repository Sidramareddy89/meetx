import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, User, Mail, Phone, Camera,
  CheckCircle2, AlertCircle, Save
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Profile page: shows the signed-in user's avatar, full name, Gmail and
 * mobile number, and lets them update name + phone (saved to Auth and the
 * Firestore users/{uid} profile document).
 */
export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading, loadUserProfile, updateUserProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchProfile() {
      if (loading) return;
      if (!currentUser) {
        navigate('/landing', { replace: true });
        return;
      }
      try {
        const profile = await loadUserProfile(currentUser.uid);
        if (cancelled) return;
        const resolved = profile || currentUser;
        setDisplayName(resolved.displayName && resolved.displayName !== 'User' ? resolved.displayName : '');
        setPhoneNumber(resolved.phoneNumber || '');
      } catch (err: any) {
        if (!cancelled) {
          setDisplayName(currentUser.displayName && currentUser.displayName !== 'User' ? currentUser.displayName : '');
          setPhoneNumber(currentUser.phoneNumber || '');
          setError(err?.message || 'Could not load your profile.');
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    }
    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [currentUser, loading, loadUserProfile, navigate]);

  useEffect(() => {
    setAvatarBroken(false);
  }, [currentUser?.photoURL]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      setSaving(true);
      await updateUserProfile({ displayName: displayName.trim(), phoneNumber: phoneNumber.trim() });
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/home')}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Home</span>
      </button>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-8 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/60 flex items-center justify-center overflow-hidden text-2xl font-bold">
              {currentUser?.photoURL && !avatarBroken ? (
                <img
                  src={currentUser.photoURL}
                  alt="Profile"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={() => setAvatarBroken(true)}
                />
              ) : (
                <span>{currentUser?.displayName?.charAt(0).toUpperCase() || 'U'}</span>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">
                {displayName || currentUser?.displayName || 'Your Profile'}
              </h2>
              <p className="text-xs text-blue-100 flex items-center gap-1.5 mt-1">
                <Mail className="w-3.5 h-3.5" />
                {currentUser?.email || 'No email on file'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {fetching ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500 py-6">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>Loading your profile...</span>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl outline-none text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Gmail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={currentUser?.email || ''}
                    disabled
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-100 border border-slate-200 rounded-xl outline-none text-slate-500 cursor-not-allowed"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Your Gmail comes from your Google/Firebase sign-in and cannot be changed here.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Mobile Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 555 000 1234"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-xl outline-none text-slate-900 placeholder:text-slate-400 transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {saved && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>Profile saved successfully.</span>
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Profile</span>
                  </>
                )}
              </button>

              <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" />
                Profile photos come from your Google account and update automatically on next sign-in.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};