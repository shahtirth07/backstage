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
  type DiscoveryService,
  type LoggerService,
  type RootConfigService,
  type RootHttpRouterService,
} from '@backstage/backend-plugin-api';
import { fetchWithTimeout } from '../services/fetchWithTimeout';

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

export function registerOidcDiscoveryRouteIfEnabled(options: {
  config: RootConfigService;
  rootRouter: RootHttpRouterService;
  discovery: DiscoveryService;
  logger: LoggerService;
}) {
  const { config, rootRouter, discovery, logger } = options;

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
        logger.error(oidcDiscoveryErrorMessage, {
          authBaseUrl: authBaseUrlRaw,
          reason: 'Invalid auth base URL protocol',
        });
        res.status(502).json({ error: oidcDiscoveryErrorMessage });
        return;
      }

      const openIdConfigurationUrl = new URL(
        '/.well-known/openid-configuration',
        authBaseUrl,
      ).toString();

      const oidcResponse = await fetchWithTimeout(openIdConfigurationUrl, {
        timeoutMs: 10_000,
      });

      if (!oidcResponse.ok) {
        logger.error(oidcDiscoveryErrorMessage, {
          status: oidcResponse.status,
          statusText: oidcResponse.statusText,
        });
        res.status(502).json({ error: oidcDiscoveryErrorMessage });
        return;
      }

      res.json(await oidcResponse.json());
    } catch (error) {
      logger.error(
        oidcDiscoveryErrorMessage,
        error instanceof Error ? error : { message: String(error) },
      );
      res.status(502).json({ error: oidcDiscoveryErrorMessage });
    }
  });
}
