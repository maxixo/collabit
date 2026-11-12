import { RouterProvider } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppEffects } from "./AppEffects";
import { AppProvider } from "./store";
import { router } from "./routes";

export const AccountApplication = () => {
  const { user } = useAuth();
  return <AppProvider key={user?.id ?? "signed-out"}>
    <AppEffects />
    <RouterProvider router={router} />
  </AppProvider>;
};
