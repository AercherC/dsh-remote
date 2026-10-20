/** Emit only allowlisted operational fields; never accept arbitrary error or request objects. */
export const jsonLogger = {
    info(fields) {
        process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'info', ...fields })}\n`);
    },
    warn(fields) {
        process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'warn', ...fields })}\n`);
    },
};
export function safePath(rawUrl) {
    try {
        return new URL(rawUrl ?? '/', 'http://gateway.invalid').pathname;
    }
    catch {
        return '<invalid>';
    }
}