/**
 * Tiny dev-only namespaced logger. Lives inside the package because the
 * worker entry can't reach back into an app (that would invert the
 * dependency graph). The bridge ships the active pattern to the worker via
 * postMessage so a single `enableLoggers("bridge:*")` from devtools lights
 * up both sides.
 *
 * Pattern semantics match the app logger:
 *   - comma-separated globs, `*` wildcard, `-` exclusion
 *   - empty string disables everything
 *   - prod (`import.meta.env.DEV === false`) folds the whole module to noops
 *
 * What's deliberately NOT here: localStorage/URL resolution, the bus
 * publish, color tags, group/table/profile. We only need namespace + time.
 */

// Intentionally no `DEV` gate. The empty pattern already keeps every
// logger silent (cost: one set/regexp lookup per call, returning false).
// Production prod-stripping is handled at the consumer's bundler step;
// this module stays callable in any context, which avoids the worker /
// import-context puzzles around when `import.meta.env.DEV` is statically
// substituted vs. read at runtime.

export interface Logger {
  (...args: unknown[]): void;
  warn(...args: unknown[]): void;
  /** Start a span; returned function logs `${label}: ${ms}ms` when called. */
  time(label: string): () => void;
  readonly enabled: boolean;
  readonly namespace: string;
}

interface LiveLogger extends Logger {
  _enabled: boolean;
}

interface CompiledPattern {
  raw: string;
  includes: RegExp[];
  excludes: RegExp[];
}

const live: Set<LiveLogger> = new Set();
let pattern: CompiledPattern = compile("");
const lastAt: Map<string, number> = new Map();

function compile(raw: string): CompiledPattern {
  const includes: RegExp[] = [];
  const excludes: RegExp[] = [];
  for (const piece of raw.split(/[,\s]+/)) {
    if (!piece) continue;
    const exclude = piece.startsWith("-");
    const body = exclude ? piece.slice(1) : piece;
    const re = new RegExp(
      "^" + body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    );
    (exclude ? excludes : includes).push(re);
  }
  return { raw, includes, excludes };
}

function isOn(ns: string, p: CompiledPattern): boolean {
  if (p.includes.length === 0) return false;
  if (p.excludes.some((re) => re.test(ns))) return false;
  return p.includes.some((re) => re.test(ns));
}

function refreshAll(): void {
  for (const lg of live) lg._enabled = isOn(lg.namespace, pattern);
}

/** Update the active pattern. Existing logger refs flip enabled-state in place. */
export function setLoggerPattern(raw: string): void {
  pattern = compile(raw);
  refreshAll();
}

export function getLoggerPattern(): string {
  return pattern.raw;
}

export function createLogger(ns: string): Logger {
  const elapsed = (): number => {
    const now = Date.now();
    const prev = lastAt.get(ns);
    lastAt.set(ns, now);
    return prev === undefined ? 0 : now - prev;
  };
  const fn = ((...args: unknown[]): void => {
    if (!logger._enabled) return;
    const ms = elapsed();
    // Identical look-and-feel to the app logger: bold ns + gray +ms suffix.
    console.log(
      `%c${ns}%c`,
      "color: #6b9fed; font-weight: bold",
      "color: inherit",
      ...args,
      `%c+${ms}ms`,
      "color: gray",
    );
  }) as LiveLogger;
  fn.warn = (...args: unknown[]): void => {
    if (!logger._enabled) return;
    const ms = elapsed();
    console.warn(
      `%c${ns}%c`,
      "color: #d97706; font-weight: bold",
      "color: inherit",
      ...args,
      `%c+${ms}ms`,
      "color: gray",
    );
  };
  fn.time = (label: string): (() => void) => {
    if (!logger._enabled) return () => undefined;
    const start = performance.now();
    return () => {
      if (!logger._enabled) return;
      const dur = performance.now() - start;
      logger(`${label}:`, `${dur.toFixed(1)}ms`);
    };
  };
  Object.defineProperty(fn, "enabled", { get: () => fn._enabled });
  Object.defineProperty(fn, "namespace", { value: ns });
  fn._enabled = isOn(ns, pattern);
  const logger = fn;
  live.add(logger);
  return logger;
}
