/**
 * Deterministic extraction of the darwin cloudflared `.tgz` into the managed
 * binary.
 *
 * The pinned supply-chain trust anchor (exact release tag + SHA-256 + byte
 * size) belongs to the CONTAINER archive, not the extracted executable — the
 * extracted `cloudflared` is a different byte size and hash (it is the
 * uncompressed payload). Verification is therefore two-stage: the raw `.tgz`
 * is verified (size + SHA-256) BEFORE extraction; this module only extracts,
 * and the runnable `--version` gate is applied separately by the verifier in
 * quick-tunnel.ts.
 *
 * The archive is treated as fully untrusted even though it just passed a hash
 * check: only a single regular file named exactly `cloudflared` is accepted.
 * Traversal (`../`), absolute paths, symlinks, directory entries, pax/GNU
 * long-name headers and any archive with zero or multiple entries are
 * rejected with `binary-rejected`. The extracted payload is written with the
 * executable bit (0755) — the archive's own claimed mode is never trusted.
 */
/** The single executable a valid darwin cloudflared archive must contain. */
export declare const ARCHIVED_BINARY_NAME = "cloudflared";
/**
 * Extract the single `cloudflared` executable from a verified `.tgz` into
 * `destPath`, atomically (temp + rename) and with the executable bit set.
 *
 * @throws {TunnelStartError} with `binary-rejected` on any untrusted structure.
 */
export declare function extractCloudflaredBinary(tgzPath: string, destPath: string): Promise<void>;
