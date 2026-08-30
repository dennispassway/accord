import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { isMockApp, mockMode } from "./mock/mode";
import type { NotificationPayload } from "./notifications";

const IS_MOCK = isMockApp(mockMode());

/** Gecachte promise i.p.v. een boolean-vlag: zonder cache zou een tweede
 * notificatie die binnenkomt terwijl de eerste nog op de permissie-await
 * wacht zijn eigen isPermissionGranted/requestPermission-ronde starten (de
 * boolean "checked" stond al op true vóór de eerste await), en zo'n tweede
 * ronde levert bij een geweigerde permissie stil "undefined granted" op en
 * laat die notificatie dus stil vallen. */
let permissionPromise: Promise<boolean> | null = null;

/** Vraagt de eerste keer netjes om toestemming; een weigering onthouden we
 * voor de rest van de sessie zodat de gebruiker niet elke keer opnieuw
 * gevraagd wordt. */
function ensurePermission(): Promise<boolean> {
  if (permissionPromise == null) {
    permissionPromise = (async () => {
      const granted = await isPermissionGranted();
      if (granted) return true;
      return (await requestPermission()) === "granted";
    })();
  }
  return permissionPromise;
}

/**
 * Stuurt de notificatie naar het OS. In de mockmodus nooit een echte
 * systeemnotificatie: alleen naar console, zodat QA de payload kan zien
 * zonder het besturingssysteem te storen. Een geweigerde permissie slaat de
 * melding stil over.
 */
export async function sendAppNotification(
  payload: NotificationPayload,
): Promise<void> {
  if (IS_MOCK) {
    console.info("[mock notificatie]", payload);
    return;
  }
  if (!(await ensurePermission())) return;
  sendNotification({
    title: payload.title,
    body: payload.body,
    extra: { prKey: payload.prKey },
  });
}

/**
 * Alleen voor QA in de mockmodus: een onderdrukte notificatie is anders stil
 * en dus niet te onderscheiden van een keten die nooit vuurt. Logt wélke gate
 * de notificatie tegenhield; buiten mock doet dit niets.
 */
export function logSuppressedNotification(context: {
  enabled: boolean;
  windowFocused: boolean;
}): void {
  if (!IS_MOCK) return;
  if (!context.enabled) {
    console.info("[mock notificatie onderdrukt] notificaties uit");
  } else if (context.windowFocused) {
    console.info("[mock notificatie onderdrukt] venster gefocust");
  }
}

/**
 * Registreert de klik-op-notificatie-handler: brengt het venster naar voren
 * en selecteert de PR waar de melding over ging (via het `extra`-payload dat
 * sendAppNotification meestuurt). Buiten Tauri (mockmodus) doet het plugin
 * toch niets, dus daar registreren we niets (en geven een no-op cleanup
 * terug). tray.rs verbergt het venster bij sluiten (`hide()`, niet
 * minimaliseren): `show()` moet daarom eerst, `setFocus()` alleen doet dan
 * niets (zelfde volgorde als tray.rs' show_main_window).
 */
export function listenForNotificationClicks(
  onSelectPr: (prKey: string) => void,
): () => void {
  if (IS_MOCK) return () => {};
  let listener: { unregister: () => void } | undefined;
  let cancelled = false;
  void onAction((notification) => {
    const window = getCurrentWindow();
    void window.show().then(() => window.setFocus());
    const prKey = (notification.extra as { prKey?: string } | undefined)?.prKey;
    if (prKey != null) onSelectPr(prKey);
  }).then((registered) => {
    if (cancelled) {
      registered.unregister();
      return;
    }
    listener = registered;
  });
  return () => {
    cancelled = true;
    listener?.unregister();
  };
}
