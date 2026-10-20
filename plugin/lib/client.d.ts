/**
 * Browser half of the plugin (bundled as lib/client.js and loaded by the DSH
 * host directly). Type surface is the cordis browser plugin contract.
 */
export declare const inject: readonly string[]
export declare function apply(ctx: import('@deepseek-ai/dsh-client-runtime/client').ClientContext): void
