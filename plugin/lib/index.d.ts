/**
 * dsh-remote-phone — host half.
 *
 * Wires DSH services into the gateway runtime:
 *   - resolves the harness home and the plugin's own state/cache dirs
 *   - starts the loopback gateway targeting THIS DSH web server
 *   - registers the loopback-only management RPC on a dedicated channel
 *     (`authority: 'loopback'`, the official DSH mechanism)
 *
 * Plugin load NEVER opens the public network: the tunnel starts OFF and only
 * a user gesture (the settings "开启远程访问" button) starts it.
 *
 * Disposal order (guaranteed): tunnel stop → origin CLOSED → gateway close →
 * unused pairing tickets cleared. No cloudflared orphan survives disposal.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Stable cordis plugin name. */
export declare const name = "dsh-remote-phone";
/** Services required before this plugin mounts. */
export declare const inject: string[];
/**
 * Host plugin body.
 * @param ctx - host cordis context (connection + webServer services).
 * @param config - the loader patch config; validated here, fail-closed.
 */
export declare function apply(ctx: Context, config?: unknown): void;
