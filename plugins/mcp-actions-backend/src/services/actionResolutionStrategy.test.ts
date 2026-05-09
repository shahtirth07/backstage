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

import { mockCredentials } from '@backstage/backend-test-utils';
import { actionsRegistryServiceMock } from '@backstage/backend-test-utils/alpha';
import { expectedMcpTool } from '../testUtils/expectedMcpTool';
import { createActionResolutionStrategy } from './actionResolutionStrategy';

describe('actionResolutionStrategy', () => {
  function createMockActionsRegistry() {
    const actions = actionsRegistryServiceMock();
    actions.register({
      name: 'mock-action',
      title: 'Test',
      description: 'Test',
      schema: {
        input: z => z.object({ input: z.string() }),
        output: z => z.object({ output: z.string() }),
      },
      action: async () => ({ output: { output: 'test' } }),
    });
    return actions;
  }

  it('maps registered actions to MCP tools', async () => {
    const actions = createMockActionsRegistry();
    const strategy = createActionResolutionStrategy({
      actions,
      credentials: mockCredentials.user(),
    });

    const tools = await strategy.listTools();

    expect(tools).toEqual([
      expectedMcpTool({
        name: 'mock-action',
        title: 'Test',
        description: 'Test',
        inputProperties: {
          input: {
            type: 'string',
          },
        },
        required: ['input'],
      }),
    ]);
  });

  it('finds a registered action by name', async () => {
    const actions = createMockActionsRegistry();
    const strategy = createActionResolutionStrategy({
      actions,
      credentials: mockCredentials.user(),
    });

    const action = await strategy.findActionByName('mock-action');

    expect(action).toMatchObject({
      name: 'mock-action',
      title: 'Test',
      description: 'Test',
    });
  });

  it('returns undefined when action name is unknown', async () => {
    const actions = createMockActionsRegistry();
    const strategy = createActionResolutionStrategy({
      actions,
      credentials: mockCredentials.user(),
    });

    const action = await strategy.findActionByName('does-not-exist');

    expect(action).toBeUndefined();
  });
});
