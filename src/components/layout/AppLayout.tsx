import React from 'react';
import { Outlet } from 'react-router-dom';
import { TopNavBar } from './TopNavBar';
import { FloatingAssistantWidget } from '../assistant/FloatingAssistantWidget';
import { ChoosePlanModal } from '../modals/ChoosePlanModal';
import { useMeeting } from '../../contexts/MeetingContext';

export const AppLayout: React.FC = () => {
  const { isPlatformClosed } = useMeeting();

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
