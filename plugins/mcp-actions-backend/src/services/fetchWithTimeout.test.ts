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

import { fetchWithTimeout } from './fetchWithTimeout';

describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('forwards url and init to fetch and supplies an AbortSignal', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as Response);

    const response = await fetchWithTimeout('http://example.test/api', {
      method: 'POST',
      timeoutMs: 1_000,
    });

    expect(response.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe('http://example.test/api');
    expect(calledInit).toEqual(
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );
    expect((calledInit as RequestInit).signal?.aborted).toBe(false);
  });

  it('aborts the request when the timeout elapses', async () => {
    jest.useFakeTimers();

    let capturedSignal: AbortSignal | undefined;
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_, reject) => {
          capturedSignal =
            (init as RequestInit | undefined)?.signal ?? undefined;
          capturedSignal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );

    const pending = fetchWithTimeout('http://example.test/api', {
      timeoutMs: 50,
    });

    jest.advanceTimersByTime(50);

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('clears the timer on a successful response so it does not abort later', async () => {
    jest.useFakeTimers();

    let capturedSignal: AbortSignal | undefined;
    const okResponse = { ok: true } as Response;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      capturedSignal = (init as RequestInit | undefined)?.signal ?? undefined;
      return okResponse;
    });

    await fetchWithTimeout('http://example.test/api', { timeoutMs: 1_000 });

    jest.advanceTimersByTime(5_000);

    expect(capturedSignal?.aborted).toBe(false);
  });

  it('clears the timer when fetch rejects', async () => {
    jest.useFakeTimers();

    let capturedSignal: AbortSignal | undefined;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      capturedSignal = (init as RequestInit | undefined)?.signal ?? undefined;
      throw new Error('network down');
    });

    await expect(
      fetchWithTimeout('http://example.test/api', { timeoutMs: 1_000 }),
    ).rejects.toThrow('network down');

    jest.advanceTimersByTime(5_000);

    expect(capturedSignal?.aborted).toBe(false);
  });
});
