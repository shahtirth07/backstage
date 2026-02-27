/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { authServiceFactory } from '@backstage/backend-defaults/auth';
import { httpAuthServiceFactory } from '@backstage/backend-defaults/httpAuth';
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import * as http from 'node:http';
import * as net from 'node:net';

function createMockUpstream(
  handlers: Record<string, { status: number; body: Record<string, unknown> }>,
): Promise<{ server: http.Server; url: string }> {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const path = req.url ?? '/';
      const handler = handlers[path] ??
        handlers['*'] ?? {
          status: 200,
          body: { ok: true },
        };
      res.writeHead(handler.status, {
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify(handler.body));
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

describe('proxy integration', () => {
  it('forwards requests to two different proxy targets and propagates responses', async () => {
    const upstreamA = await createMockUpstream({
      '/': { status: 200, body: { source: 'a', ok: true } },
    });
    const upstreamB = await createMockUpstream({
      '/': { status: 200, body: { source: 'b', ok: true } },
    });

    const config = {
      backend: {
        baseUrl: 'http://localhost:0',
        listen: { port: 0 },
      },
      proxy: {
        endpoints: {
          '/route-a': {
            target: upstreamA.url,
            credentials: 'dangerously-allow-unauthenticated',
          },
          '/route-b': {
            target: upstreamB.url,
            credentials: 'dangerously-allow-unauthenticated',
          },
        },
      },
    };

    const backend = await startTestBackend({
      features: [
        import('..'),
        mockServices.rootConfig.factory({ data: config }),
        authServiceFactory,
        httpAuthServiceFactory,
      ],
    });

    try {
      const baseUrl = `http://localhost:${backend.server.port()}`;

      const resA = await fetch(`${baseUrl}/api/proxy/route-a`);
      expect(resA.status).toBe(200);
      const bodyA = await resA.json();
      expect(bodyA).toEqual({ source: 'a', ok: true });

      const resB = await fetch(`${baseUrl}/api/proxy/route-b`);
      expect(resB.status).toBe(200);
      const bodyB = await resB.json();
      expect(bodyB).toEqual({ source: 'b', ok: true });
    } finally {
      await new Promise<void>(resolve =>
        upstreamA.server.close(() => resolve()),
      );
      await new Promise<void>(resolve =>
        upstreamB.server.close(() => resolve()),
      );
      await backend.stop();
    }
  });

  it('returns 404 for unconfigured proxy route', async () => {
    const upstream = await createMockUpstream({
      '/': { status: 200, body: { ok: true } },
    });

    const config = {
      backend: {
        baseUrl: 'http://localhost:0',
        listen: { port: 0 },
        auth: {
          externalAccess: [
            {
              type: 'static',
              options: { token: 'test-token', subject: 'test-subject' },
            },
          ],
        },
      },
      proxy: {
        endpoints: {
          '/only-route': {
            target: upstream.url,
            credentials: 'dangerously-allow-unauthenticated',
          },
        },
      },
    };

    const backend = await startTestBackend({
      features: [
        import('..'),
        mockServices.rootConfig.factory({ data: config }),
        authServiceFactory,
        httpAuthServiceFactory,
      ],
    });

    try {
      const baseUrl = `http://localhost:${backend.server.port()}`;
      const res = await fetch(`${baseUrl}/api/proxy/nonexistent-route`, {
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(res.status).toBe(404);
    } finally {
      await new Promise<void>(resolve =>
        upstream.server.close(() => resolve()),
      );
      await backend.stop();
    }
  });

  it('propagates upstream 404 and 500 errors', async () => {
    const upstream = await createMockUpstream({
      '/': { status: 200, body: { ok: true } },
      '/not-found': { status: 404, body: { error: 'Not found' } },
      '/error': { status: 500, body: { error: 'Internal error' } },
    });

    const config = {
      backend: {
        baseUrl: 'http://localhost:0',
        listen: { port: 0 },
      },
      proxy: {
        endpoints: {
          '/upstream': {
            target: upstream.url,
            credentials: 'dangerously-allow-unauthenticated',
          },
        },
      },
    };

    const backend = await startTestBackend({
      features: [
        import('..'),
        mockServices.rootConfig.factory({ data: config }),
        authServiceFactory,
        httpAuthServiceFactory,
      ],
    });

    try {
      const baseUrl = `http://localhost:${backend.server.port()}`;

      const res404 = await fetch(`${baseUrl}/api/proxy/upstream/not-found`);
      expect(res404.status).toBe(404);

      const res500 = await fetch(`${baseUrl}/api/proxy/upstream/error`);
      expect(res500.status).toBe(500);
    } finally {
      await new Promise<void>(resolve =>
        upstream.server.close(() => resolve()),
      );
      await backend.stop();
    }
  });
});
