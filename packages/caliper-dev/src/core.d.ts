export interface CaliperOptions {
  /** URL of a running Caliper server (`npx caliper-mcp server`), e.g. "http://localhost:4848". Omit for local-only mode. */
  endpoint?: string;
}
/** Mounts the toolbar into the page. Returns a function that removes it again. */
export function mount(options?: CaliperOptions): () => void;
