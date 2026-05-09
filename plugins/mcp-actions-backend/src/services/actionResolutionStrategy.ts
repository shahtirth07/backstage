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
import { ActionsService } from '@backstage/backend-plugin-api/alpha';

type RegisteredAction = Awaited<ReturnType<ActionsService['list']>>['actions'][number];

function toMcpTool(action: RegisteredAction) {
  return {
    inputSchema: action.schema.input,
    // todo(blam): this is unfortunately not supported by most clients yet.
    // When this is provided you need to provide structuredContent instead.
    // outputSchema: action.schema.output,
    name: action.name,
    description: action.description,
    annotations: {
      title: action.title,
      destructiveHint: action.attributes.destructive,
      idempotentHint: action.attributes.idempotent,
      readOnlyHint: action.attributes.readOnly,
      openWorldHint: false,
    },
  };
}

export type ActionResolutionStrategy = {
  listTools: () => Promise<ReturnType<typeof toMcpTool>[]>;
  findActionByName: (name: string) => Promise<RegisteredAction | undefined>;
};

export function createActionResolutionStrategy(deps: {
  actions: ActionsService;
  credentials: BackstageCredentials;
}): ActionResolutionStrategy {
  const { actions, credentials } = deps;

  const listRegisteredActions = async (): Promise<RegisteredAction[]> => {
    const { actions: listed } = await actions.list({ credentials });
    return listed;
  };

  return {
    async listTools() {
      const listed = await listRegisteredActions();
      return listed.map(action => toMcpTool(action));
    },
    async findActionByName(name: string) {
      const listed = await listRegisteredActions();
      return listed.find(action => action.name === name);
    },
  };
}
