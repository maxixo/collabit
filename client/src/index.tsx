import { createRoot } from "react-dom/client";
import { AuthProvider } from "./auth/AuthContext";
import { AccountApplication } from "./app/AccountApplication";
import "./main.css";
import { registerServiceWorker } from "./workers/serviceWorker";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(<AuthProvider><AccountApplication /></AuthProvider>);

registerServiceWorker();
