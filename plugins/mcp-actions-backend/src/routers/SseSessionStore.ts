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
import { Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

export class SseSessionStore {
  readonly #transportsBySessionId = new Map<string, SSEServerTransport>();

  register(transport: SSEServerTransport, response: Response): void {
    this.#transportsBySessionId.set(transport.sessionId, transport);

    response.on('close', () => {
      this.#transportsBySessionId.delete(transport.sessionId);
    });
  }

  find(sessionId: string): SSEServerTransport | undefined {
    return this.#transportsBySessionId.get(sessionId);
  }
}
