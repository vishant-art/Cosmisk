/**
 * Network bootstrap — MUST run before any pg Pool/Client opens a connection.
 *
 * Root cause it fixes: Node's "Happy Eyeballs" connector (node:net,
 * `autoSelectFamily` — ON by default since Node 20) races IPv4 and IPv6 in
 * parallel with a 250ms per-attempt timeout. Neon's IPv4 TLS handshake takes
 * ~287ms — longer than 250ms — so Node abandons the working IPv4 attempt and
 * races in IPv6, which on hosts with no routable IPv6 (e.g. WSL2) fails with
 * `ENETUNREACH`. The connection then flakes with an intermittent
 * `AggregateError [ETIMEDOUT]` from `internalConnectMultiple`.
 *
 * Two settings together fix it, cross-platform and TLS-safe:
 *  1. `setDefaultResultOrder('ipv4first')` — try the reachable IPv4 address first.
 *  2. `setDefaultAutoSelectFamily(false)` — disable the family race so Node
 *     connects sequentially and waits out the full IPv4 handshake instead of
 *     timing out the attempt at 250ms.
 * Neither changes TLS/cert behavior; SSL verification stays governed by the
 * connection string (`sslmode=require`). IPv6 still works on healthy hosts
 * (tried after IPv4). The `typeof` guard makes (2) a no-op on Node <19.4.
 *
 * Importing this module is a side effect; keep it as the first import in every
 * database entry point (app, migrations, scripts).
 */
import dns from 'node:dns';
import net from 'node:net';

dns.setDefaultResultOrder('ipv4first');

if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}
