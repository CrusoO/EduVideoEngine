import { createHash } from "node:crypto";

/**
 * The port of a harness server, derived from the folder it is started in (`where`, normally the package folder). Two copies of the repository, or a copy that was
 * moved, never share a port, so a server left running by another folder cannot answer for this one. Playwright is also told never to reuse a server, so a
 * leftover server on this folder's own port is an error, not a silent stand-in. The player specs additionally check the bundle hash the page serves.
 */
export function harnessPort(name: string, where: string): number {
  const digest = createHash("sha256").update(`${where.replace(/\\/g, "/").toLowerCase()}|${name}`).digest();
  return 20000 + (digest.readUInt16BE(0) % 10000); // 20000 to 29999: clear of the well-known service ports
}
