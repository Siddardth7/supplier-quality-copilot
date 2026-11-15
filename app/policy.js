// The active scoring policy and how the header chip shows it (DESIGN-SPEC 4.1).
// Precedence (issue 109, decision 108): an unsaved draft, then a shared link's policy, then the saved active one,
// then Stark Reference v1. main.js holds that state; app/standards.js decodes, stores and edits it.
import { STARK_REFERENCE } from './engine.js';

export function resolvePolicy({ draft = null, shared = null, saved = null } = {}) {
  if (draft) return { policy: draft, kind: 'draft' };
  if (shared) return { policy: shared, kind: 'shared' };
  if (saved) return { policy: saved, kind: 'saved' };
  return { policy: STARK_REFERENCE, kind: 'reference' };
}

// ponytail: the reference name already carries its version ("Stark Reference v1"), so don't print it twice.
export const policyLabel = ({ name, version }) => (String(name).endsWith(` v${version}`) ? name : `${name} v${version}`);

const NOTE = { draft: 'Unsaved changes', shared: 'Shared, not saved' };

/** Cyan only for the untouched reference; any draft (even one forked from the reference), shared or saved policy is amber. */
export function chipView({ policy, kind }) {
  return {
    label: `Policy: ${policyLabel(policy)}`,
    tone: kind === 'reference' && policy.id === STARK_REFERENCE.id ? 'cyan' : 'amber',
    note: NOTE[kind] ?? null,
  };
}
