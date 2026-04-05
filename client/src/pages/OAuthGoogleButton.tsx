import { useState, type ReactNode } from "react";
import { storeRedirectPath } from "../auth/redirect";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

interface OAuthGoogleButtonProps {
  label?: string;
  className?: string;
  containerClassName?: string;
  errorClassName?: string;
  redirectPath?: string;
  children?: ReactNode;
}

export const OAuthGoogleButton = ({
  label = "Sign in with Google",
  className = "auth-google",
  containerClassName,
  errorClassName,
  redirectPath,
  children
}: OAuthGoogleButtonProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      if (redirectPath) {
        storeRedirectPath(redirectPath);
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: "google",
          callbackURL: `${window.location.origin}/auth/callback`,
          disableRedirect: true
        })
      });

      const data = (await response.json()) as { url?: string };

      if (!response.ok || !data.url) {
        throw new Error("Unable to start Google sign-in");
      }

      window.location.href = data.url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={containerClassName}>
      <button className={className} type="button" onClick={handleGoogleSignIn} disabled={loading} aria-label={label}>
        {loading ? "Signing in..." : children ?? label}
      </button>
      {error ? <p className={errorClassName ?? "auth-error"}>{error}</p> : null}
    </div>
  );
};
