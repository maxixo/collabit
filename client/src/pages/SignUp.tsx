import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { signUpWithEmail } from "../services/auth.service";
import { SHARE_REDIRECT_STORAGE_KEY, useAuth } from "../auth/AuthContext";

const isTruthyParam = (value: string | null) => {
  if (value === null) {
    return false;
  }
  if (value === "") {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const normalizeRedirectPath = (value: string | null) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.startsWith("/") ? trimmed : null;
};

const resolveRedirectFromState = (state: unknown) => {
  const from = (state as { from?: { pathname?: string; search?: string } } | null)?.from;
  if (!from?.pathname) {
    return null;
  }
  return `${from.pathname}${from.search ?? ""}`;
};

export const SignUp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { refresh, getRedirectPath } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: ''
  });
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
      path: redirectPath,
      token: shareToken,
      share: shareRequested,
      collab: collabRequested,
      workspaceId: workspaceIdParam || undefined
    };
    try {
      sessionStorage.setItem(SHARE_REDIRECT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors; fallback redirect still works via state.
    }
  }, [shareToken, redirectPath, shareRequested, collabRequested, workspaceIdParam]);

  const signInLink = useMemo(() => {
    if (!shareToken) {
      return "/auth/sign-in";
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
    return `/auth/sign-in?${params.toString()}`;
  }, [shareToken, shareRequested, collabRequested, workspaceIdParam, redirectPath]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await signUpWithEmail(
        formData.fullName.trim(),
        formData.email.trim(),
        formData.password
      );
      if (result.token) {
        localStorage.setItem("auth_token", result.token);
        localStorage.setItem("auth_provider", "better-auth");
      }
      await refresh();
      const redirectTo = getRedirectPath(redirectPath ?? "/editor/recent");
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign up failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = () => {
    setError("Google sign-up is not available yet.");
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value
    });
  };

  return (
    <div className="flex min-h-screen w-full bg-[#0a0a0f]">
      {/* Left Side: Brand Section */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-16 overflow-hidden bg-gradient-to-br from-[#8b7bf8] via-[#7c6ef0] to-[#9d8dff]">
        {/* Decorative floating card mockup at bottom */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[480px] h-[280px] bg-white/10 backdrop-blur-sm rounded-3xl p-8 shadow-2xl rotate-[-2deg]">
          <div className="flex gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-white/30"></div>
            <div className="w-3 h-3 rounded-full bg-white/30"></div>
            <div className="w-3 h-3 rounded-full bg-white/30"></div>
          </div>
          <div className="space-y-4">
            <div className="h-3 w-2/3 bg-white/20 rounded-full"></div>
            <div className="h-3 w-full bg-white/20 rounded-full"></div>
            <div className="h-3 w-4/5 bg-white/20 rounded-full"></div>
            <div className="h-3 w-3/4 bg-white/20 rounded-full"></div>
          </div>
        </div>

        {/* Main content */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-xl px-8">
          {/* Icon */}
          <div className="mb-12 flex h-24 w-24 items-center justify-center rounded-3xl bg-white/20 backdrop-blur-md shadow-xl">
            <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          
          {/* Heading */}
          <h1 className="text-white text-6xl font-bold leading-tight tracking-tight mb-8">
            Start creating together.
          </h1>
          
          {/* Description */}
          <p className="text-white/95 text-xl font-normal leading-relaxed">
            Join thousands of teams collaborating in real-time.<br />
            Experience the next generation of shared documentation.
          </p>
        </div>
      </div>

      {/* Right Side: Sign Up Form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 lg:px-20 bg-[#0a0a0f]">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-12 lg:hidden">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8b7bf8] to-[#9d8dff] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <span className="text-white text-xl font-bold">CollabEdit</span>
          </div>
          
          {/* Header */}
          <div className="mb-10">
            <h2 className="text-white text-4xl font-bold tracking-tight mb-3">Create your account</h2>
            <p className="text-gray-400 text-base">Enter your details to get started with our workspace.</p>
          </div>

          {/* Form Section */}
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            {/* Full Name */}
            <div className="flex flex-col gap-2.5">
              <label className="text-white text-sm font-semibold">Full Name</label>
              <input
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                className="w-full bg-[#18181f] border border-[#2a2a35] text-white rounded-2xl h-14 px-5 focus:ring-2 focus:ring-[#8b7bf8] focus:border-transparent transition-all placeholder:text-gray-500 outline-none"
                placeholder="Enter your name"
                type="text"
                required
              />
            </div>

            {/* Email Address */}
            <div className="flex flex-col gap-2.5">
              <label className="text-white text-sm font-semibold">Email Address</label>
              <input
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full bg-[#18181f] border border-[#2a2a35] text-white rounded-2xl h-14 px-5 focus:ring-2 focus:ring-[#8b7bf8] focus:border-transparent transition-all placeholder:text-gray-500 outline-none"
                placeholder="name@company.com"
                type="email"
                required
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-2.5">
              <label className="text-white text-sm font-semibold">Password</label>
              <div className="relative">
                <input
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full bg-[#18181f] border border-[#2a2a35] text-white rounded-2xl h-14 px-5 pr-14 focus:ring-2 focus:ring-[#8b7bf8] focus:border-transparent transition-all placeholder:text-gray-500 outline-none"
                  placeholder="Create a password"
                  type={showPassword ? 'text' : 'password'}
                  required
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  type="button"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Create Account Button */}
            <button
              className="w-full bg-gradient-to-r from-[#8b7bf8] to-[#9d8dff] hover:opacity-90 transition-opacity flex h-14 items-center justify-center rounded-2xl text-white font-bold text-base shadow-lg mt-2 disabled:cursor-not-allowed disabled:opacity-70"
              type="submit"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Account"}
            </button>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}

            {/* Divider */}
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#2a2a35]"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[#0a0a0f] px-4 text-gray-500 font-medium tracking-wider">OR CONTINUE WITH</span>
              </div>
            </div>

            {/* Google Sign Up */}
            <button
              onClick={handleGoogleSignUp}
              className="w-full bg-[#18181f] border border-[#2a2a35] hover:bg-[#1f1f28] transition-colors flex h-14 items-center justify-center rounded-2xl text-white font-semibold text-base gap-3"
              type="button"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
              </svg>
              Sign up with Google
            </button>
          </form>

          {/* Footer Links */}
          <div className="text-center mt-8">
            <p className="text-gray-400 text-sm">
              Already have an account? 
              <Link className="text-[#8b7bf8] font-bold hover:underline ml-1" to={signInLink}>
                Sign In
              </Link>
            </p>
          </div>

          <div className="text-center mt-8">
            <p className="text-gray-500 text-xs leading-relaxed">
              By signing up, you agree to our 
              <a className="underline hover:text-gray-400 mx-1" href="#">Terms of Service</a>
              and
              <a className="underline hover:text-gray-400 ml-1" href="#">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
