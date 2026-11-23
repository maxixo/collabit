import { Link } from "react-router-dom";

export const NotFound = () => <main className="flex min-h-screen items-center justify-center bg-background-light px-5 dark:bg-background-dark">
  <section className="max-w-lg text-center">
    <p className="text-sm font-bold uppercase tracking-widest text-primary">404</p>
    <h1 className="mt-3 text-3xl font-bold text-[#0d0e1b] dark:text-white">That page is not here</h1>
    <p className="mt-3 text-[#4c4d9a] dark:text-[#a1a1c9]">The address may have changed, or the link may be incomplete.</p>
    <Link className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 font-semibold text-white" to="/">Return to Collabit</Link>
  </section>
</main>;
