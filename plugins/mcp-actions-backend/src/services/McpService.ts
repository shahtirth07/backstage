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
import { BackstageCredentials } from '@backstage/backend-plugin-api';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { JsonObject } from '@backstage/types';
import { ActionsService } from '@backstage/backend-plugin-api/alpha';
import { version } from '@backstage/plugin-mcp-actions-backend/package.json';
import { NotFoundError } from '@backstage/errors';

import { handleErrors } from './handleErrors';
import {
  type ActionResolutionStrategy,
  createActionResolutionStrategy,
} from './actionResolutionStrategy';

type CallToolParams = { name: string; arguments?: Record<string, unknown> };

async function invokeRegisteredAction(
  deps: {
    actions: ActionsService;
    strategy: ActionResolutionStrategy;
    credentials: BackstageCredentials;
    params: CallToolParams;
  },
) {
  const { actions, strategy, credentials, params } = deps;
  const action = await strategy.findActionByName(params.name);

  if (!action) {
    throw new NotFoundError(`Action "${params.name}" not found`);
  }

  const { output } = await actions.invoke({
    id: action.id,
    input: params.arguments as JsonObject,
    credentials,
  });

  return {
    // todo(blam): unfortunately structuredContent is not supported by most clients yet.
    // so the validation for the output happens in the default actions registry
    // and we return it as json text instead for now.
    content: [
      {
        type: 'text',
        text: ['```json', JSON.stringify(output, null, 2), '```'].join('\n'),
      },
    ],
  };
}

/**
 * Factory for the MCP `tools/list` handler, backed by Backstage actions.
 */
export function createListToolsHandler(deps: {
  actions: ActionsService;
  credentials: BackstageCredentials;
}) {
  const { actions, credentials } = deps;
  const strategy = createActionResolutionStrategy({ actions, credentials });

  return async () => {
    // TODO: switch this to be configuration based later
    return {
      tools: await strategy.listTools(),
    };
  };
}

/**
 * Factory for the MCP `tools/call` handler; inner work is wrapped with {@link handleErrors}.
 */
export function createCallToolHandler(deps: {
  actions: ActionsService;
  credentials: BackstageCredentials;
}) {
  const { actions, credentials } = deps;
  const strategy = createActionResolutionStrategy({ actions, credentials });

  return async ({ params }: { params: CallToolParams }) => {
    return handleErrors(async () =>
      invokeRegisteredAction({
        actions,
        strategy,
        credentials,
        params,
      }),
    );
  };
}

export class McpService {
  private readonly actions: ActionsService;

  constructor(actions: ActionsService) {
    this.actions = actions;
  }

  static async create({ actions }: { actions: ActionsService }) {
    return new McpService(actions);
  }

  getServer({ credentials }: { credentials: BackstageCredentials }) {
    const server = new McpServer(
      {
        name: 'backstage',
        // TODO: this version will most likely change in the future.
        version,
      },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(
      ListToolsRequestSchema,
      createListToolsHandler({
        actions: this.actions,
        credentials,
      }),
    );

    server.setRequestHandler(
      CallToolRequestSchema,
      createCallToolHandler({
        actions: this.actions,
        credentials,
      }),
    );

    return server;
  }
}
