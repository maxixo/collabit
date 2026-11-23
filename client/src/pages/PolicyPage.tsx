import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const PolicyDraftNotice = () => <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="note">
  <strong>Operator review required.</strong> This product-specific draft needs the operator&apos;s legal identity, contact details, hosting and retention practices, and jurisdiction checked before public launch.
</div>;

const PolicyLayout = ({ title, children }: { title: string; children: ReactNode }) => <main className="min-h-screen bg-background-light px-4 py-10 text-[#0d0e1b] dark:bg-background-dark dark:text-white sm:px-6 sm:py-16">
  <article className="mx-auto max-w-3xl rounded-2xl border border-current/10 bg-white p-6 shadow-sm dark:bg-[#16172d] sm:p-10">
    <Link className="text-sm font-semibold text-primary hover:underline" to="/">Collabit</Link>
    <h1 className="mt-5 text-3xl font-bold">{title}</h1>
    <p className="mt-2 text-sm text-current/60">Draft for review · updated November 2026</p>
    <PolicyDraftNotice />
    <div className="space-y-6 text-sm leading-7 text-current/80">{children}</div>
    <Link className="mt-10 inline-flex text-sm font-semibold text-primary hover:underline" to="/">Back to Collabit</Link>
  </article>
</main>;

export const PrivacyPolicy = () => <PolicyLayout title="Privacy notice draft">
  <section><h2 className="text-lg font-bold text-current">Information used by Collabit</h2><p>Collabit handles account details, workspace membership, documents, sharing permissions, and collaboration activity needed to provide the editor. Authentication cookies keep sessions active. The operator must confirm exactly which request and diagnostic logs are retained.</p></section>
  <section><h2 className="text-lg font-bold text-current">Documents and sharing</h2><p>Documents are stored by the service and may be accessible to collaborators you invite or to anyone with a share link, depending on the link permissions you select. Review a document&apos;s access and revoke links when they are no longer needed.</p></section>
  <section><h2 className="text-lg font-bold text-current">Offline copies</h2><p>The browser can keep account-scoped document data and queued edits locally so you can read and recover work offline. Sign out on a shared device, and use Profile to review or remove local drafts. Clearing browser storage can remove local-only work.</p></section>
  <section><h2 className="text-lg font-bold text-current">Providers, retention, and requests</h2><p>Before publication, the operator must list the actual hosting, database, email, and OAuth providers; describe retention and deletion schedules; name the data controller and contact address; and specify how users can request access or deletion.</p></section>
</PolicyLayout>;

export const TermsOfService = () => <PolicyLayout title="Terms of service draft">
  <section><h2 className="text-lg font-bold text-current">Using Collabit</h2><p>Use an account you control, keep your sign-in credentials private, and do not use the service to violate applicable law or interfere with other users&apos; access.</p></section>
  <section><h2 className="text-lg font-bold text-current">Your content and collaborators</h2><p>You retain responsibility for the content you create and share. Make sure you have permission to invite collaborators or distribute a share link. Workspace owners can change member access and revoke links.</p></section>
  <section><h2 className="text-lg font-bold text-current">Availability and data recovery</h2><p>The service may be unavailable or change while it is maintained. Offline drafts are stored in the current browser and are not a substitute for an independent backup. Export important documents and resolve local sync conflicts promptly.</p></section>
  <section><h2 className="text-lg font-bold text-current">Operator details to complete</h2><p>Before publication, the operator must add the contracting entity and address, support contact, governing law, any pricing or cancellation terms, effective date, and a reviewed limitation and termination policy.</p></section>
</PolicyLayout>;
