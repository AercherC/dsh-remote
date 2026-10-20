import type { IncomingHttpHeaders } from 'node:http';
import type { DeviceSessionStore } from './device-session.js';
export interface AccessPrincipal {
    readonly subject: string;
}
export interface Authenticator {
    authenticate(headers: IncomingHttpHeaders): Promise<AccessPrincipal>;
}
export interface CloudflareAccessOptions {
    readonly issuer: URL;
    readonly audience: string;
    readonly allowedEmails: ReadonlySet<string>;
}
export interface TrustedRelayOptions {
    readonly token: string;
}
export interface PairingAuthOptions {
    readonly sessions: DeviceSessionStore;
}
export declare const TRUSTED_RELAY_HEADER = "x-dsh-relay-authorization";
export declare class AuthenticationError extends Error {
    constructor();
}
/** Verify Cloudflare Access application assertions with its rotating remote JWKS. */
export declare function createCloudflareAccessAuthenticator(options: CloudflareAccessOptions): Authenticator;
/**
 * Authenticate the private hop from a mutually-authenticated TLS edge proxy.
 *
 * This token is a machine credential carried only over loopback or an encrypted
 * reverse tunnel. End-user identity is established by mTLS at the public edge.
 */
export declare function createTrustedRelayAuthenticator(options: TrustedRelayOptions): Authenticator;
/**
 * Authenticate a paired browser by its device-session cookie.
 *
 * The raw 256-bit token is hashed with SHA-256 and looked up in the device
 * session store; only the hash is ever persisted. The cookie value itself is
 * validated for shape before hashing, and duplicate same-name cookies are
 * rejected so a client cannot smuggle a second candidate value.
 */
export declare function createPairingAuthenticator(options: PairingAuthOptions): Authenticator;
