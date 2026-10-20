/**
 * The plugin's host runtime: gateway + device sessions + pairing + public
 * origin + Quick Tunnel, owned as one lifecycle.
 *
 * Deliberately independent of cordis: `apply` in index.ts is a thin adapter
 * that wires DSH services (webServer port, connection RPC, logger) into this
 * factory, and the tests drive the factory directly with fakes.
 *
 * Security invariants (carried from R02/R03):
 *   - the gateway and its health port bind LOOPBACK only
 *   - the public origin starts CLOSED and only opens with a validated tunnel
 *     URL; tunnel stop/crash closes it first
 *   - the tunnel targets the loopback GATEWAY, never DSH directly
 *   - every management RPC endpoint sits behind the gateway's denied public
 *     prefix, so the public entry can never reach it
 *   - the device-session state file fails closed on corruption
 *   - every unused pairing ticket dies when the tunnel stops or the URL
 *     changes
 *   - plugin load never auto-opens the network: the tunnel starts OFF and
 *     only the user's explicit "enable" gesture starts it
 */
import type { GatewayLogger } from '../vendor/dsh-remote-web-gateway/dist/logger.js';
import { type QuickTunnelService } from '../vendor/dsh-remote-web-gateway/dist/quick-tunnel.js';
import { type DirHardener } from './acl.js';
import { type PluginConfig } from './config.js';
import { type UpdateService, type UpdateStatusView } from './updater.js';
import type { CommandResult, DeviceRevokeAllResult, DeviceRevokeResult, DeviceSummaryView, DownloadSettingsView, PairingIssueView, PairingLongIssueView, PairingLongStatusView, PairingStatusView, RemoteErrorCode, RemoteStatusView } from './wire.js';
export type { RemoteErrorCode, RemoteStatusView, PairingIssueView, PairingLongIssueView, PairingLongStatusView, PairingStatusView, DeviceSummaryView, CommandResult };
export interface RemoteRuntimeOptions {
    /** Resolved harness home (the plugin never derives it from the checkout). */
    readonly dshHome: string;
    /** DSH web server URL, always http://127.0.0.1:<port>. */
    readonly upstream: URL;
    readonly config: PluginConfig;
    readonly logger: GatewayLogger;
    /** Installed plugin package root (reads package.json for the version). */
    readonly pluginRootDir: string;
    /**
     * R07: build DSH's browser-authenticated root URL for an origin. After a
     * successful pair the phone is bounced to this instead of bare `/`, because
     * DSH's web server requires its own session cookie (minted by the `?token=`
     * launch URL). Injected by the cordis adapter over `ctx.connection.authenticatedUrl`.
     */
    readonly authRootUrl?: (origin: string) => string;
    /** Test injection for the Windows ACL hardening step. */
    readonly hardenDir?: DirHardener;
    /** Test injection: replace the QuickTunnelService instead of creating one. */
    readonly tunnelOverride?: QuickTunnelService;
    /** Test injection: replace the UpdateService. */
    readonly updater?: UpdateService;
    readonly now?: () => number;
}
export interface RemoteRuntime {
    /** The actual loopback gateway port (OS-assigned when configured 0). Local diagnostics only. */
    readonly gatewayPort: number;
    status(): RemoteStatusView;
    tunnelStart(): Promise<CommandResult>;
    tunnelStop(): Promise<CommandResult>;
    /**
     * READ-ONLY pairing ticket state (R06C4B). Never creates or invalidates a
     * ticket — safe for status polling, settings remount and browser reload.
     */
    pairingStatus(): PairingStatusView;
    /** Explicit mutation: generate a fresh one-time ticket (user action only). */
    pairingRotate(): PairingIssueView | RemoteErrorCode;
    /**
     * D2: READ-ONLY durable long-term pairing code state. Never creates or
     * rotates — safe for the settings poll. `active` carries the plaintext only
     * when THIS process generated it; `persisted` means digests were reloaded
     * after a restart (the code still authenticates but cannot be shown again).
     */
    pairingLongStatus(): PairingLongStatusView;
    /**
     * D2: Explicit mutation (user action only): mint a fresh durable long-term
     * pairing code and atomically invalidate the previous one. With no
     * argument a 9-char random code is issued; `customCode` (already a trimmed
     * string) may be any 6–12 char code over the pairing alphabet — validated
     * here (bad-request) before it ever reaches the store. Not gated on the
     * tunnel being ready: the code is origin-independent and claimable whenever
     * remote access is enabled later. Durable: resolves only after persist.
     */
    pairingLongRotate(customCode?: string): Promise<PairingLongIssueView | RemoteErrorCode>;
    deviceList(): ReadonlyArray<DeviceSummaryView>;
    deviceRevoke(deviceId: string): Promise<DeviceRevokeResult>;
    deviceRevokeAll(): Promise<DeviceRevokeAllResult>;
    updateCheck(force: boolean): Promise<UpdateStatusView>;
    updateApply(): Promise<UpdateStatusView>;
    /** R06C4: read/write the UI-owned download network/source settings. */
    networkConfigGet(): Promise<DownloadSettingsView>;
    networkConfigSet(settings: DownloadSettingsView): Promise<CommandResult>;
    dispose(): Promise<void>;
}
export declare function createRemoteRuntime(options: RemoteRuntimeOptions): Promise<RemoteRuntime>;
