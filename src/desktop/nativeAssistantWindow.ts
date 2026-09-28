import { isTauri } from '@tauri-apps/api/core';
import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export const isNativeDesktop = (): boolean => isTauri();
export const isNativeAssistantWindow = (): boolean =>
  isTauri() && getCurrentWebviewWindow().label === 'assistant';

let opening: Promise<WebviewWindow | null> | null = null;
let allowAssistantClose = false;

export const openOrRestoreNativeAssistant = async (): Promise<WebviewWindow | null> => {
  if (!isTauri()) return null;
  const existing = await WebviewWindow.getByLabel('assistant');
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return existing;
  }
  if (opening) return opening;

  opening = new Promise<WebviewWindow | null>((resolve) => {
    const assistant = new WebviewWindow('assistant', {
      url: '/?window=assistant',
      title: 'MEETX Assistant',
      width: 520,
      height: 700,
      minWidth: 420,
      minHeight: 300,
      resizable: true,
      alwaysOnTop: true,
      center: true,
    });
    assistant.once('tauri://created', () => resolve(assistant));
    void assistant.onCloseRequested((event) => {
      if (allowAssistantClose) return;
      event.preventDefault();
      void assistant.hide();
    });
    assistant.once('tauri://error', (event) => {
      console.error('Could not create native assistant window:', event.payload);
      resolve(null);
    });
  }).finally(() => { opening = null; });
  return opening;
};

export const hideNativeAssistantWindow = async (): Promise<void> => {
  if (!isNativeAssistantWindow()) return;
  await getCurrentWebviewWindow().hide();
};

export const closeNativeAssistantWindow = async (): Promise<void> => {
  const assistant = await WebviewWindow.getByLabel('assistant');
  if (!assistant) return;
  allowAssistantClose = true;
  try {
    await assistant.close();
  } finally {
    window.setTimeout(() => { allowAssistantClose = false; }, 0);
  }
};
