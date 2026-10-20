import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PairingService } from './pairing.js';
import type { LongPairingStore } from './pairing-long.js';
import type { DeviceSessionStore } from './device-session.js';
import type { GatewayLogger } from './logger.js';
/**
 * Gateway-owned pairing surface.
 *
 *   GET  /pair        minimal safe page shown to unauthenticated browsers
 *   POST /pair/claim  redeem a pairing credential (one-time ticket secret or
 *                     manual code, OR — when a long-term code is configured —
 *                     the durable long code/secret) and mint a long-lived
 *                     device session cookie
 *
 * Both routes run AFTER the gateway's Host/Origin/sec-fetch-site policy, so
 * a cross-site claim is already impossible. The claim endpoint deliberately
 * reads credentials only from the JSON body: query-string claims are never
 * accepted (and the future QR deep link will use the URL fragment
 * `https://<host>/pair#<secret>`, which browsers never send to the server).
 *
 * Failure responses are intentionally uniform: 403 for any unknown/expired/
 * mismatched credential (nothing reveals whether a ticket exists or how close
 * a code was), 429 for rate limiting (no Retry-After detail), and 400/405/415
 * for request-shape errors only. Logs carry sanitized event names only —
 * never secrets, codes, cookies, or token hashes.
 */
/**
 * Optional GitHub Device-Flow login on the /pair page (R05).
 *
 * The gateway stays transport-only: this interface is provided by the
 * plugin's GitHubAuthService, and the pairing surface merely renders the
 * flow state and mints OUR Device Session (never a GitHub token) when the
 * flow reports `ready`. Everything here is bounded server-side (concurrent
 * flows, start rate, TTL) by the implementing service.
 */
export interface PairingGithubFlowStart {
    readonly flowId: string;
    readonly verificationUri: string;
    readonly userCode: string;
    readonly expiresAt: number;
    readonly intervalMs: number;
}
export type PairingGithubPollResult = {
    readonly status: 'pending';
    readonly intervalMs: number;
} | {
    readonly status: 'slow_down';
    readonly intervalMs: number;
} | {
    readonly status: 'ready';
    readonly login?: string;
} | {
    readonly status: 'denied' | 'expired' | 'wrong-user' | 'not-found';
};
export interface PairingGithubRoutes {
    /** Whether the host has bound an allowed GitHub identity AND configured an OAuth App. */
    readonly enabled: boolean;
    start(): Promise<PairingGithubFlowStart | {
        readonly error: 'rate-limited' | 'unavailable';
    }>;
    poll(flowId: string): Promise<PairingGithubPollResult | {
        readonly error: 'bad-request';
    }>;
    cancel(flowId: string): Promise<boolean>;
}
export interface PairingRouteDependencies {
    readonly pairing: PairingService;
    readonly sessions: DeviceSessionStore;
    /** Session TTL in milliseconds; used to size the cookie Max-Age. */
    readonly sessionTtlMs: number;
    readonly logger: GatewayLogger;
    readonly now?: () => Date;
    /** Optional GitHub Device-Flow login; absent = pairing-code only (kept from D1; root cleanup is a separate task). */
    readonly github?: PairingGithubRoutes;
    /**
     * Optional durable long-term pairing credential (D2). When present, a claim
     * that misses every one-time ticket falls back to the long code (manual
     * code or QR secret), which never expires until the user rotates it. The
     * fallback runs AFTER the shared claim budget, so it can never bypass rate
     * limiting.
     */
    readonly long?: LongPairingStore;
    /**
     * Optional resolver for a browser-authenticated root URL. After a successful
     * claim the phone is bounced to this URL instead of bare `/`: DSH's web
     * server requires its OWN browser-session cookie (minted by the `?token=`
     * launch URL), which the gateway's device-session cookie cannot satisfy. When
     * the host cannot supply one (e.g. tests) the page falls back to `/`.
     */
    readonly resolveAuthRoot?: () => string | undefined;
}
export interface PairingRoutes {
    /** Returns true when the request was handled by the pairing surface. */
    handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
    /** Pairing HTML for an unauthenticated HTML navigation, or undefined for API/WS traffic. */
    pageFor(request: IncomingMessage): string | undefined;
}
export declare function createPairingRoutes(dependencies: PairingRouteDependencies): PairingRoutes;
