import { API_URL } from '../config';

/**
 * Links to the privacy policy and the terms, which the stores ask for inside the app. The pages are plain files made
 * from `docs/PRIVACY-POLICY.md` and `docs/TERMS.md` at build time (`scripts/build-legal.mjs`) and shipped with the site.
 * On the website `API_URL` is empty, so the links are on the same address; the phone apps point at the site's address,
 * because their own bundle is built without that step.
 */
export function LegalLinks(): React.JSX.Element {
  return (
    <p className="feedback-link legal-links">
      <a href={`${API_URL}/privacy.html`}>Privacy policy</a> ·{' '}
      <a href={`${API_URL}/terms.html`}>Terms of use</a>
    </p>
  );
}
