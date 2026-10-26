import net from 'node:net';
import tls from 'node:tls';

/** deny outbound network before the cli module graph loads. */
const denied = () => { throw new Error('network unavailable'); };
globalThis.fetch = denied as unknown as typeof fetch;
net.Socket.prototype.connect = denied as never;
tls.connect = denied as never;
