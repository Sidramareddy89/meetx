import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * MEETX — dedicated desktop floating-window lifecycle.
 *
 * The assistant widget is a `position: fixed` element inside the browser tab,
 * so it can never outlive the tab's viewport: switching Chrome tabs or moving
 * to another application hides it. This hook opens the SAME widget in a
 * system-level always-on-top window through the Document Picture-in-Picture
 * API (Chrome/Edge 116+), which is the browser-native equivalent of a Zoom
 * floating meeting window / YouTube PiP window:
 *
 *   meeting starts  → openWindow()  → widget UI portals into the PiP window
 *   user closes it  → `pagehide`    → only THIS local state is cleared —
 *                                     MeetingContext is deliberately untouched
 *   user reopens    → openWindow()  → a new window hosts the SAME React tree
 *   meeting stops   → closeWindow() → the window closes and cleans up
 *
 * The React application (meeting state, transcription, AI queue, transcript
 * persistence) always stays in the opener document: the PiP window only hosts
 * the presentation. Closing or hiding it therefore cannot terminate a
 * meeting, and reopening reconnects to the existing active session instead of
 * creating a new one.
 *
 * Platform limits (by design of the API, not of this code):
 *  - Chromium-only (no Firefox/Safari) — callers must feature-detect and keep
 *    the in-page widget as the fallback.
 *  - The website cannot choose or read the OS position of the window; the
 *    window never outlives the opener tab and cannot be navigated.
 *  - One PiP window per browser tab.
 */

const PIP_WIDTH = 520;
const PIP_HEIGHT = 700;
const CONTAINER_ID = 'meetx-desktop-assistant-root';

interface DocumentPictureInPictureController {
  window: Window | null;
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

declare global {
  interface Window {
    /**
     * Document Picture-in-Picture controller (Chrome/Edge 116+). Declared here
     * because TypeScript 5.4's lib.dom does not include the API yet.
     */
    documentPictureInPicture?: DocumentPictureInPictureController;
  }
}

/**
 * Copy every stylesheet of the opener into the PiP document so the widget
 * keeps its exact Tailwind styling. Same-origin sheets contribute their rules
 * directly; a sheet whose rules are not readable falls back to re-linking its
 * href. Runs once per opened window (the copy is a snapshot).
 */
const copyStyleSheets = (targetWindow: Window): void => {
  const sheets =
    typeof document !== 'undefined' && document.styleSheets
      ? Array.from(document.styleSheets)
      : [];
  for (const sheet of sheets) {
    try {
      const rules = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      const style = targetWindow.document.createElement('style');
      style.textContent = rules;
      targetWindow.document.head.appendChild(style);
    } catch {
      // Cross-origin sheet: cssRules is not readable — link it instead.
      if (sheet.href) {
        const link = targetWindow.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        targetWindow.document.head.appendChild(link);
      }
    }
  }
};

export interface DesktopAssistantWindowState {
  /** Feature detection: false → callers keep the in-page widget. */
  isSupported: boolean;
  isOpen: boolean;
  /** The live PiP window, or null when closed. */
  window: Window | null;
  /** Portal target inside the PiP document, or null when closed. */
  container: HTMLElement | null;
  openWindow: () => Promise<Window | null>;
  closeWindow: () => void;
}

export const useDesktopAssistantWindow = (): DesktopAssistantWindowState => {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  // Ref mirror: the async opener and the pagehide handler must see the same
  // window identity as the state without waiting for a re-render.
  const pipWindowRef = useRef<Window | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const openingRef = useRef(false);
  const mountedRef = useRef(false);
  const unmountTimerRef = useRef<number | null>(null);

  const isSupported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  const clearWindow = useCallback((win: Window) => {
    if (pipWindowRef.current !== win) return;
    pipWindowRef.current = null;
    containerRef.current = null;
    setPipWindow(null);
  }, []);

  const openWindow = useCallback(async (): Promise<Window | null> => {
    const controller =
      typeof window !== 'undefined' ? window.documentPictureInPicture : undefined;
    if (!controller) return null;
    if (controller.window) return controller.window; // already open
    if (openingRef.current) return null; // open in flight
    openingRef.current = true;
    try {
      const win = await controller.requestWindow({
        width: PIP_WIDTH,
        height: PIP_HEIGHT,
      });
      copyStyleSheets(win);
      const doc = win.document;
      doc.body.style.margin = '0';
      doc.body.style.minHeight = '100vh';
      // Solid panel colour matching the widget's dark glass (#1a1d26 family).
      // OS-level window transparency is not guaranteed by the API.
      doc.body.style.background = '#151822';
      doc.body.style.overflow = 'auto';
      const container = doc.createElement('div');
      container.id = CONTAINER_ID;
      container.style.minHeight = '100vh';
      doc.body.appendChild(container);
      // Closing the window (browser control or Window.close()) clears only
      // THIS local state. Meeting/transcript/AI state lives in MeetingContext
      // in the opener and is never touched here — closing the desktop window
      // cannot end the meeting.
      win.addEventListener('pagehide', () => clearWindow(win), { once: true });
      containerRef.current = container;
      pipWindowRef.current = win;
      setPipWindow(win);
      return win;
    } catch (err) {
      // Not permitted (e.g. called without a user gesture) or already open:
      // the caller falls back to the in-page widget — the meeting is unaffected.
      console.warn('Desktop floating window could not open:', err);
      return null;
    } finally {
      openingRef.current = false;
    }
  }, [clearWindow]);

  const closeWindow = useCallback(() => {
    const win = pipWindowRef.current;
    if (!win) return;
    // Triggers `pagehide`, which clears the state exactly once.
    try {
      win.close();
    } catch {
      // Already gone.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    return () => {
      mountedRef.current = false;
      // Deferred: React StrictMode (dev) simulates unmount → remount on every
      // mount commit, so closing synchronously would kill a window we just
      // opened. If nothing remounts us (a real unmount, e.g. sign-out), close
      // the window so an empty shell never lingers. The meeting itself keeps
      // running in MeetingContext either way.
      unmountTimerRef.current = window.setTimeout(() => {
        unmountTimerRef.current = null;
        if (!mountedRef.current && pipWindowRef.current) {
          try {
            pipWindowRef.current.close();
          } catch {
            // Already gone.
          }
        }
      }, 0);
    };
  }, []);

  return {
    isSupported,
    isOpen: pipWindow !== null,
    window: pipWindow,
    container: pipWindow ? containerRef.current : null,
    openWindow,
    closeWindow,
  };
};
