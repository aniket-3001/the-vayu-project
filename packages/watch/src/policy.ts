import { rules, type Policy } from '@vayu/contracts';

const POLICIES: Readonly<Record<string, Policy>> = {
  [rules.policySchoolGrap.id]: rules.policySchoolGrap,
};

/** Looks up a loop policy by id. Throws if the id is unknown (rule: bad policy input fails loudly). */
export function loadPolicy(id: string): Policy {
  const policy = POLICIES[id];
  if (!policy) {
    throw new Error(`unknown policy: ${id}`);
  }
  return policy;
}
