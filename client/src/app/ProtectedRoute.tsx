import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const { status, user } = useAuth();

  if (status === "loading") {
    return <div className="auth-loading">Checking session...</div>;
  }

  if (status === "unauthenticated" || (status === "offline" && !user)) {
    return <Navigate to="/auth/sign-in" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};
