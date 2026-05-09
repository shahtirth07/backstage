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
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { McpService } from './services/McpService';
import { registerMcpHttpRouters } from './plugin/registerMcpHttpRouters';
import { registerOidcDiscoveryRouteIfEnabled } from './plugin/registerOidcDiscoveryRouteIfEnabled';
import {
  actionsRegistryServiceRef,
  actionsServiceRef,
} from '@backstage/backend-plugin-api/alpha';

/**
 * mcpPlugin backend plugin
 *
 * @public
 */
export const mcpPlugin = createBackendPlugin({
  pluginId: 'mcp-actions',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        auth: coreServices.auth,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        actions: actionsServiceRef,
        registry: actionsRegistryServiceRef,
        rootRouter: coreServices.rootHttpRouter,
        discovery: coreServices.discovery,
        config: coreServices.rootConfig,
      },
      async init({
        actions,
        logger,
        httpRouter,
        httpAuth,
        rootRouter,
        discovery,
        config,
      }) {
        const mcpService = await McpService.create({
          actions,
        });

        registerMcpHttpRouters({
          httpRouter,
          mcpService,
          httpAuth,
          logger,
        });

        registerOidcDiscoveryRouteIfEnabled({
          config,
          rootRouter,
          discovery,
          logger,
        });
      },
    });
  },
});
