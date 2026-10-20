/**
 * Minimal user-agent description for the device list. Pure string parsing,
 * no dependencies; unknown agents degrade to the raw UA truncated.
 */
export interface UaDescription {
    /** e.g. "iPhone / Safari". */
    readonly label: string;
    /** e.g. "iOS 17.4". */
    readonly os?: string;
}
/** Derive a short human label from a browser User-Agent string. */
export declare function describeUserAgent(ua: string): UaDescription;
