import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_AUTH_REDIRECT_PATH, useAuth } from "../auth/AuthContext";

export const AuthCallback = () => {
  const navigate = useNavigate();
  const { refresh, getRedirectPath } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const finalizeAuth = async () => {
      try {
        await refresh();
        if (!isMounted) {
          return;
        }

        navigate(getRedirectPath(DEFAULT_AUTH_REDIRECT_PATH), { replace: true });
      } catch (err) {
        if (!isMounted) {
          return;
        }

        setError(err instanceof Error ? err.message : "Unable to complete sign-in");
      }
    };

    void finalizeAuth();

    return () => {
      isMounted = false;
    };
  }, [getRedirectPath, navigate, refresh]);

  return (
    <div className="auth-loading min-h-screen flex items-center justify-center bg-[#0a0a0f] text-[#fafafa]">
      <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
        <h1 className="text-2xl font-bold">Completing sign-in</h1>
        <p className="text-sm text-gray-400">
          {error ?? "Finalizing your Google session and redirecting to your workspace."}
        </p>
      </div>
    </div>
  );
};
