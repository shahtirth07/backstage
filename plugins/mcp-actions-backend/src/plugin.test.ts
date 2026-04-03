/*
 * Copyright 2025 The Backstage Authors
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
import { mockServices, startTestBackend } from '@backstage/backend-test-utils';
import { mcpPlugin } from './plugin';
import { actionsRegistryServiceRef } from '@backstage/backend-plugin-api/alpha';
import { createBackendPlugin } from '@backstage/backend-plugin-api';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import request from 'supertest';

describe('Mcp Backend', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const mockPluginWithActions = createBackendPlugin({
    pluginId: 'local',
    register({ registerInit }) {
      registerInit({
        deps: { actionsRegistry: actionsRegistryServiceRef },
        async init({ actionsRegistry }) {
          actionsRegistry.register({
            name: 'make-greeting',
            title: 'Make Greeting',
            description: 'Make a greeting',
            schema: {
              input: z => z.object({ name: z.string() }),
              output: z => z.object({ greeting: z.string() }),
            },
            action: async ({ input }) => ({
              output: { greeting: `Hello ${input.name}!` },
            }),
          });
        },
      });
    },
  });

  const getContext = async () => {
    const { server } = await startTestBackend({
      features: [
        mcpPlugin,
        mockPluginWithActions,
        mockServices.rootConfig.factory({
          data: {
            backend: {
              actions: {
                pluginSources: ['local'],
              },
            },
          },
        }),
      ],
    });

    const client = new Client({
      name: 'test client',
      version: '1.0',
    });

    const address = server.address();
    if (typeof address !== 'object' || !('port' in address!)) {
      throw new Error('server broke');
    }

    return {
      client,
      serverAddress: `http://localhost:${address.port}`,
    };
  };

  it('should support streamable spec', async () => {
    const { client, serverAddress } = await getContext();
    const transport = new StreamableHTTPClientTransport(
      new URL(`${serverAddress}/api/mcp-actions/v1`),
    );

    await client.connect(transport);

    const result = await client.request(
      {
        method: 'tools/list',
      },
      ListToolsResultSchema,
    );

    expect(result.tools).toEqual([
      {
        annotations: {
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
          readOnlyHint: false,
          title: 'Make Greeting',
        },
        description: 'Make a greeting',
        inputSchema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          additionalProperties: false,
          properties: {
            name: {
              type: 'string',
            },
          },
          required: ['name'],
          type: 'object',
        },
        name: 'make-greeting',
      },
    ]);
  });

  it('should support sse spec', async () => {
    const { client, serverAddress } = await getContext();
    const transport = new SSEClientTransport(
      new URL(`${serverAddress}/api/mcp-actions/v1/sse`),
    );

    await client.connect(transport);

    const result = await client.request(
      {
        method: 'tools/list',
      },
      ListToolsResultSchema,
    );

    await client.close();

    expect(result.tools).toEqual([
      {
        annotations: {
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
          readOnlyHint: false,
          title: 'Make Greeting',
        },
        description: 'Make a greeting',
        inputSchema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          additionalProperties: false,
          properties: {
            name: {
              type: 'string',
            },
          },
          required: ['name'],
          type: 'object',
        },
        name: 'make-greeting',
      },
    ]);
  });

  it('should execute a registered action via tools/call', async () => {
    const { client, serverAddress } = await getContext();
    const transport = new StreamableHTTPClientTransport(
      new URL(`${serverAddress}/api/mcp-actions/v1`),
    );

    await client.connect(transport);

    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'make-greeting',
          arguments: { name: 'World' },
        },
      },
      CallToolResultSchema,
    );

    await client.close();

    const firstContent = result.content[0];
    expect(firstContent.type).toBe('text');
    expect('text' in firstContent && firstContent.text).toContain(
      'NotAllowedError',
    );
    expect('text' in firstContent && firstContent.text).toContain(
      'Actions must be invoked by a service, not a user',
    );
  });

  it('should proxy OIDC discovery response for dynamic client registration', async () => {
    const oidcDocument = {
      issuer: 'https://issuer.example.com',
      authorization_endpoint: 'https://issuer.example.com/authorize',
      token_endpoint: 'https://issuer.example.com/token',
    };
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(oidcDocument),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const backend = await startTestBackend({
      features: [
        mcpPlugin,
        mockPluginWithActions,
        mockServices.rootConfig.factory({
          data: {
            backend: {
              actions: {
                pluginSources: ['local'],
              },
            },
            auth: {
              experimentalDynamicClientRegistration: {
                enabled: true,
              },
            },
          },
        }),
      ],
    });

    try {
      const response = await request(backend.server)
        .get('/.well-known/oauth-authorization-server')
        .expect(200);

      expect(response.body).toEqual(oidcDocument);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/.well-known/openid-configuration'),
      );
    } finally {
      await backend.stop();
    }
  });

  it('should return 502 when OIDC discovery fetch fails', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const backend = await startTestBackend({
      features: [
        mcpPlugin,
        mockPluginWithActions,
        mockServices.rootConfig.factory({
          data: {
            backend: {
              actions: {
                pluginSources: ['local'],
              },
            },
            auth: {
              experimentalDynamicClientRegistration: {
                enabled: true,
              },
            },
          },
        }),
      ],
    });

    try {
      const response = await request(backend.server)
        .get('/.well-known/oauth-authorization-server')
        .expect(502);

      expect(response.body).toEqual({
        error: 'Failed to load OIDC discovery document from auth service',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/.well-known/openid-configuration'),
      );
    } finally {
      await backend.stop();
    }
  });
});
