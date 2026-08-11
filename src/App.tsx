import "./App.css";
import { LoginScreen } from "./features/auth/LoginScreen";
import { canRetry, useAuth } from "./features/auth/useAuth";
import { Cockpit } from "./features/prs/Cockpit";

function App() {
  const { state, login, logout } = useAuth();

  return (
    <main className="container">
      {state.status !== "loggedIn" && (
        <>
          <div className="drag-strip" data-tauri-drag-region />
          {state.status === "error" && <h1>Accord</h1>}
        </>
      )}

      {(state.status === "unconfigured" ||
        state.status === "loggedOut" ||
        state.status === "deviceCodePending") && (
        <LoginScreen state={state} onLogin={() => void login()} />
      )}

      {state.status === "loggedIn" && (
        <div className="loggedin-shell">
          <Cockpit login={state.login} onAuthError={logout} onLogout={logout} />
        </div>
      )}

      {state.status === "error" && (
        <div className="login-screen">
          <div className="login-title">Fout</div>
          <div className="login-body">{state.message}</div>
          {canRetry(state) && (
            <button
              type="button"
              className="login-button"
              onClick={() => void login()}
            >
              Opnieuw inloggen
            </button>
          )}
        </div>
      )}
    </main>
  );
}

export default App;
