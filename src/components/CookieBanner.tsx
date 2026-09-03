import type { CookieConsent } from "../types";

interface CookieBannerProps {
  onChoice: (choice: CookieConsent) => void;
}

export function CookieBanner({ onChoice }: CookieBannerProps) {
  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent">
      <p>
        This site uses Google Analytics to count visits and see which features get used — nothing
        else. No ads, no cross-site tracking, no selling data. Analytics cookies are only set if
        you accept.
      </p>
      <div className="cookie-banner-actions">
        <button className="cookie-decline" onClick={() => onChoice("declined")}>
          Decline
        </button>
        <button className="cookie-accept" onClick={() => onChoice("accepted")}>
          Accept
        </button>
      </div>
    </div>
  );
}
