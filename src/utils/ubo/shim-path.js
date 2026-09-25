export function dirname(p) { return p.replace(/[\\/][^\\/]*$/, "") || "."; }
export function resolve(_a, ...rest) { return [_a, ...rest].filter(Boolean).join("/"); }
export function join(...parts) { return parts.filter(Boolean).join("/"); }
export const sep = "/";