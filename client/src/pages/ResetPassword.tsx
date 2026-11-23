import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../services/auth.service";

export const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const invalidLink = searchParams.get("error") === "INVALID_TOKEN" || !token;
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(invalidLink ? "This reset link is invalid or expired. Request a new one." : "");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const result = await resetPassword(token, password);
      setMessage(result.message);
      setPassword("");
      setConfirmation("");
    } catch {
      setError("This reset link is invalid or expired. Request a new one.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-5 py-12 text-white">
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-7 sm:p-9">
      <h1 className="text-3xl font-bold">Choose a new password</h1>
      <p className="mt-3 text-sm text-gray-400">Use at least 8 characters. You will need to sign in again after the change.</p>
      {!invalidLink && !message ? <form className="mt-7 space-y-5" onSubmit={submit}>
        <div className="space-y-2">
          <label className="text-sm font-semibold" htmlFor="reset-new-password">New password</label>
          <input id="reset-new-password" name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
            value={password} onChange={(event) => setPassword(event.target.value)}
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold" htmlFor="reset-confirm-password">Confirm new password</label>
          <input id="reset-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
            value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button className="h-12 w-full rounded-xl bg-indigo-600 font-semibold disabled:opacity-60" type="submit" disabled={loading}>
          {loading ? "Updating…" : "Update password"}
        </button>
      </form> : null}
      {message ? <p className="mt-5 text-sm text-emerald-300" role="status">{message}</p> : null}
      {error ? <p className="mt-5 text-sm text-red-300" role="alert">{error}</p> : null}
      <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-indigo-300">
        <Link to="/auth/sign-in">Back to sign in</Link>
        {error ? <Link to="/auth/forgot-password">Request another link</Link> : null}
      </div>
    </section>
  </main>;
};
