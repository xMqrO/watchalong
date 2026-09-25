export function createRequire(_url) {
  return function requireStub(id) { throw new Error("require n/a: " + id); };
}