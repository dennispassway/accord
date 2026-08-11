import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthError } from "../../lib/github/queries";
import { fetchViewer } from "../../lib/github/user";
import { MOCK_ME } from "../../lib/mock/fixtures";
import { type MockMode, mockMode } from "../../lib/mock/mode";
import { clearPrsSnapshot } from "../../lib/prsSnapshot";
import { GITHUB_CLIENT_ID, isClientIdConfigured } from "./config";
import type { AuthState, DeviceLoginStart, PollResult } from "./types";

const MAX_CONSECUTIVE_POLL_ERRORS = 5;
const EXPIRED_MESSAGE = "De inlogcode is verlopen, probeer opnieuw.";

const MOCK_AUTH_STATES: Record<Exclude<MockMode, "off">, AuthState> = {
  app: { status: "loggedIn", login: MOCK_ME },
  // `?mock=update` toont de gewone app; alleen het updatescherm verschilt.
  update: { status: "loggedIn", login: MOCK_ME },
  "login-client": { status: "unconfigured" },
  "login-uit": { status: "loggedOut" },
  "login-device": {
    status: "deviceCodePending",
    userCode: "WDJB-MJHT",
    verificationUri: "https://github.com/login/device",
  },
};

const MOCK_MODE = mockMode();

// Exported puur zodat het geen loginscherm-flits geeft (U13): alleen wanneer
// er straks echt een token-check gaat lopen (zie de effect hieronder, die
// dezelfde voorwaarde gebruikt) is de starttoestand "checking" in plaats van
// meteen "loggedOut" of "unconfigured".
export function initialAuthState(
  mode: MockMode,
  clientIdConfigured: boolean,
): AuthState {
  if (mode !== "off") {
    return MOCK_AUTH_STATES[mode];
  }
  return clientIdConfigured
    ? { status: "checking" }
    : { status: "unconfigured" };
}

// Puur predicaat voor B8: alleen een foutmelding met een geldig login()-pad
// mag een "opnieuw inloggen"-knop tonen.
export function canRetry(state: AuthState): boolean {
  return state.status === "error";
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(() =>
    initialAuthState(MOCK_MODE, isClientIdConfigured(GITHUB_CLIENT_ID)),
  );
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Verhoogd bij elke logout en bij elke nieuwe login: laat een poll-lus van
  // een oudere generatie zichzelf herkennen en negeren na een logout.
  const generationRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimer.current != null) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  // 401 always means the stored token is no longer valid: always clear it
  // and always end up loggedOut, regardless of which path detected it.
  const handleUnauthorized = useCallback(async () => {
    await invoke("logout");
    clearPrsSnapshot();
    setState({ status: "loggedOut" });
  }, []);

  // U2a: alleen de aanwezigheid van een token checken (keychain), geen
  // aparte REST `/user`-call meer. Dat ontkoppelt de app-start van een extra
  // roundtrip: Cockpit mag mounten en zijn PR-fetch starten zodra er een
  // token is, in plaats van te wachten op de viewer-validatie. Die validatie
  // (en de 401-detectie voor een ingetrokken token) gebeurt nu door de
  // eerste PR-fetch, die de viewer-login gratis meekrijgt in dezelfde
  // GraphQL-query (zie queries.ts) en bij een 401 `onAuthError` aanroept.
  useEffect(() => {
    if (MOCK_MODE !== "off" || !isClientIdConfigured(GITHUB_CLIENT_ID)) {
      return;
    }
    (async () => {
      let token: string | null;
      try {
        token = await invoke<string | null>("get_token");
      } catch (error) {
        setState({ status: "error", message: (error as Error).message });
        return;
      }
      if (token == null || token === "") {
        setState({ status: "loggedOut" });
        return;
      }
      // Login-naam is nog onbekend: Cockpit vult 'm aan zodra zijn eigen
      // PR-fetch (of de bewaarde snapshot) de viewer-login teruggeeft.
      setState({ status: "loggedIn", login: "" });
    })();
  }, []);

  const login = useCallback(async () => {
    if (MOCK_MODE !== "off") {
      setState(MOCK_AUTH_STATES.app);
      return;
    }
    // Idempotent: a second click while a poll loop is already running
    // must not start a competing loop.
    stopPolling();
    if (!isClientIdConfigured(GITHUB_CLIENT_ID)) {
      return;
    }
    const generation = ++generationRef.current;
    try {
      const start = await invoke<DeviceLoginStart>("start_device_login", {
        clientId: GITHUB_CLIENT_ID,
      });
      setState({
        status: "deviceCodePending",
        userCode: start.userCode,
        verificationUri: start.verificationUri,
      });
      try {
        await openUrl(start.verificationUri);
      } catch {
        // De browser kon niet automatisch geopend worden (bv. geen
        // standaardbrowser): de knop in LoginScreen blijft een handmatige weg.
      }

      const deadline = Date.now() + start.expiresIn * 1000;
      let consecutiveErrors = 0;

      const poll = async (intervalSeconds: number) => {
        if (Date.now() >= deadline) {
          setState({ status: "error", message: EXPIRED_MESSAGE });
          return;
        }

        let result: PollResult;
        try {
          result = await invoke<PollResult>("poll_device_login", {
            clientId: GITHUB_CLIENT_ID,
            deviceCode: start.deviceCode,
          });
        } catch (error) {
          // Transient invoke/network failure: keep polling up to a limit
          // instead of ending the login attempt on the first hiccup.
          consecutiveErrors += 1;
          if (consecutiveErrors > MAX_CONSECUTIVE_POLL_ERRORS) {
            setState({ status: "error", message: (error as Error).message });
            return;
          }
          pollTimer.current = setTimeout(
            () => poll(intervalSeconds),
            intervalSeconds * 1000,
          );
          return;
        }
        consecutiveErrors = 0;

        if (generationRef.current !== generation) {
          // Een logout (of nieuwe login) liep tijdens deze poll: een alsnog
          // geslaagde login mag het token niet terugzetten.
          if (result.status === "success") {
            await invoke("logout");
          }
          return;
        }

        switch (result.status) {
          case "success": {
            try {
              const viewer = await fetchViewer(result.token, fetch);
              setState({
                status: "loggedIn",
                login: viewer.login,
              });
            } catch (error) {
              if (error instanceof AuthError) {
                await handleUnauthorized();
                return;
              }
              setState({ status: "error", message: (error as Error).message });
            }
            return;
          }
          case "pending":
            pollTimer.current = setTimeout(
              () => poll(intervalSeconds),
              intervalSeconds * 1000,
            );
            return;
          case "slowDown":
            pollTimer.current = setTimeout(
              () => poll(result.interval),
              result.interval * 1000,
            );
            return;
          case "expired":
            setState({ status: "error", message: EXPIRED_MESSAGE });
            return;
          case "denied":
            setState({ status: "loggedOut" });
        }
      };

      pollTimer.current = setTimeout(
        () => poll(start.interval),
        start.interval * 1000,
      );
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    }
  }, [stopPolling, handleUnauthorized]);

  const logout = useCallback(async () => {
    stopPolling();
    generationRef.current += 1;
    if (MOCK_MODE !== "off") {
      setState({ status: "loggedOut" });
      return;
    }
    await invoke("logout");
    clearPrsSnapshot();
    setState({ status: "loggedOut" });
  }, [stopPolling]);

  return { state, login, logout };
}
