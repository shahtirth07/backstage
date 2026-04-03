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
  type DiscoveryService,
  type HttpAuthService,
  type HttpRouterService,
  type LoggerService,
  type RootConfigService,
  type RootHttpRouterService,
} from '@backstage/backend-plugin-api';
import { json } from 'express';
import Router from 'express-promise-router';
import { McpService } from './services/McpService';
import { createStreamableRouter } from './routers/createStreamableRouter';
import { createSseRouter } from './routers/createSseRouter';
import {
  actionsRegistryServiceRef,
  actionsServiceRef,
} from '@backstage/backend-plugin-api/alpha';

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function toSafeHttpUrl(urlRaw: string): URL | undefined {
  try {
    const url = new URL(urlRaw);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url;
    }
  } catch {
    // Intentionally ignore: returning undefined will be handled at call site.
  }
  return undefined;
}

function registerMcpHttpRouters(options: {
  httpRouter: HttpRouterService;
  mcpService: McpService;
  httpAuth: HttpAuthService;
  logger: LoggerService;
}) {
  const { httpRouter, mcpService, httpAuth, logger } = options;

  const sseRouter = createSseRouter({
    mcpService,
    httpAuth,
  });

  const streamableRouter = createStreamableRouter({
    mcpService,
    httpAuth,
    logger,
  });

  const router = Router();
  router.use(json());

  router.use('/v1/sse', sseRouter);
  router.use('/v1', streamableRouter);

  httpRouter.use(router);
}

function registerOidcDiscoveryRouteIfEnabled(options: {
  config: RootConfigService;
  rootRouter: RootHttpRouterService;
  discovery: DiscoveryService;
}) {
  const { config, rootRouter, discovery } = options;

  if (
    !config.getOptionalBoolean(
      'auth.experimentalDynamicClientRegistration.enabled',
    )
  ) {
    return;
  }

  // This should be replaced with throwing a WWW-Authenticate header, but that doesn't seem to be supported by
  // many of the MCP client as of yet. So this seems to be the oldest version of the spec thats implemented.
  const oidcDiscoveryErrorMessage =
    'Failed to load OIDC discovery document from auth service';
  rootRouter.use('/.well-known/oauth-authorization-server', async (_, res) => {
    try {
      const authBaseUrlRaw = await discovery.getBaseUrl('auth');
      const authBaseUrl = toSafeHttpUrl(authBaseUrlRaw);

      if (!authBaseUrl) {
        res.status(502).json({ error: oidcDiscoveryErrorMessage });
        return;
      }

      const openIdConfigurationUrl = new URL(
        '/.well-known/openid-configuration',
        authBaseUrl,
      ).toString();

      const oidcResponse = await fetchWithTimeout(
        openIdConfigurationUrl,
        10_000,
      );

      if (!oidcResponse.ok) {
        res.status(502).json({ error: oidcDiscoveryErrorMessage });
        return;
      }

      res.json(await oidcResponse.json());
    } catch {
      res.status(502).json({ error: oidcDiscoveryErrorMessage });
    }
  });
}

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
        });
      },
    });
  },
});
