import React, { useState } from 'react';
import { 
  X, 
  Settings as SettingsIcon, 
  Calendar, 
  Keyboard, 
  User, 
  Shield, 
  Globe, 
  CreditCard, 
  FileText, 
  HelpCircle, 
  MessageCircle, 
  LogOut, 
  Frown, 
  Check, 
  ShieldCheck,
  Zap
} from 'lucide-react';
import { useMeeting, MAX_FREE_MEETINGS } from '../../contexts/MeetingContext';
import { useAuth } from '../../contexts/AuthContext';

export const ChoosePlanModal: React.FC = () => {
  const { isPlanModalOpen, setIsPlanModalOpen, upgradeToPro, freeMeetingsLeft } = useMeeting();
  const { logout } = useAuth();

  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('annual');
  const [activeTab, setActiveTab] = useState('Billing');

  if (!isPlanModalOpen) return null;

  const handleUpgrade = (plan: 'pro' | 'pro_undetectable') => {
    upgradeToPro(plan);
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row border border-slate-200/80 max-h-[92vh]">
        
        {/* Close Button Top Left */}
        <button
          onClick={() => setIsPlanModalOpen(false)}
          className="absolute top-4 left-4 z-20 w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Left Sidebar (Faithful reproduction of Image 2) */}
        <div className="w-full md:w-56 bg-slate-50/80 border-r border-slate-200/80 p-5 pt-16 flex flex-col justify-between select-none">
          <div className="space-y-6">
            {/* Primary Settings Navigation */}
            <div className="space-y-1">
              {[
                { name: 'General', icon: SettingsIcon },
                { name: 'Calendar', icon: Calendar },
                { name: 'Keybinds', icon: Keyboard },
                { name: 'Profile', icon: User },
                { name: 'Security', icon: Shield },
                { name: 'Language', icon: Globe },
                { name: 'Billing', icon: CreditCard },
              ].map((item) => (
                <button
                  key={item.name}
                  onClick={() => setActiveTab(item.name)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                    activeTab === item.name
                      ? 'bg-white border border-slate-300 text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <item.icon className="w-4 h-4 text-slate-500" />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>

            {/* Support section */}
            <div className="space-y-1 pt-2">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Support
              </div>
              {[
                { name: 'Release Notes', icon: FileText },
                { name: 'Help Center', icon: HelpCircle },
                { name: 'Contact Support', icon: MessageCircle },
              ].map((item) => (
                <button
                  key={item.name}
                  onClick={() => alert(`${item.name} selected`)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors text-left"
                >
                  <item.icon className="w-3.5 h-3.5 text-slate-400" />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Bottom logout */}
          <div className="space-y-1 pt-4 border-t border-slate-200">
            <button
              onClick={logout}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-rose-600 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign out</span>
            </button>
            <button
              onClick={() => setIsPlanModalOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <Frown className="w-3.5 h-3.5" />
              <span>Quit MEETX</span>
            </button>
          </div>
        </div>

        {/* Right Content: Choose Your Plan */}
        <div className="flex-1 p-6 sm:p-8 overflow-y-auto">
          {/* Header & Annual/Monthly Switch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Choose your plan
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Unlock all features with MEETX Pro • {freeMeetingsLeft <= 0 ? '0 free meetings left' : `${freeMeetingsLeft} free meetings left`}
              </p>
            </div>

            {/* Period Switch with Save 45% Badge */}
            <div className="flex items-center p-1 bg-slate-100 rounded-full border border-slate-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setBillingPeriod('monthly')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  billingPeriod === 'monthly'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingPeriod('annual')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  billingPeriod === 'annual'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Annual</span>
                <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                  Save 45%
                </span>
              </button>
            </div>
          </div>

          {/* Two Plan Cards (Faithful reproduction of Image 2) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-6">
            
            {/* Plan 1: Pro plan (Blue card) */}
            <div className="bg-gradient-to-b from-blue-600 to-blue-700 text-white rounded-2xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden">
              <div>
                <h3 className="text-sm font-semibold text-blue-100">Pro plan</h3>
                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-sm line-through opacity-70">
                    {billingPeriod === 'annual' ? '$19.99' : '$19.99'}
                  </span>
                  <span className="text-3xl font-extrabold tracking-tight">
                    {billingPeriod === 'annual' ? '$11.99' : '$19.99'}
                  </span>
                  <span className="text-xs opacity-80">/month</span>
                </div>

                {/* Features */}
                <div className="mt-6 space-y-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                      ∞
                    </div>
                    <span>Unlimited AI Responses</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                      ∞
                    </div>
                    <span>Unlimited meetings</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-blue-200" />
                    <span>Access to newest AI models</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-blue-200" />
                    <span>Priority chat support</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4">
                <button
                  type="button"
                  onClick={() => handleUpgrade('pro')}
                  className="w-full py-2.5 bg-white hover:bg-blue-50 text-blue-600 font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Upgrade</span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">
                    -45%
                  </span>
                </button>
              </div>
            </div>

            {/* Plan 2: Pro + Undetectability (Dark slate card with Popular badge) */}
            <div className="bg-[#242938] text-white rounded-2xl p-6 flex flex-col justify-between shadow-xl relative border border-slate-700/60 overflow-hidden">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300">
                    Pro + Undetectability
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-700/80 px-2 py-0.5 rounded-full text-slate-200 border border-slate-600">
                    Popular
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mt-3">
                  <span className="text-sm line-through text-slate-500">
                    {billingPeriod === 'annual' ? '$149.99' : '$149.99'}
                  </span>
                  <span className="text-3xl font-extrabold tracking-tight text-white">
                    {billingPeriod === 'annual' ? '$79.99' : '$149.99'}
                  </span>
                  <span className="text-xs text-slate-400">/month</span>
                </div>

                {/* Features */}
                <div className="mt-6 space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <div className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-blue-400" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">MEETX Undetectability</div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        MEETX will be invisible to screen share during meetings
                      </div>
                    </div>
                  </div>

                  {/* Stealth Screen Share Graphic Illustration */}
                  <div className="mt-4 p-3.5 rounded-xl bg-slate-900/80 border border-blue-500/30 flex items-center justify-center gap-2.5 shadow-inner">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                    <span className="text-[11px] font-medium text-slate-200">Stealth Screen-Share Invisibility</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-4">
                <button
                  type="button"
                  onClick={() => handleUpgrade('pro_undetectable')}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md shadow-blue-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Upgrade</span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-500 text-white">
                    -45%
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Comparison Free Plan Line (As in Image 2) */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500 gap-3">
            <span className="font-semibold text-slate-700">Free plan:</span>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-slate-400" />
              <span>Limited AI usage per meeting</span>
            </div>
            <div className="flex items-center gap-2">
              <Check className="w-3.5 h-3.5 text-slate-400" />
              <span>Limited free meetings ({MAX_FREE_MEETINGS} max)</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
