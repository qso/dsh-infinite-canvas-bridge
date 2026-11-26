import http from 'node:http';
import https from 'node:https';

// Stock workbenches generate a random clientId inside the page. A dedicated
// loopback origin for each DSH view observes its successful /events handshake,
// so Agent requests can use the native targeted API even on protocol v12.
export async function createLegacyView(baseUrl) {
  const target = new URL(baseUrl);
  const transport = target.protocol === 'https:' ? https : http;
  const tunnels = new Set();
  const clients = new Map();
  let origin;

  function allowed(request) {
    return request.headers.host === new URL(origin).host &&
      (!request.headers.origin || request.headers.origin === origin) &&
      typeof request.url === 'string' && request.url.startsWith('/') && !request.url.startsWith('//');
  }

  function upstream(request) {
    const headers = { ...request.headers, host: target.host };
    if (headers.origin) headers.origin = target.origin;
    delete headers.cookie;
    delete headers.authorization;
    return transport.request({ hostname: target.hostname.replace(/^\[|\]$/g, ''), port: target.port || undefined,
      path: request.url, method: request.method, headers });
  }

  const server = http.createServer((req, res) => {
    if (!allowed(req)) { res.writeHead(403).end(); return; }
    const out = upstream(req);
    out.on('response', incoming => {
      const headers = { ...incoming.headers };
      delete headers['set-cookie'];
      res.writeHead(incoming.statusCode, headers);
      incoming.on('error', () => res.destroy());
      incoming.pipe(res);
    });
    out.on('error', () => { if (res.headersSent) res.destroy(); else res.writeHead(502).end(); });
    res.on('close', () => out.destroy());
    req.pipe(out);
  });
  server.on('upgrade', (req, browser, head) => {
    if (!allowed(req) || req.headers.origin !== origin) { browser.destroy(); return; }
    const route = new URL(req.url, origin);
    const out = upstream(req);
    browser.on('error', () => browser.destroy());
    out.on('error', () => browser.destroy());
    out.on('response', response => { response.resume(); browser.destroy(); });
    out.on('upgrade', (response, backend, rest) => {
      if (browser.destroyed) { backend.destroy(); return; }
      const id = route.pathname === '/events' && route.searchParams.get('clientId');
      if (id) clients.set(browser, id);
      tunnels.add(browser);
      const headers = response.rawHeaders;
      browser.write('HTTP/1.1 101 Switching Protocols\r\n');
      for (let i = 0; i < headers.length; i += 2) browser.write(headers[i] + ': ' + headers[i + 1] + '\r\n');
      browser.write('\r\n');
      if (head.length) backend.write(head);
      if (rest.length) browser.write(rest);
      backend.on('error', () => browser.destroy());
      backend.on('close', () => browser.destroy());
      browser.on('close', () => { clients.delete(browser); tunnels.delete(browser); backend.destroy(); });
      backend.pipe(browser);
      browser.pipe(backend);
    });
    out.end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = 'http://127.0.0.1:' + server.address().port;
  return {
    origin,
    get clientId() { return clients.size === 1 ? clients.values().next().value : null; },
    close() {
      for (const socket of tunnels) socket.destroy();
      server.closeAllConnections();
      return new Promise(resolve => server.close(resolve));
    },
  };
}
