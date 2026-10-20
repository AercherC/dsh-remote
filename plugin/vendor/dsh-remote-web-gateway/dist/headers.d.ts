import type { IncomingHttpHeaders } from 'node:http';
/** Read a security-sensitive header only when Node parsed exactly one value. */
export declare function singleHeader(headers: IncomingHttpHeaders, name: string): string | undefined;
/** Remove Cloudflare Access cookies while preserving any DSH-owned cookies. */
export declare function sanitizeCookieHeader(value: string | undefined): string | undefined;
/** Headers carrying edge identity or network provenance must not reach DSH. */
export declare const STRIPPED_UPSTREAM_HEADERS: readonly ["authorization", "cf-access-jwt-assertion", "cf-access-client-id", "cf-access-client-secret", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-port", "x-forwarded-proto", "x-real-ip", "x-dsh-relay-authorization"];
