import { ref } from "vue";

/** Whether the browser believes it has a connection. Updated live. */
export const online = ref(typeof navigator === "undefined" ? true : navigator.onLine);

/** Running as an installed app rather than in a browser tab. */
export const standalone = ref(false);

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Chrome/Edge/Android hand this over once the app is installable. */
export const installEvent = ref<InstallPromptEvent | null>(null);

/** iOS has no install prompt: Safari's Share → "Add to Home Screen" is the way. */
export const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Wires the listeners once, as early as possible: `beforeinstallprompt` fires
 * shortly after load and is lost if nobody is listening yet.
 */
export function initPwa(): void {
  window.addEventListener("online", () => (online.value = true));
  window.addEventListener("offline", () => (online.value = false));
  const media = window.matchMedia("(display-mode: standalone)");
  standalone.value = media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  media.addEventListener("change", (e) => (standalone.value = e.matches));
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent.value = e as InstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    installEvent.value = null;
    standalone.value = true;
  });
}

export async function promptInstall(): Promise<void> {
  const event = installEvent.value;
  if (!event) return;
  await event.prompt();
  await event.userChoice;
  installEvent.value = null;
}

/**
 * Forgets the API answers the service worker kept for offline use. Called on
 * sign-out, so a signed-out phone offline doesn't still look signed in.
 */
export async function clearApiCache(): Promise<void> {
  try {
    await caches.delete("api");
  } catch {
    // No Cache Storage (old browser, private mode): nothing was kept anyway.
  }
}
