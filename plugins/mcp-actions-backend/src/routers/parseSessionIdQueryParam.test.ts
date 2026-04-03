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

import { parseSessionIdQueryParam } from './parseSessionIdQueryParam';

describe('parseSessionIdQueryParam', () => {
  it('accepts a single non-empty string', () => {
    expect(parseSessionIdQueryParam('abc')).toEqual({
      ok: true,
      sessionId: 'abc',
    });
  });

  it('trims whitespace', () => {
    expect(parseSessionIdQueryParam('  x  ')).toEqual({
      ok: true,
      sessionId: 'x',
    });
  });

  it('rejects undefined and null', () => {
    expect(parseSessionIdQueryParam(undefined)).toEqual({
      ok: false,
      message: 'sessionId is required',
    });
    expect(parseSessionIdQueryParam(null)).toEqual({
      ok: false,
      message: 'sessionId is required',
    });
  });

  it('rejects empty and whitespace-only strings', () => {
    expect(parseSessionIdQueryParam('')).toEqual({
      ok: false,
      message: 'sessionId must be non-empty',
    });
    expect(parseSessionIdQueryParam('   ')).toEqual({
      ok: false,
      message: 'sessionId must be non-empty',
    });
  });

  it('rejects multiple query values (array)', () => {
    expect(parseSessionIdQueryParam(['a', 'b'])).toEqual({
      ok: false,
      message: 'sessionId must be a single query parameter',
    });
  });

  it('accepts a single-element array (Express repeated key edge case)', () => {
    expect(parseSessionIdQueryParam(['only'])).toEqual({
      ok: true,
      sessionId: 'only',
    });
  });

  it('rejects empty array', () => {
    expect(parseSessionIdQueryParam([])).toEqual({
      ok: false,
      message: 'sessionId is required',
    });
  });

  it('rejects non-string primitive', () => {
    expect(parseSessionIdQueryParam(123 as unknown)).toEqual({
      ok: false,
      message: 'sessionId must be a string',
    });
  });

  it('rejects object-shaped query values', () => {
    expect(parseSessionIdQueryParam({} as unknown)).toEqual({
      ok: false,
      message: 'sessionId must be a string',
    });
  });
});
