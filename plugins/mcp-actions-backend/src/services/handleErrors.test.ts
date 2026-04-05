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
  AuthenticationError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';
import { describeBackstageErrorForMcp, handleErrors } from './handleErrors';

describe('describeBackstageErrorForMcp', () => {
  it.each([
    {
      error: new NotFoundError('nothing here'),
      expected: 'NotFoundError: nothing here',
    },
    {
      error: new AuthenticationError('missing token'),
      expected: 'AuthenticationError: missing token',
    },
    {
      error: new NotAllowedError('service credentials required'),
      expected: 'NotAllowedError: service credentials required',
    },
  ])('returns a description for $error.name', ({ error, expected }) => {
    const result = describeBackstageErrorForMcp(error);

    expect(result).toEqual({
      handled: true,
      description: expected,
    });
  });

  it('returns unhandled for an unknown Error type', () => {
    const err = new Error('surprise');
    const result = describeBackstageErrorForMcp(err);

    expect(result).toEqual({ handled: false, error: err });
  });

  it('returns unhandled for a non-Error throw value', () => {
    const result = describeBackstageErrorForMcp('string failure');

    expect(result).toEqual({ handled: false, error: 'string failure' });
  });
});

describe('handleErrors', () => {
  it('turns a known Backstage error into MCP error content', async () => {
    const err = new NotFoundError('missing');
    const outcome = await handleErrors(async () => {
      throw err;
    });

    expect(outcome).toEqual({
      content: [{ type: 'text', text: 'NotFoundError: missing' }],
      isError: true,
    });
  });

  it('rethrows an unknown error so the request fails as before', async () => {
    const err = new Error('boom');
    await expect(
      handleErrors(async () => {
        throw err;
      }),
    ).rejects.toBe(err);
  });
});
