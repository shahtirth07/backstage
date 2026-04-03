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
 * Validates `req.query.sessionId` from Express: a single, non-empty string.
 * Rejects repeated params, non-strings, and whitespace-only values.
 */
export function parseSessionIdQueryParam(
  raw: unknown,
): { ok: true; sessionId: string } | { ok: false; message: string } {
  if (raw === undefined || raw === null) {
    return { ok: false, message: 'sessionId is required' };
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return { ok: false, message: 'sessionId is required' };
    }
    if (raw.length > 1) {
      return {
        ok: false,
        message: 'sessionId must be a single query parameter',
      };
    }
    return parseSessionIdQueryParam(raw[0]);
  }

  if (typeof raw !== 'string') {
    return { ok: false, message: 'sessionId must be a string' };
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    return { ok: false, message: 'sessionId must be non-empty' };
  }

  return { ok: true, sessionId: trimmed };
}
