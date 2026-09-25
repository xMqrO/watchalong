import React from "react";
import ReactDOM from "react-dom/client";
import { installWebBridge } from "./utils/webBridge";
import App from "./App";
import "./styles/global.css";
import "./styles/mobile.css";

installWebBridge();

if ("serviceWorker" in navigator) {
  const swUrl = new URL("sw.js", window.location.origin).href;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.error("SW registration failed:", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
