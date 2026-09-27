import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, User, Phone, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Complete-your-profile step for Google sign-ups (and any account missing
 * name/phone). Collects full name + mobile number, saves to Auth + Firestore
 * users/{uid}, marks onboarding complete, then continues to /home.
 */
export const CompleteProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading, updateUserProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      navigate('/landing', { replace: true });
      return;
    }
    if (currentUser.displayName && currentUser.displayName !== 'User') {
      setDisplayName((prev) => prev || currentUser.displayName || '');
    }
    if (currentUser.phoneNumber) {
      setPhoneNumber((prev) => prev || currentUser.phoneNumber || '');
    }
  }, [currentUser, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!phoneNumber.trim()) {
      setError('Please enter your mobile number.');
      return;
    }
    try {
      setSaving(true);
      await updateUserProfile({ displayName: displayName.trim(), phoneNumber: phoneNumber.trim() });
      navigate('/home', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-blue-500 selection:text-white relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md mb-6">
        <button
          onClick={() => navigate('/home')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
      </div>

      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20 mb-3">
            MX
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Complete Your Profile
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Signed in{displayName ? ` as ${displayName}` : currentUser?.email ? ` with ${currentUser.email}` : ''}. Please add your details to continue.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Full Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl outline-none text-white placeholder:text-slate-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Mobile Number
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 555 000 1234"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl outline-none text-white placeholder:text-slate-600 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl text-sm shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Profile...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Save & Continue</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
