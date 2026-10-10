import '@testing-library/jest-dom/vitest';

// jsdom has no layout, so it does not implement scrolling into view; the app calls it for the chat.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = (): void => undefined;
}
