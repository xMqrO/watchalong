export function fileURLToPath(u) { return String(u).replace(/^file:\/\//, ""); }
export function pathToFileURL(p) { return { href: "file://" + p, toString: () => "file://" + p }; }
export function domainToASCII(d) { return String(d || "").toLowerCase(); }