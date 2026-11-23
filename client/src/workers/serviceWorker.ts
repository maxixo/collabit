const reportRegistrationError = (error: unknown) => {
  window.dispatchEvent(new CustomEvent("collabit:serviceworker-error", { detail: error }));
  console.warn("Service worker registration failed", error);
};

export const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
    .catch(reportRegistrationError);
};

export const unregisterServiceWorker = async (): Promise<void> => {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
};
