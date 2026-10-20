import type { IncomingMessage } from 'node:http';
import type { PublicOriginProvider } from './public-origin.js';
export declare class RequestPolicyError extends Error {
    constructor();
}
/** Thrown when the gateway is CLOSED (no active public origin yet). */
export declare class PublicOriginUnavailableError extends Error {
    constructor();
}
/**
 * Enforce the public same-origin browser policy before an ordinary HTTP
 * proxy request. When the provider reports no active origin (CLOSED), the
 * request is rejected with {@link PublicOriginUnavailableError} — Host / Origin
 * validation is never skipped.
 */
export declare function enforceHttpRequestPolicy(request: IncomingMessage, publicOrigin: PublicOriginProvider): void;
/** Enforce a same-origin browser WebSocket handshake before accepting the upgrade. */
export declare function enforceWebSocketRequestPolicy(request: IncomingMessage, publicOrigin: PublicOriginProvider): void;
