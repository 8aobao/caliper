import { useEffect } from 'react';
import { mount } from './core.js';
import type { CaliperOptions } from './core.js';

export type CaliperProps = CaliperOptions;

/**
 * Caliper toolbar. Render it once near the root of your app, in development only.
 *
 * Without `endpoint` it works locally: inspect, tune, save previews, copy prompts.
 * With `endpoint` (a running `npx caliper-mcp server`, default http://localhost:4848)
 * it can also send changes straight to your coding agent.
 */
export function Caliper({ endpoint }: CaliperProps) {
  useEffect(() => mount({ endpoint }), [endpoint]);
  return null;
}

export { mount };
export type { CaliperOptions };
