export interface LogFields {
    readonly event: string;
    readonly method?: string | undefined;
    readonly path?: string;
    readonly status?: number;
    /** Stable machine-readable error code for operational diagnostics (never raw error objects). */
    readonly code?: string;
    /** Short sanitized cause hint for local diagnostics (never tokens/secrets/bodies). */
    readonly cause?: string;
}
export interface GatewayLogger {
    info(fields: LogFields): void;
    warn(fields: LogFields): void;
}
/** Emit only allowlisted operational fields; never accept arbitrary error or request objects. */
export declare const jsonLogger: GatewayLogger;
export declare function safePath(rawUrl: string | undefined): string;
