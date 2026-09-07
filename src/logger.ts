export interface LogFields {
  readonly event: string
  readonly method?: string | undefined
  readonly path?: string
  readonly status?: number
  /** Stable machine-readable error code for operational diagnostics (never raw error objects). */
  readonly code?: string
  /** Short sanitized cause hint for local diagnostics (never tokens/secrets/bodies). */
  readonly cause?: string
}

export interface GatewayLogger {
  info(fields: LogFields): void
  warn(fields: LogFields): void
}

/** Emit only allowlisted operational fields; never accept arbitrary error or request objects. */
export const jsonLogger: GatewayLogger = {
  info(fields) {
    process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'info', ...fields })}\n`)
  },
  warn(fields) {
    process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'warn', ...fields })}\n`)
  },
}

export function safePath(rawUrl: string | undefined): string {
  try {
    return new URL(rawUrl ?? '/', 'http://gateway.invalid').pathname
  } catch {
    return '<invalid>'
  }
}
