/**
 * Links to the privacy policy and the terms, which the stores ask for inside the app. The pages are plain files made
 * from `docs/PRIVACY-POLICY.md` and `docs/TERMS.md` at build time (`scripts/build-legal.mjs`) and shipped with the site.
 */
export function LegalLinks(): React.JSX.Element {
  return (
    <p className="feedback-link legal-links">
      <a href="/privacy.html">Privacy policy</a> · <a href="/terms.html">Terms of use</a>
    </p>
  );
}
