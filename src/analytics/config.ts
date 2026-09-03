// Google Analytics 4 measurement ID (looks like "G-XXXXXXXXXX"), from the
// GA4 property's Data Stream settings. Leave empty to keep analytics fully
// disabled (no script is ever injected, regardless of cookie consent).
export const GA_MEASUREMENT_ID = "";

// The cookie banner and the Settings modal's cookie/analytics section stay
// hidden until a real measurement ID is set above — no separate flag to
// remember to flip back on.
export const ANALYTICS_ENABLED = GA_MEASUREMENT_ID !== "";
