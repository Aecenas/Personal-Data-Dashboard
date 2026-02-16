const isTauri = () => typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

export type NotificationPermissionStatus = NotificationPermission | 'unsupported';

const readBrowserPermission = (): NotificationPermission => {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return 'default';
  const value = window.Notification.permission;
  if (value === 'granted' || value === 'denied' || value === 'default') return value;
  return 'default';
};

const checkGranted = async (): Promise<boolean> => {
  if (!isTauri()) return false;
  const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
  const alreadyGranted = await isPermissionGranted();
  if (alreadyGranted) return true;

  return readBrowserPermission() === 'granted';
};

export const notificationService = {
  async getPermissionStatus(): Promise<NotificationPermissionStatus> {
    if (!isTauri()) return 'unsupported';
    const granted = await checkGranted();
    if (granted) return 'granted';
    return readBrowserPermission();
  },

  async requestPermission(): Promise<NotificationPermissionStatus> {
    if (!isTauri()) return 'unsupported';
    const { requestPermission } = await import('@tauri-apps/plugin-notification');
    const permission = await requestPermission();
    if (permission === 'granted' || permission === 'denied' || permission === 'default') {
      return permission;
    }
    return readBrowserPermission();
  },

  async sendDesktopNotification(title: string, body: string): Promise<boolean> {
    try {
      const granted = await checkGranted();
      if (!granted) return false;

      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      sendNotification({ title, body });
      return true;
    } catch (error) {
      console.warn('Failed to send desktop notification', error);
      return false;
    }
  },
};
