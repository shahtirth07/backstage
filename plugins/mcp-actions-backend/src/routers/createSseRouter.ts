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
import PromiseRouter from 'express-promise-router';
import { Router } from 'express';
import { McpService } from '../services/McpService';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { HttpAuthService } from '@backstage/backend-plugin-api';
import { SseSessionStore } from './SseSessionStore';
import { sendPlainTextClientError } from './mcpHttpErrorResponses';
import { parseSessionIdQueryParam } from './parseSessionIdQueryParam';

/**
 * Legacy SSE endpoint for older clients, hopefully will not be needed for much longer.
 */
export const createSseRouter = ({
  mcpService,
  httpAuth,
}: {
  mcpService: McpService;
  httpAuth: HttpAuthService;
}): Router => {
  const router = PromiseRouter();
  const sessionStore = new SseSessionStore();

  router.get('/', async (req, res) => {
    const server = mcpService.getServer({
      credentials: await httpAuth.credentials(req),
    });

    const transport = new SSEServerTransport(
      `${req.originalUrl}/messages`,
      res,
    );

    sessionStore.register(transport, res);

    await server.connect(transport);
  });

  router.post('/messages', async (req, res) => {
    const parsed = parseSessionIdQueryParam(req.query.sessionId);
    if (!parsed.ok) {
      sendPlainTextClientError(res, 400, parsed.message);
      return;
    }

    const { sessionId } = parsed;
    const transport = sessionStore.find(sessionId);
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      sendPlainTextClientError(
        res,
        400,
        `No transport found for sessionId "${sessionId}"`,
      );
    }
  });

  return router;
};