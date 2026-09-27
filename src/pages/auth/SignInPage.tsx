import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Mail, Lock, AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const SignInPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      setGoogleLoading(true);
      await signInWithGoogle();
      navigate('/home', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    try {
      setLoading(true);
      await login(email, password);
      navigate('/home', { replace: true });
    } catch (err: any) {
      let msg = 'Invalid email or password. Please try again.';
      if (err?.code === 'auth/user-not-found') {
        msg = 'No user found with this email address. Please register first.';
      } else if (err?.code === 'auth/wrong-password') {
        msg = 'Incorrect password. Please verify your password or reset it.';
      } else if (err?.code === 'auth/invalid-credential') {
        msg = 'Invalid credentials. New here? Please Register first (no account exists yet), or double-check email+password.';
      } else if (err?.code === 'auth/too-many-requests') {
        msg = 'Access temporarily disabled due to multiple failed attempts. Please try again later.';
      } else if (err?.code === 'auth/operation-not-allowed') {
        msg = 'Email/password sign-in is OFF in Firebase Console > Authentication > Sign-in method. Enable Email/Password there.';
      } else if (err?.code === 'auth/unauthorized-domain') {
        msg = 'localhost is not authorized in Firebase Console > Authentication > Settings > Authorized domains. Add localhost.';
      } else if (err?.code === 'auth/api-key-not-valid') {
        msg = 'Firebase API key invalid. Verify VITE_FIREBASE_API_KEY in .env and restart npm run dev.';
      } else if (err?.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-blue-500 selection:text-white relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Back button */}
      <div className="w-full max-w-md mb-6">
        <button
          onClick={() => navigate('/landing')}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Landing</span>
        </button>
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20 mb-3">
            MX
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Welcome Back to MEETX
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Sign in to access your meetings and live assistant
          </p>
        </div>

        {/* Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full py-2.5 px-4 mb-5 bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center gap-3 transition-all shadow-md shadow-white/5 disabled:opacity-60 cursor-pointer"
        >
          {googleLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          )}
          <span>Sign In with Google</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center mb-5">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-medium absolute">
            or sign in with email
          </span>
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
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl outline-none text-white placeholder:text-slate-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-[11px] text-blue-400 hover:text-blue-300 font-medium hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl outline-none text-white placeholder:text-slate-600 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl text-sm shadow-md shadow-blue-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-400 border-t border-slate-800/80 pt-4">
          Don't have an account yet?{' '}
          <Link to="/signup" className="text-blue-400 hover:text-blue-300 font-semibold underline underline-offset-2">
            Register now
          </Link>
        </div>
      </div>
    </div>
  );
};
