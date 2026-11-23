import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../services/auth.service";

export const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const result = await requestPasswordReset(email.trim());
      setMessage(result.message);
    } catch {
      setError("We could not send the request right now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] px-5 py-12 text-white">
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-7 sm:p-9">
      <h1 className="text-3xl font-bold">Reset your password</h1>
      <p className="mt-3 text-sm text-gray-400">Enter your account email. If it is registered, we will send a one-time reset link.</p>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <div className="space-y-2">
          <label className="text-sm font-semibold" htmlFor="reset-request-email">Email address</label>
          <input id="reset-request-email" name="email" type="email" autoComplete="email" required maxLength={320}
            value={email} onChange={(event) => setEmail(event.target.value)}
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button className="h-12 w-full rounded-xl bg-indigo-600 font-semibold disabled:opacity-60" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      {message ? <p className="mt-5 text-sm text-emerald-300" role="status">{message}</p> : null}
      {error ? <p className="mt-5 text-sm text-red-300" role="alert">{error}</p> : null}
      <Link className="mt-7 inline-block text-sm font-semibold text-indigo-300 hover:text-indigo-200" to="/auth/sign-in">Back to sign in</Link>
    </section>
  </main>;
};
