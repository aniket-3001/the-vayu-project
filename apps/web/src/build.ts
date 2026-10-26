import { APP_VERSION } from './analytics/device';

/** What build this is, in a few words, for the Account page: the version, the commit it came from and the day it was made. */
export function buildLabel(): string {
  const build = typeof __BUILD__ === 'undefined' ? undefined : __BUILD__;
  return build === undefined
    ? `Vayu ${APP_VERSION}`
    : `Vayu ${APP_VERSION} · build ${build.commit} · ${build.date}`;
}
