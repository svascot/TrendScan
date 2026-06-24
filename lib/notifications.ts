// Thin wrappers around the browser Web Notifications API used by the GMMA
// scanner. Everything here is client-only and no-ops gracefully when the API is
// unavailable (SSR, unsupported browser) so callers don't need to guard.

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermissionState {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

// Prompt the user for permission. Returns the resulting state; resolves to
// "unsupported" without throwing when the API isn't there.
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export interface SetupNotification {
  ticker: string;
  close: number;
  target: number;
  stop: number;
  shares: number;
}

// Fire a single browser notification for a new GMMA setup. `onClick` is wired to
// the notification's click event (used to focus the tab and open the detail
// panel). Returns false if it couldn't be shown.
export function fireSetupNotification(
  setup: SetupNotification,
  onClick?: () => void,
): boolean {
  if (notificationPermission() !== "granted") return false;

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sharesLabel = Number.isInteger(setup.shares)
    ? setup.shares.toString()
    : setup.shares.toFixed(2);

  try {
    const n = new Notification(`📈 ${setup.ticker} — new GMMA setup`, {
      body:
        `Buy ~$${fmt(setup.close)}  ·  ${sharesLabel} shares\n` +
        `TP $${fmt(setup.target)}  ·  SL $${fmt(setup.stop)}`,
      icon: "/logo.png",
      badge: "/logo.png",
      tag: `gmma-${setup.ticker}`, // collapse duplicates for the same ticker
      requireInteraction: true, // stay until the user dismisses it
    });
    n.onclick = () => {
      window.focus();
      onClick?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
