import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { DEFAULT_AUTH_REDIRECT_PATH, useAuth } from "../auth/AuthContext";

const appHomeHref = DEFAULT_AUTH_REDIRECT_PATH;

const topNavLinks = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#docs", label: "Docs" },
  { href: "#about", label: "About" }
] as const;

const trustedBy = ["VELOCITY", "QUANTUM", "SYNTH", "AETHER", "NEXUS"] as const;

const featureCards = [
  {
    icon: "group",
    title: "Live Presence",
    description:
      "See who is editing in real time with fast presence updates that make teamwork feel immediate."
  },
  {
    icon: "cloud_off",
    title: "Offline First",
    description:
      "Keep writing without a connection and let Collabit sync your changes when the network catches up."
  },
  {
    icon: "history",
    title: "Version History",
    description:
      "Review changes, restore earlier drafts, and keep document history available when work moves quickly."
  }
] as const;

const pricingCards = [
  {
    name: "Starter",
    price: "Free",
    description: "For individuals and small teams trying shared docs for the first time.",
    features: "Unlimited drafts, live editing, shared workspace access"
  },
  {
    name: "Team",
    price: "$12",
    description: "For teams that need collaboration, recovery, and smoother document operations.",
    features: "Presence, history, sharing, starred docs, trash restore"
  },
  {
    name: "Scale",
    price: "Custom",
    description: "For larger organizations that need rollout help and tailored workflow support.",
    features: "Migration planning, onboarding, deployment guidance"
  }
] as const;

const docsCards = [
  {
    title: "Shared Workspaces",
    description: "Use workspace-aware routes to move between recent, starred, shared, and trash views."
  },
  {
    title: "Real-time Editing",
    description: "Collabit combines Yjs collaboration with presence signals and conflict-safe recovery."
  },
  {
    title: "Offline Recovery",
    description: "Local queues keep document updates and star changes safe until connectivity returns."
  }
] as const;

const footerLinks = [
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#privacy", label: "Privacy" },
  { href: "#terms", label: "Terms" },
  { href: "#about", label: "About" },
  { href: "#docs", label: "Docs" }
] as const;

const SocialLink = ({ label }: { label: string }) => (
  <span
    className="font-label text-xs text-slate-500 transition-colors dark:text-slate-400"
    aria-disabled="true"
    title={`${label} link not configured`}
  >
    {label}
  </span>
);

export const Landing = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { status } = useAuth();
  const isAuthenticated = status === "authenticated";
  const primaryCtaHref = isAuthenticated ? appHomeHref : "/auth/sign-up";
  const primaryCtaLabel = isAuthenticated ? "Open Workspace" : "Get Started for Free";
  const navPrimaryLabel = isAuthenticated ? "Recent Docs" : "Sign Up";
  const navPrimaryHref = isAuthenticated ? appHomeHref : "/auth/sign-up";
  const navSecondaryLabel = isAuthenticated ? "Open App" : "Login";
  const navSecondaryHref = isAuthenticated ? appHomeHref : "/auth/sign-in";
  const finalCtaLabel = isAuthenticated ? "Open Collabit" : "Sign Up Now";
  const finalCtaHref = isAuthenticated ? appHomeHref : "/auth/sign-up";

  useEffect(() => {
    if (status === "authenticated" && !location.hash) {
      navigate(appHomeHref, { replace: true });
      return;
    }

    if (status === "authenticated") {
      return;
    }

    if (!location.hash) {
      return;
    }

    const targetId = location.hash.replace("#", "");
    const element = document.getElementById(targetId);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, navigate, status]);

  return (
    <div className="dark min-h-screen bg-background text-on-background selection:bg-primary-container selection:text-white">
      <div className="bg-background text-on-background">
        <nav className="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/80 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-8">
              <Link className="text-xl font-black tracking-tighter text-indigo-600 dark:text-indigo-400" to="/">
                Collabit
              </Link>
              <div className="hidden items-center gap-6 md:flex">
                {topNavLinks.map((item, index) => (
                  <a
                    key={item.label}
                    className={
                      index === 0
                        ? "border-b-2 border-indigo-600 pb-1 font-label text-sm font-medium text-indigo-600 dark:text-indigo-400"
                        : "font-label text-sm font-medium text-slate-600 transition-opacity duration-150 active:scale-95 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    }
                    href={item.href}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                className="font-label text-sm font-medium text-slate-600 transition-opacity duration-150 active:scale-95 hover:opacity-80 dark:text-slate-400"
                to={navSecondaryHref}
              >
                {navSecondaryLabel}
              </Link>
              <Link
                className="rounded-full bg-primary-container px-5 py-2 font-label text-sm font-medium text-on-primary-container transition-opacity duration-150 active:scale-95 hover:opacity-90"
                to={navPrimaryHref}
              >
                {navPrimaryLabel}
              </Link>
            </div>
          </div>
        </nav>

        <main className="pt-24">
          <section className="relative overflow-hidden pb-32 pt-20">
            <div className="hero-gradient pointer-events-none absolute left-1/2 top-0 h-full w-full -translate-x-1/2"></div>
            <div className="relative z-10 mx-auto max-w-7xl px-6 text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-highest px-3 py-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary"></span>
                <span className="text-xs font-medium text-primary">New: landing experience is live</span>
              </div>
              <h1 className="mb-6 bg-gradient-to-r from-primary to-tertiary-fixed-dim bg-clip-text text-5xl font-black tracking-tight text-transparent md:text-7xl">
                Collaborate without boundaries.
              </h1>
              <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-on-surface-variant md:text-xl">
                Collabit is the next generation collaborative editor for high-performance teams.
                Write together, stay in sync offline, and move from draft to decision without
                switching tools.
              </p>
              <div className="mb-20 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  className="w-full rounded-xl bg-primary-container px-8 py-4 text-center font-bold text-white shadow-lg shadow-primary-container/20 transition-all hover:scale-[1.02] active:scale-95 sm:w-auto"
                  to={primaryCtaHref}
                >
                  {primaryCtaLabel}
                </Link>
                <a
                  className="w-full rounded-xl border border-outline-variant px-8 py-4 text-center font-bold text-on-surface transition-all hover:bg-surface-container-high sm:w-auto"
                  href="#docs"
                >
                  View Docs
                </a>
              </div>

              <div className="relative mx-auto max-w-5xl">
                <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-primary/30 to-tertiary/30 blur-2xl opacity-50"></div>
                <div className="glass-card relative overflow-hidden rounded-[2rem] border border-white/10 shadow-2xl">
                  <img
                    alt="Collabit workspace"
                    className="aspect-[16/9] h-auto w-full object-cover"
                    src="/screen.png"
                  />
                  <div className="absolute left-1/3 top-1/4 flex items-center gap-2 rounded-full rounded-tl-none bg-primary px-3 py-1 shadow-lg">
                    <span className="material-symbols-outlined text-sm text-on-primary">near_me</span>
                    <span className="text-xs font-bold text-on-primary">Sarah K.</span>
                  </div>
                  <div className="absolute bottom-1/3 right-1/4 flex items-center gap-2 rounded-full rounded-tl-none bg-tertiary px-3 py-1 shadow-lg">
                    <span className="material-symbols-outlined text-sm text-on-tertiary">near_me</span>
                    <span className="text-xs font-bold text-on-tertiary">Alex M.</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-y border-outline-variant/30 py-16" aria-label="Trusted by">
            <div className="mx-auto max-w-7xl px-6">
              <p className="mb-10 text-center text-sm font-semibold uppercase tracking-[0.3em] text-outline">
                Trusted by industry leaders
              </p>
              <div className="flex flex-wrap items-center justify-center gap-12 opacity-50 grayscale transition-all duration-500 hover:grayscale-0 md:gap-24">
                {trustedBy.map((company) => (
                  <div key={company} className="text-2xl font-black text-on-surface">
                    {company}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section id="features" className="bg-surface-container-lowest py-32">
            <div className="mx-auto max-w-7xl px-6">
              <div className="mb-20 text-center">
                <h2 className="mb-4 text-4xl font-bold">Built for the future of work</h2>
                <p className="mx-auto max-w-xl text-on-surface-variant">
                  Everything you need to write, plan, and collaborate without the friction of
                  traditional tools.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                {featureCards.map((feature) => (
                  <article
                    key={feature.title}
                    className="glass-card group rounded-2xl p-8 transition-colors hover:border-primary/50"
                  >
                    <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-container/10 text-primary transition-transform group-hover:scale-110">
                      <span className="material-symbols-outlined text-3xl">{feature.icon}</span>
                    </div>
                    <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
                    <p className="leading-relaxed text-on-surface-variant">{feature.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="pricing" className="py-32">
            <div className="mx-auto max-w-7xl px-6">
              <div className="mb-16 text-center">
                <h2 className="mb-4 text-4xl font-bold">Simple plans for growing teams</h2>
                <p className="mx-auto max-w-2xl text-on-surface-variant">
                  Start free, move into shared team workflows, and keep the same editor experience
                  as your collaboration model grows.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                {pricingCards.map((tier, index) => (
                  <article
                    key={tier.name}
                    className={`rounded-[2rem] border p-8 ${
                      index === 1
                        ? "border-primary/40 bg-surface-container shadow-2xl shadow-primary/10"
                        : "border-outline-variant bg-surface-container-low"
                    }`}
                  >
                    <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
                      {tier.name}
                    </p>
                    <div className="mb-4 flex items-end gap-2">
                      <span className="text-4xl font-black text-on-surface">{tier.price}</span>
                      {tier.price.startsWith("$") ? (
                        <span className="pb-1 text-sm text-on-surface-variant">per editor / month</span>
                      ) : null}
                    </div>
                    <p className="mb-6 min-h-[72px] text-on-surface-variant">{tier.description}</p>
                    <p className="rounded-2xl bg-surface-container-high px-4 py-3 text-sm text-on-surface">
                      {tier.features}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="docs" className="bg-surface-container-lowest py-32">
            <div className="mx-auto max-w-7xl px-6">
              <div className="mb-16 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="max-w-2xl">
                  <h2 className="mb-4 text-4xl font-bold">Documentation-ready workflows</h2>
                  <p className="text-on-surface-variant">
                    The current app already supports recent, starred, shared, trash, profile, and
                    live editor routes. The landing page points directly into those working surfaces.
                  </p>
                </div>
                <Link
                  className="inline-flex items-center justify-center rounded-full border border-outline-variant px-5 py-3 font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
                  to={appHomeHref}
                >
                  Open the app
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                {docsCards.map((card) => (
                  <article key={card.title} className="glass-card rounded-2xl p-8">
                    <h3 className="mb-3 text-xl font-bold">{card.title}</h3>
                    <p className="leading-relaxed text-on-surface-variant">{card.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section id="about" className="relative py-32">
            <div className="mx-auto max-w-4xl px-6">
              <div className="glass-card relative overflow-hidden rounded-[2.5rem] border border-primary/20 p-12 shadow-2xl shadow-primary/5">
                <div className="absolute right-0 top-0 p-8 opacity-10">
                  <span className="material-symbols-outlined text-9xl">format_quote</span>
                </div>
                <div className="mb-8 flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary bg-surface-container-high text-xl font-black text-primary">
                    MT
                  </div>
                  <div>
                    <p className="text-lg font-bold">Marcus Thorne</p>
                    <p className="text-sm text-on-surface-variant">CTO at Velocity Interactive</p>
                  </div>
                </div>
                <blockquote className="mb-8 text-2xl font-medium leading-tight md:text-3xl">
                  "Collabit changed how our engineering team documents architecture. It is the
                  first editor that actually keeps up with our pace."
                </blockquote>
                <div className="mb-6 flex gap-1 text-tertiary">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span
                      key={`rating-${index}`}
                      className="material-symbols-outlined"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                  ))}
                </div>
                <p className="max-w-2xl text-on-surface-variant">
                  Built for distributed product, engineering, and operations teams that need live
                  editing, shareable workspaces, and safer offline recovery.
                </p>
              </div>
            </div>
          </section>

          <section id="privacy" className="py-16">
            <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 lg:grid-cols-2">
              <article className="rounded-[2rem] border border-outline-variant bg-surface-container p-8">
                <h2 className="mb-4 text-2xl font-bold">Privacy</h2>
                <p className="leading-relaxed text-on-surface-variant">
                  Collabit keeps authentication, workspace access, and document sharing scoped to
                  the routes and permissions already present in the app. Public marketing content at
                  `/` does not expose protected editor data.
                </p>
              </article>
              <article id="terms" className="rounded-[2rem] border border-outline-variant bg-surface-container p-8">
                <h2 className="mb-4 text-2xl font-bold">Terms</h2>
                <p className="leading-relaxed text-on-surface-variant">
                  This landing page is a product entry surface for the current MVP. Core editor,
                  sharing, history, export, and workspace flows remain governed by the existing app
                  behavior and server-side authorization.
                </p>
              </article>
            </div>
          </section>

          <section className="py-32">
            <div className="mx-auto max-w-5xl px-6">
              <div className="relative overflow-hidden rounded-[3rem] bg-gradient-to-br from-primary-container to-secondary-container p-12 text-center md:p-20">
                <div className="pointer-events-none absolute inset-0 opacity-10">
                  <div className="absolute left-0 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white blur-[100px]"></div>
                  <div className="absolute bottom-0 right-0 h-64 w-64 translate-x-1/2 translate-y-1/2 rounded-full bg-black blur-[100px]"></div>
                </div>
                <h2 className="relative z-10 mb-6 text-4xl font-black text-white md:text-5xl">
                  Ready to boost your team&apos;s productivity?
                </h2>
                <p className="relative z-10 mx-auto mb-10 max-w-xl text-lg text-white/80">
                  Join teams using Collabit to move faster across shared documents, reviews, and
                  editor workflows.
                </p>
                <div className="relative z-10">
                  <Link
                    className="inline-flex rounded-2xl bg-white px-10 py-5 text-xl font-black text-primary-container shadow-xl transition-all hover:scale-105 active:scale-95"
                    to={finalCtaHref}
                  >
                    {finalCtaLabel}
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 py-12 md:flex-row">
            <div className="flex flex-col items-center gap-4 md:items-start">
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Collabit</span>
              <p className="font-label text-xs text-slate-500 dark:text-slate-400">
                2024 Collabit Inc. All rights reserved.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-8">
              {footerLinks.map((item) => (
                <a
                  key={item.label}
                  className="font-label text-xs text-slate-500 transition-colors hover:text-indigo-500 dark:text-slate-400"
                  href={item.href}
                >
                  {item.label}
                </a>
              ))}
              <SocialLink label="Twitter" />
              <SocialLink label="GitHub" />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
