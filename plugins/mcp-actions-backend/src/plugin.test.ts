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

describe('Mcp Backend', () => {
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

  it('registers /.well-known/oauth-authorization-server when dynamic client registration is enabled', async () => {
    const openIdDocument = {
      issuer: 'http://mock-issuer',
      authorization_endpoint: 'http://mock-issuer/auth',
    };
    const fetchMock = installOpenIdConfigurationFetchMock(openIdDocument);

    try {
      const { server } = await startMcpTestBackend({
        ...MCP_TEST_ROOT_CONFIG,
        auth: {
          experimentalDynamicClientRegistration: {
            enabled: true,
          },
        },
      });

      const res = await fetch(
        `http://localhost:${readServerPort(
          server,
        )}/.well-known/oauth-authorization-server`,
      );
      expect(res.ok).toBe(true);
      await expect(res.json()).resolves.toEqual(openIdDocument);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\.well-known\/openid-configuration$/),
        expect.objectContaining({
          signal: expect.anything(),
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
});
EOF && git add plugins/mcp-actions-backend/src/plugin.test.ts && GIT_EDITOR=true git rebase --continue