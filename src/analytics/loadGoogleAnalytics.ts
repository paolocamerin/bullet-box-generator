declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

let loaded = false;

/**
 * Injects the GA4 gtag.js script. Only call this after the user has
 * explicitly accepted analytics cookies — no script tag exists in the page
 * at all until then, so nothing is tracked pre-consent.
 */
export function loadGoogleAnalytics(measurementId: string) {
  if (loaded || !measurementId) return;
  loaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  }
  gtag("js", new Date());
  gtag("config", measurementId);
}
