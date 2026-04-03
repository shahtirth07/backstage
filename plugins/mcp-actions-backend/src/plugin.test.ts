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
import type { Server } from 'node:http';

const EXPECTED_MAKE_GREETING_TOOLS = [
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
] as const;

const MCP_TEST_ROOT_CONFIG = {
  backend: {
    actions: {
      pluginSources: ['local'],
    },
  },
} as const;

function readServerPort(server: Server): number {
  const address = server.address();
  if (typeof address !== 'object' || address === null || !('port' in address)) {
    throw new Error('server broke');
  }
  return address.port;
}

/** Sonar: prefer globalThis over global for fetch patching. */
function installOpenIdConfigurationFetchMock(
  openIdDocument: Record<string, string>,
): jest.SpyInstance {
  const originalFetch = globalThis.fetch.bind(globalThis);
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/.well-known/openid-configuration')) {
        return {
          ok: true,
          json: async () => openIdDocument,
        } as Response;
      }
      return originalFetch(input, init);
    });
}

function expectOpenIdConfigurationFetch(fetchMock: jest.SpyInstance) {
  expect(
    fetchMock.mock.calls.some(([input]) => {
      const url = typeof input === 'string' ? input : input.toString();
      return url.includes('/.well-known/openid-configuration');
    }),
  ).toBe(true);
}

describe('Mcp Backend', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
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

  const startMcpTestBackend = (
    configData: typeof MCP_TEST_ROOT_CONFIG & {
      auth?: { experimentalDynamicClientRegistration: { enabled: boolean } };
    },
  ) =>
    startTestBackend({
      features: [
        mcpPlugin,
        mockPluginWithActions,
        mockServices.rootConfig.factory({ data: configData }),
      ],
    });

  const getContext = async () => {
    const { server } = await startMcpTestBackend(MCP_TEST_ROOT_CONFIG);

    const client = new Client({
      name: 'test client',
      version: '1.0',
    });

    return {
      client,
      serverAddress: `http://localhost:${readServerPort(server)}`,
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

    expect(result.tools).toEqual(EXPECTED_MAKE_GREETING_TOOLS);
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

    expect(result.tools).toEqual(EXPECTED_MAKE_GREETING_TOOLS);
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

  it('returns identical 405 JSON-RPC response for GET and DELETE', async () => {
    const { serverAddress } = await getContext();

    const getResponse = await fetch(`${serverAddress}/api/mcp-actions/v1`, {
      method: 'GET',
    });
    const deleteResponse = await fetch(`${serverAddress}/api/mcp-actions/v1`, {
      method: 'DELETE',
    });

    expect(getResponse.status).toBe(405);
    expect(deleteResponse.status).toBe(405);

    const getBody = await getResponse.json();
    const deleteBody = await deleteResponse.json();
    const expectedBody = {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed.',
      },
      id: null,
    };

    expect(getBody).toEqual(expectedBody);
    expect(deleteBody).toEqual(expectedBody);
    expect(deleteBody).toEqual(getBody);
  });

  it('registers /.well-known/oauth-authorization-server when dynamic client registration is enabled', async () => {
    const openIdDocument = {
      issuer: 'http://mock-issuer',
      authorization_endpoint: 'http://mock-issuer/auth',
    };
    const fetchMock = installOpenIdConfigurationFetchMock(openIdDocument);

    const backend = await startMcpTestBackend({
      ...MCP_TEST_ROOT_CONFIG,
      auth: {
        experimentalDynamicClientRegistration: {
          enabled: true,
        },
      },
    });

    try {
      const res = await fetch(
        `http://localhost:${readServerPort(
          backend.server,
        )}/.well-known/oauth-authorization-server`,
      );

      expect(res.ok).toBe(true);
      await expect(res.json()).resolves.toEqual(openIdDocument);
      expectOpenIdConfigurationFetch(fetchMock);
    } finally {
      await backend.stop();
      fetchMock.mockRestore();
    }
  });

  it('should return 502 when OIDC discovery fetch fails', async () => {
    const originalFetchImpl = globalThis.fetch.bind(globalThis);
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/.well-known/openid-configuration')) {
          return {
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          } as Response;
        }
        return originalFetchImpl(input, init);
      });

    const backend = await startMcpTestBackend({
      ...MCP_TEST_ROOT_CONFIG,
      auth: {
        experimentalDynamicClientRegistration: {
          enabled: true,
        },
      },
    });

    try {
      const response = await fetch(
        `http://localhost:${readServerPort(
          backend.server,
        )}/.well-known/oauth-authorization-server`,
      );

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to load OIDC discovery document from auth service',
      });
      expectOpenIdConfigurationFetch(fetchMock);
    } finally {
      await backend.stop();
      fetchMock.mockRestore();
    }
  });
});