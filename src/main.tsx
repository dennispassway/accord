import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isMac } from "./lib/platform";

// Buiten macOS is er geen NSVisualEffectView achter het transparante venster:
// geef html dan een effen achtergrond (zie App.css).
if (!isMac) document.documentElement.classList.add("no-vibrancy");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
