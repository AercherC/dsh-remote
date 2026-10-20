import type { IncomingMessage, Server } from 'node:http';
import type { Authenticator } from './auth.js';
import type { GatewayConfig } from './config.js';
import type { GatewayLogger } from './logger.js';
import type { PairingRoutes } from './pairing-routes.js';
import type { PublicOriginProvider } from './public-origin.js';
export interface GatewayDependencies {
    readonly authenticator: Authenticator;
    readonly logger: GatewayLogger;
    /**
     * Runtime public-origin provider. Defaults to a static provider over
     * `config.publicOrigin` (V1 behavior). Quick Mode passes a controller that
     * starts CLOSED (undefined → every external request gets 503) until the
     * Quick Tunnel reports a validated URL.
     */
    readonly publicOriginProvider?: PublicOriginProvider;
    /**
     * Pairing surface (pairing auth mode). Requests are checked against the
     * request policy first, then the pairing routes (GET /pair, POST
     * /pair/claim) may handle them before authentication is attempted.
     * `pageFor` returns pairing HTML for unauthenticated HTML navigations so
     * browsers get a friendly pairing hint while API/WS traffic keeps a plain
     * 401.
     */
    readonly pairing?: {
        readonly routes: PairingRoutes;
        readonly pageFor: (request: IncomingMessage) => string | undefined;
    };
}
export interface RunningGateway {
    readonly server: Server;
    readonly healthServer: Server;
    /** The actual gateway listen port (resolves config.port 0 → OS-assigned). */
    readonly port: number;
    /** The actual health listen port (resolves config.healthPort 0 → OS-assigned). */
    readonly healthPort: number;
    close(): Promise<void>;
}
/** Start the authenticated transparent proxy and its separate loopback liveness endpoint. */
export declare function startGateway(config: GatewayConfig, dependencies: GatewayDependencies): Promise<RunningGateway>;
