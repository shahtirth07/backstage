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
import { EventEmitter } from 'node:events';
import { Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { SseSessionStore } from './SseSessionStore';

describe('SseSessionStore', () => {
  function createTransport(sessionId: string): SSEServerTransport {
    return { sessionId } as unknown as SSEServerTransport;
  }

  it('registers and finds transports by session id', () => {
    const store = new SseSessionStore();
    const transport = createTransport('session-a');
    const response = new EventEmitter() as unknown as Response;

    store.register(transport, response);

    expect(store.find('session-a')).toBe(transport);
  });

  it('removes transport when connection closes', () => {
    const store = new SseSessionStore();
    const transportA = createTransport('session-a');
    const transportB = createTransport('session-b');
    const responseEmitterA = new EventEmitter();
    const responseEmitterB = new EventEmitter();

    store.register(transportA, responseEmitterA as unknown as Response);
    store.register(transportB, responseEmitterB as unknown as Response);

    responseEmitterA.emit('close');

    expect(store.find('session-a')).toBeUndefined();
    expect(store.find('session-b')).toBe(transportB);
  });
});
