import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { OAuthGoogleButton } from "./OAuthGoogleButton";
import { signInWithEmail } from "../services/auth.service";
import { DEFAULT_AUTH_REDIRECT_PATH, useAuth } from "../auth/AuthContext";
import { normalizeRedirectPath, resolveRedirectFromState, storeRedirectPath } from "../auth/redirect";
import { buildOAuthRedirectPath, isTruthyParam } from "../services/auth.service";

export const SignIn = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { refresh, getRedirectPath } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const shareToken =
    searchParams.get("token")?.trim() || searchParams.get("shareToken")?.trim() || "";
  const shareRequested =
    isTruthyParam(searchParams.get("share")) || isTruthyParam(searchParams.get("shared"));
  const collabRequested =
    isTruthyParam(searchParams.get("collab")) || isTruthyParam(searchParams.get("collaboration"));
  const workspaceIdParam = searchParams.get("workspaceId")?.trim() || "";
  const redirectPath =
    normalizeRedirectPath(searchParams.get("redirect")) || resolveRedirectFromState(location.state);

  useEffect(() => {
    if (!shareToken || !redirectPath) {
      return;
    }
    const payload = {
      shareToken,
      shareRequested,
      collabRequested,
      workspaceId: workspaceIdParam,
      redirectPath
    };
    storeRedirectPath(buildOAuthRedirectPath(payload));
  }, [shareToken, redirectPath, shareRequested, collabRequested, workspaceIdParam]);

  const signUpLink = useMemo(() => {
    if (!shareToken) {
      return "/auth/sign-up";
    }
    const params = new URLSearchParams();
    params.set("token", shareToken);
    if (shareRequested) {
      params.set("share", "true");
    }
    if (collabRequested) {
      params.set("collab", "true");
    }
    if (workspaceIdParam) {
      params.set("workspaceId", workspaceIdParam);
    }
    if (redirectPath) {
      params.set("redirect", redirectPath);
    }
    return `/auth/sign-up?${params.toString()}`;
  }, [shareToken, shareRequested, collabRequested, workspaceIdParam, redirectPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithEmail(email, password);
      await refresh();
      const redirectTo = getRedirectPath(redirectPath ?? DEFAULT_AUTH_REDIRECT_PATH);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#fafafa] font-display">
      <main className="flex min-h-screen flex-col lg:flex-row">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] p-16 lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
          <div
            className="absolute inset-0 z-0 bg-cover bg-center opacity-20 mix-blend-overlay"
            style={{
              backgroundImage:
                'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDcoAQlcT6-Ju4h6A6yC0UkvYDO-5pqJV8VzdlNRLI-Tr_UyjGmoZ9A-IYOmaTJ-etYhoaDuvveYvtDKl-PfCfs4O_VVpreD1V5frlfPXK5qLGHwPuXWJfO2wT18gpu8dpSKIi0E5HWnoYb8DcO6YoOmPMaf52UoJ25ySDWuIlTFgMjBptiJOWRg4k6VO0cJgUUpCwjvFYtMNJsQtm4l7l8Hle0Ee582Nomy8inA7OTquSKcUPEacXRxmowBtUuw5_SNnt0O5eiYw")'
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-md">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 6H42L36 24L42 42H6L12 24L6 6Z" fill="currentColor" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Collabit</h2>
          </div>
          <div className="relative z-10 max-w-lg">
            <h1 className="mb-8 text-6xl font-black leading-tight tracking-[-0.033em] text-white">
              Collaborate without boundaries.
            </h1>
            <p className="text-xl font-medium leading-relaxed text-white/80">
              The next generation collaborative text editor for high-performance teams.
            </p>
          </div>
          <div className="relative z-10 flex gap-6 text-xs font-semibold uppercase tracking-widest text-white/60">
            <span>2024 Collabit Inc.</span>
            <a className="transition-colors hover:text-white" href="#">
              Privacy
            </a>
            <a className="transition-colors hover:text-white" href="#">
              Terms
            </a>
          </div>
        </section>

        <section className="flex flex-1 flex-col items-center justify-center bg-[#0a0a0f] px-6 py-12 lg:px-20">
          <div className="flex w-full max-w-[440px] flex-col">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 6H42L36 24L42 42H6L12 24L6 6Z" fill="currentColor" />
                </svg>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white">Collabit</h2>
            </div>

            <div className="mb-10 flex flex-col gap-3">
              <h2 className="text-4xl font-black leading-tight tracking-tight text-[#fafafa]">Sign In</h2>
              <p className="text-base text-gray-400">
                New here?{" "}
                <Link
                  className="font-bold text-[#8b5cf6] transition-colors hover:text-[#a78bfa]"
                  to={signUpLink}
                >
                  Create an account
                </Link>
              </p>
            </div>

            <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <label className="px-1 text-sm font-semibold text-[#fafafa]" htmlFor="sign-in-email">
                  Email Address
                </label>
                <input
                  id="sign-in-email"
                  className="flex h-14 w-full rounded-xl border border-white/10 bg-white/5 px-6 text-base text-[#fafafa] placeholder:text-gray-500 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#6366f1]"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-sm font-semibold text-[#fafafa]" htmlFor="sign-in-password">
                    Password
                  </label>
                  <a className="text-xs font-bold text-[#8b5cf6] transition-colors hover:text-[#a78bfa]" href="#">
                    Forgot Password?
                  </a>
                </div>
                <div className="relative flex items-center">
                  <input
                    id="sign-in-password"
                    className="flex h-14 w-full rounded-xl border border-white/10 bg-white/5 px-6 text-base text-[#fafafa] placeholder:text-gray-500 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#6366f1]"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    className="absolute right-5 text-gray-500 transition-colors hover:text-[#fafafa]"
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <span className="material-symbols-outlined">{showPassword ? "visibility_off" : "visibility"}</span>
                  </button>
                </div>
              </div>

              <button
                className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-base font-bold tracking-wide text-white shadow-xl shadow-indigo-500/20 transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
                type="submit"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            {error ? <p className="mt-6 text-sm text-red-400">{error}</p> : null}

            <div className="relative my-10 flex items-center">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="mx-4 flex-shrink text-xs font-bold uppercase tracking-widest text-gray-500">
                Or continue with
              </span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <OAuthGoogleButton
                label="Sign in with Google"
                className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 text-[#fafafa] transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
                containerClassName="w-full"
                errorClassName="mt-3 text-sm text-red-400"
                redirectPath={buildOAuthRedirectPath({
                  shareToken,
                  shareRequested,
                  collabRequested,
                  workspaceId: workspaceIdParam,
                  redirectPath
                })}
              >
                <img
                  alt="Google logo"
                  className="h-5 w-5"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuBDWZKCrcp7uTsv3GH9yIzlmZM9DrMBQOVtD-UvMr9FHnmMoWx7lv6Ai7GR5J5uZYl4a8tLB-G7vOLhaGLVdJlETZ_lLDfgUWaPKJ8WC2tlYXmVQrHtVM6CxYJc-2Pzyk4sTD8te4q3sDBnvTP5fHEnakAXtbfbzbwFYBbvMR5ojlZQgoQcV-tneasO-BXpMGmzKuv76TkvXtx3viFbSuX-AphylHfWb4y7SMTvk9JZHUFBAcxXVz_L3dmfr7xf0oEhm767Yv7JrQ"
                />
                <span className="text-sm font-bold">Google</span>
              </OAuthGoogleButton>
              <button
                className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 text-[#fafafa] transition-colors hover:bg-white/10"
                type="button"
                aria-label="Sign in with Apple"
              >
                <img
                  alt="Apple logo"
                  className="h-5 w-5 invert"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuAsF8p0FDtUXdsQNUB8tx7ZQl9oSh74a4VzAWGhDGCGj6QifR2QnAioxXEE4SjtMnXSjZq5H2nvNtvQ-IHZhHfmjUO39yrv6uEu-dVPBFVN3Y-Kk5EnyiBKjZQbFSvnbMIG80rWuIDv5PIYvjMjf56pN8-BauQ-SUNcf_UZiiBbLbha7k6yd37Aq23RXG9qv1J4tgh1sL8jmWrmFWv3PP9X6LCLndF8sLzV4B8cVsKInWeSTkjG81p9hAmx1UX1vTId5eZTfCI5PQ"
                />
                <span className="text-sm font-bold">Apple</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
