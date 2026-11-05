import { existsSync, readFileSync } from 'node:fs';

/**
 * Deploy options kept in a file that is not committed (`infra/deploy.local.json`), so a plain `cdk deploy` keeps the
 * protections that were switched on (alarm mail, firewall, origin secret, ...) instead of silently dropping any
 * that were left off the command line. `-c name=value` on the command line still wins over the file.
 * Values may be strings; anything else is ignored. A broken file is an error, not a silent default.
 */
export function readLocalOptions(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} must hold a JSON object of option names and text values`);
  }
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value === 'string') out[name] = value;
  }
  return out;
}
