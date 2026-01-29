import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/routes";
import { AppEffects } from "./app/AppEffects";
import { AppProvider } from "./app/store";
import { AuthProvider } from "./auth/AuthContext";
import "./main.css";
import { registerServiceWorker } from "./workers/serviceWorker";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <AuthProvider>
    <AppProvider>
      <AppEffects />
      <RouterProvider router={router} />
    </AppProvider>
  </AuthProvider>
);

registerServiceWorker();
