/**
 * Loopback-only management RPC for the plugin.
 *
 * The endpoints live on a DEDICATED logical channel (`/dsh-remote`)
 * registered through `ctx.connection.rpc.handle(..., { authority:
 * 'loopback' })` — the official DSH loopback-authority mechanism
 * (packages/client/connection — the fence refuses any non-loopback Host or
 * cross-site marker). The shared `/api` channel is deliberately NOT used:
 * its interceptor seat is a single-owner slot already claimed by a built-in
 * plugin.
 *
 * Defense in depth: the gateway ALSO denies the whole `/dsh-remote` prefix
 * from the public entry, so even a valid device session through the Quick
 * Tunnel can never reach these endpoints.
 *
 * Error encoding: the RpcError code union is closed, so operational failures
 * ride the `internal` code with the stable plugin error code as the message;
 * the client maps that code to user copy via the same table the status
 * surface uses.
 */
/** The dedicated loopback-only RPC channel. */
export const REMOTE_RPC_CHANNEL = '/dsh-remote';
function error(errorCode) {
    return { ok: false, error: { code: 'internal', message: errorCode, details: {} } };
}
function ok(value) {
    return { ok: true, value };
}
function badRequest() {
    return { ok: false, error: { code: 'bad-request', message: 'bad-request', details: { issues: [] } } };
}
/** Dispatch one endpoint against the runtime, returning the wire RpcResult. */
export async function dispatch(runtime, endpoint, payload) {
    switch (endpoint) {
        case 'status': {
            return ok(runtime.status());
        }
        case 'tunnelStart': {
            const result = await runtime.tunnelStart();
            return result.ok ? ok({ url: result.url }) : error(result.errorCode);
        }
        case 'tunnelStop': {
            const result = await runtime.tunnelStop();
            return result.ok ? ok({}) : error(result.errorCode);
        }
        case 'pairingStatus': {
            return ok(runtime.pairingStatus());
        }
        case 'pairingRotate': {
            const ticket = runtime.pairingRotate();
            return typeof ticket === 'string' ? error(ticket) : ok(ticket);
        }
        case 'pairingLongStatus': {
            return ok(runtime.pairingLongStatus());
        }
        case 'pairingLongRotate': {
            // Optional custom code; anything non-string is treated as absent and a
            // fresh random 9-char code is minted. Shape is validated host-side.
            const value = payload;
            const customCode = value !== null && typeof value === 'object'
                && typeof value.code === 'string'
                ? value.code
                : undefined;
            const credential = await runtime.pairingLongRotate(customCode);
            return typeof credential === 'string' ? error(credential) : ok(credential);
        }
        case 'deviceList': {
            return ok({ devices: runtime.deviceList() });
        }
        case 'deviceRevoke': {
            const value = payload;
            const deviceId = value !== null && typeof value === 'object' && typeof value.deviceId === 'string'
                ? value.deviceId
                : undefined;
            if (deviceId === undefined)
                return badRequest();
            const result = await runtime.deviceRevoke(deviceId);
            return result.ok ? ok({ revoked: result.revoked }) : error(result.errorCode);
        }
        case 'deviceRevokeAll': {
            const result = await runtime.deviceRevokeAll();
            return result.ok ? ok({}) : error(result.errorCode);
        }
        case 'updateCheck': {
            const value = payload;
            const force = value !== null && typeof value === 'object' && value.force === true;
            return ok(await runtime.updateCheck(force));
        }
        case 'updateApply': {
            return ok(await runtime.updateApply());
        }
        case 'networkConfigGet': {
            return ok(await runtime.networkConfigGet());
        }
        case 'networkConfigSet': {
            const value = payload;
            const settings = value !== null && typeof value === 'object' ? value.settings : undefined;
            if (settings === null || typeof settings !== 'object' || Array.isArray(settings))
                return badRequest();
            const result = await runtime.networkConfigSet(settings);
            return result.ok ? ok({}) : error(result.errorCode);
        }
        default:
            return badRequest();
    }
}
/** Build the connection RPC handler over a (possibly not-yet-started) runtime. */
export function createRpcHandler(runtimeProvider) {
    return async (endpoint, payload) => {
        const runtime = runtimeProvider();
        if (runtime === undefined)
            return error('startup-failed');
        try {
            return await dispatch(runtime, endpoint, payload);
        }
        catch {
            return error('internal');
        }
    };
}
