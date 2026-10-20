/**
 * R06C4 — persisted download network/source settings (UI-owned state).
 *
 * The default user needs NO configuration: the store starts from the plugin
 * config defaults (downloadNetwork/downloadSource/customProxyUrl from
 * cordis.patch.yml) and the UI writes are persisted here so a setting change
 * applies to the NEXT download without a restart. The file holds only
 * non-secret values: custom proxy URLs with credentials are REJECTED at
 * input, so nothing credential-bearing is ever written to disk.
 */
import type { DownloadNetworkMode, DownloadSourceMode } from '../vendor/dsh-remote-web-gateway/dist/proxy-resolver.js';
export interface DownloadSettings {
    readonly network: DownloadNetworkMode;
    readonly source: DownloadSourceMode;
    /** Custom proxy URL (http/https, NO credentials). Optional. */
    readonly customProxyUrl?: string;
}
export interface NetworkConfigStore {
    get(): Promise<DownloadSettings>;
    set(settings: DownloadSettings): Promise<void>;
}
export declare function createNetworkConfigStore(options: {
    readonly file: string;
    readonly defaults: DownloadSettings;
}): NetworkConfigStore;
