import { RouterProvider } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppEffects } from "./AppEffects";
import { AppProvider } from "./store";
import { router } from "./routes";
import { ApplicationErrorBoundary } from "../components/ApplicationErrorBoundary";

export const AccountApplication = () => {
  const { user, status } = useAuth();
  return <AppProvider key={user?.id ?? "signed-out"}>
    <AppEffects />
    {status === "offline" && user ? <div role="status" className="fixed bottom-3 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-amber-100 px-4 py-2 text-xs font-medium text-amber-900 shadow">
      Offline mode · cached data only. Reconnect to sync changes.
    </div> : null}
    <ApplicationErrorBoundary><RouterProvider router={router} /></ApplicationErrorBoundary>
  </AppProvider>;
};
