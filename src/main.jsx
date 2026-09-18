import React from "react";
import ReactDOM from "react-dom/client";
import { installWebBridge } from "./utils/webBridge";
import App from "./App";
import "./styles/global.css";
import "./styles/mobile.css";

installWebBridge();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
