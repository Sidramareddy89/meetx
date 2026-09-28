import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopNavBar } from './TopNavBar';
import { FloatingAssistantWidget } from '../assistant/FloatingAssistantWidget';
import { ChoosePlanModal } from '../modals/ChoosePlanModal';
import { useMeeting } from '../../contexts/MeetingContext';
import { isNativeDesktop, openOrRestoreNativeAssistant } from '../../desktop/nativeAssistantWindow';

export const AppLayout: React.FC = () => {
  const { isPlatformClosed, isFloatingActive, stopMeetingSession } = useMeeting();

  if (isNativeDesktop() && isFloatingActive) {
    return (
      <div className="min-h-screen bg-[#151822] text-slate-200 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-white">MEETX meeting is active</h1>
          <p className="mt-2 text-sm text-slate-400">The session stays in this application while the assistant window is hidden or closed.</p>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => void openOrRestoreNativeAssistant()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Show assistant</button>
            <button type="button" onClick={stopMeetingSession} className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">End meeting</button>
          </div>
        </div>
        <ChoosePlanModal />
      </div>
    );
  }

  // MEETING MODE: the main platform window/tab is "closed" - only the
  // floating assistant widget remains on screen. The user joins their
  // meeting on any platform (Zoom/Meet/Teams/etc.) in their own tab;
  // the widget floats above it and keeps assisting.
  if (isPlatformClosed) {
    return (
      <div className="bg-transparent">
        {/* Plan / Upgrade Modal still available from the widget menu */}
        <ChoosePlanModal />
        {/* Only the floating widget survives - no nav, no page content */}
        <FloatingAssistantWidget />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans relative">
      {/* Persistent Floating Assistant Widget */}
      <FloatingAssistantWidget />

      {/* Plan / Upgrade Modal (Image 2) */}
      <ChoosePlanModal />

      {/* Top Navigation Bar */}
      <TopNavBar />

      {/* Main Platform Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
};
