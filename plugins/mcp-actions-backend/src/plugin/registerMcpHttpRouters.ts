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
  type HttpAuthService,
  type HttpRouterService,
  type LoggerService,
} from '@backstage/backend-plugin-api';
import { json } from 'express';
import Router from 'express-promise-router';
import { McpService } from '../services/McpService';
import { createStreamableRouter } from '../routers/createStreamableRouter';
import { createSseRouter } from '../routers/createSseRouter';

export function registerMcpHttpRouters(options: {
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
