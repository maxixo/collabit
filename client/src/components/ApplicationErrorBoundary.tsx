import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ApplicationErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failed", { message: error.message, componentStack: info.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="flex min-h-screen items-center justify-center bg-background-light px-5 text-[#0d0e1b] dark:bg-background-dark dark:text-white">
      <section className="max-w-lg rounded-2xl border border-current/15 bg-white p-7 shadow-xl dark:bg-[#16172d]" role="alert">
        <h1 className="text-2xl font-bold">Collabit hit a problem</h1>
        <p className="mt-3 text-sm text-current/70">Your local drafts are stored in this browser. Reload the app to try again; if the issue continues, return to the home page.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="rounded-lg bg-primary px-4 py-2 font-semibold text-white" onClick={() => window.location.reload()} type="button">Reload app</button>
          <a className="rounded-lg border border-current/20 px-4 py-2 font-semibold" href="/">Go to home</a>
        </div>
      </section>
    </main>;
  }
}
