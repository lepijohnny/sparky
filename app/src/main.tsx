import React from "react";
import ReactDOM from "react-dom/client";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import App from "./App";
import ConnectionContext from "./context/ConnectionContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { ToastContainer } from "./components/shared/ToastContainer";
import ChatWindow from "./pages/chat/ChatWindow";
import ExpandWindow from "./pages/ExpandWindow";
import { initShortcuts } from "./store/shortcuts";
import "./styles/global.css";

initShortcuts();

if (navigator.userAgent.includes("Windows")) {
  document.documentElement.classList.add("platform-win");
}

if (navigator.userAgent.includes("Macintosh")) {
  document.documentElement.classList.add("platform-mac");
}

if (window.__TAURI_INTERNALS__) {
  import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    getCurrentWindow().setBackgroundColor({ red: 0x1a, green: 0x1a, blue: 0x2e, alpha: 255 });
  });
}

document.addEventListener("click", (e) => {
  const anchor = (e.target as HTMLElement).closest("a");
  if (!anchor) return;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("/")) return;
  if (href.startsWith("http://") || href.startsWith("https://")) {
    e.preventDefault();
    shellOpen(href).catch(() => window.open(href, "_blank"));
  }
});

const params = new URLSearchParams(window.location.search);
const chatId = params.get("chat");
const port = params.get("port");
const token = params.get("token");
const expandKey = params.get("expand");

const isPrint = params.get("print") === "1";
const isPopup = chatId && port && token;

if (isPopup || expandKey) {
  const preload = document.getElementById("preload");
  if (preload) preload.remove();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      {expandKey ? (
        <ExpandWindow storageKey={expandKey} />
      ) : isPopup ? (
        <ChatWindow chatId={chatId} port={Number(port)} token={token} printMode={isPrint} />
      ) : (
        <ConnectionContext>
          <ToastProvider>
            <App />
            <ToastContainer />
          </ToastProvider>
        </ConnectionContext>
      )}
    </ThemeProvider>
  </React.StrictMode>
);
