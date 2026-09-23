import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import type { AuthState, LoggedOutReason } from "./types";
import "./login.css";

type LoginAuthState = Extract<
  AuthState,
  { status: "unconfigured" | "loggedOut" | "deviceCodePending" }
>;

type Props = {
  state: LoginAuthState;
  onLogin: () => void;
  onCancelLogin: () => void;
};

// Puur zodat de tekst per reden getest kan worden zonder te renderen.
export function loggedOutBody(reason: LoggedOutReason): string {
  switch (reason) {
    case "firstRun":
      return "Accord leest de pull requests die op jou wachten via GitHub. Log in om te beginnen.";
    case "manual":
      return "Je bent uitgelogd.";
    case "denied":
      return "Je hebt de toegang op GitHub geweigerd. Log opnieuw in als je Accord toch wilt koppelen.";
    case "sessionExpired":
      return "GitHub accepteert je sessie niet meer: hij is verlopen of ingetrokken. Log opnieuw in.";
    case "cancelled":
      return "Inloggen geannuleerd.";
  }
}

function SlotIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.6" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.2a9.8 9.8 0 0 0-3.1 19.1c.5.1.7-.2.7-.5v-1.9c-2.7.6-3.3-1.2-3.3-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.4-2.2-.2-4.4-1.1-4.4-4.8 0-1.1.4-1.9 1-2.6-.1-.3-.4-1.3.1-2.6 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.3.2 2.3.1 2.6.6.7 1 1.5 1 2.6 0 3.7-2.2 4.5-4.4 4.8.4.4.7 1 .7 2v3c0 .3.2.6.7.5A9.8 9.8 0 0 0 12 2.2z" />
    </svg>
  );
}

export function LoginScreen({ state, onLogin, onCancelLogin }: Props) {
  const [copyLabel, setCopyLabel] = useState("Kopieer");

  if (state.status === "unconfigured") {
    return (
      <div className="login-screen">
        <div className="login-icon">
          <SlotIcon />
        </div>
        <div className="login-title">Client-ID nog niet geconfigureerd</div>
        <div className="login-body">
          Accord gebruikt de GitHub device-flow. Zet{" "}
          <code>VITE_GITHUB_CLIENT_ID</code> in een <code>.env</code>-bestand,
          daarna kun je inloggen.
        </div>
      </div>
    );
  }

  if (state.status === "loggedOut") {
    return (
      <div className="login-screen">
        <div className="login-icon">
          <GithubIcon />
        </div>
        <div className="login-title">Inloggen bij GitHub</div>
        <div className="login-body">{loggedOutBody(state.reason)}</div>
        <button type="button" className="login-button" onClick={onLogin}>
          Inloggen met GitHub
        </button>
        <div className="login-foot">Scopes: repo, read:org</div>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(state.userCode).then(() => {
      setCopyLabel("Gekopieerd!");
      setTimeout(() => setCopyLabel("Kopieer"), 1500);
    });
  };

  return (
    <div className="login-screen">
      <div className="login-icon">
        <GithubIcon />
      </div>
      <div className="login-title">Voer de code in op github.com</div>
      <div className="login-body">
        Er is een browser geopend op {state.verificationUri}. Kwam die niet
        open, gebruik dan de knop hieronder. Voer daar deze code in, dit venster
        gaat automatisch verder.
      </div>
      <div className="login-code-wrap">
        <div className="login-code">{state.userCode}</div>
        <button type="button" className="login-copy" onClick={handleCopy}>
          {copyLabel}
        </button>
        <div className="login-wait">
          <span className="login-wait-dot" />
          wachten op goedkeuring&hellip;
        </div>
      </div>
      <button
        type="button"
        className="login-button"
        onClick={() => void openUrl(state.verificationUri).catch(() => {})}
      >
        Open github.com/login/device
      </button>
      <button
        type="button"
        className="login-button login-button-secondary"
        onClick={onCancelLogin}
      >
        Annuleren
      </button>
    </div>
  );
}
