import { Mail } from 'lucide-react';
import { buildLabel } from '../build';

/** The mailto address for feedback, with the build in the body so a report says which version it is about. */
export function feedbackHref(email: string, build: string): string {
  const subject = 'Vayu feedback';
  const body = `What happened, or what would help?\n\n\n\n---\nPlease keep this line so we know which version you have:\n${build}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * "Send feedback": opens the person's own mail app with the build already written in. Nothing is sent by the app, and
 * nothing about the person or their places is added. It shows only when the build was given a support address
 * (`VITE_SUPPORT_EMAIL`), so no address is baked in by default.
 */
export function FeedbackLink({
  email = import.meta.env.VITE_SUPPORT_EMAIL,
  build = buildLabel(),
}: {
  readonly email?: string | undefined;
  readonly build?: string;
}): React.JSX.Element | null {
  if (email === undefined || email === '') return null;
  return (
    <p className="feedback-link">
      <a href={feedbackHref(email, build)}>
        <Mail size={16} strokeWidth={2} aria-hidden="true" /> Send feedback
      </a>
    </p>
  );
}
