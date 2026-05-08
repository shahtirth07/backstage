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

/**
 * Options accepted by {@link fetchWithTimeout}.
 *
 * Mirrors {@link RequestInit} but excludes `signal` because the adapter owns
 * the abort signal driving the timeout. Adds a `timeoutMs` knob for the
 * call-site timeout, defaulting to 10s.
 */
export type FetchWithTimeoutOptions = Omit<RequestInit, 'signal'> & {
  /**
   * Time in milliseconds before the request is aborted. Defaults to 10_000.
   */
  timeoutMs?: number;
};

/**
 * Adapter that normalizes timeout-aware fetch behavior behind a single
 * interface. Wires an {@link AbortController} to a `setTimeout`, forwards any
 * caller-provided {@link RequestInit} fields, and ensures the timer is cleared
 * on both success and failure paths.
 *
 * Replaces the previously duplicated `fetchWithTimeout` helpers in the plugin
 * route logic and the plugin tests, eliminating drift risk between
 * production and test cancellation behavior.
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = 10_000, ...init } = options;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutHandle);
  }
}
