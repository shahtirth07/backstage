/*
 * Copyright 2022 The Backstage Authors
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

import { renderInTestApp } from '@backstage/test-utils';

import { SearchResultStateBoundary } from './SearchResultStateBoundary';

describe('SearchResultStateBoundary', () => {
  it('renders a progress indicator while loading', async () => {
    const { getByTestId } = await renderInTestApp(
      <SearchResultStateBoundary loading>
        <span>content</span>
      </SearchResultStateBoundary>,
    );

    expect(getByTestId('progress')).toBeInTheDocument();
  });

  it('renders the response error panel when an error is provided', async () => {
    const error = new Error('boom');
    const { getByRole } = await renderInTestApp(
      <SearchResultStateBoundary error={error}>
        <span>content</span>
      </SearchResultStateBoundary>,
    );

    expect(getByRole('alert')).toHaveTextContent(
      /Error encountered while fetching search results.*boom/,
    );
  });

  it('renders the provided no-results component when empty', async () => {
    const { getByText, queryByText } = await renderInTestApp(
      <SearchResultStateBoundary isEmpty noResultsComponent={<>nothing here</>}>
        <span>content</span>
      </SearchResultStateBoundary>,
    );

    expect(getByText('nothing here')).toBeInTheDocument();
    expect(queryByText('content')).toBeNull();
  });

  it('renders nothing in the empty case when noResultsComponent is null', async () => {
    const { queryByText } = await renderInTestApp(
      <SearchResultStateBoundary isEmpty noResultsComponent={null}>
        <span>content</span>
      </SearchResultStateBoundary>,
    );

    expect(queryByText('content')).toBeNull();
  });

  it('renders children in the loaded, error-free, non-empty case', async () => {
    const { getByText } = await renderInTestApp(
      <SearchResultStateBoundary>
        <span>content</span>
      </SearchResultStateBoundary>,
    );

    expect(getByText('content')).toBeInTheDocument();
  });

  it('prioritizes loading over error and empty', async () => {
    const { getByTestId, queryByRole, queryByText } = await renderInTestApp(
      <SearchResultStateBoundary
        loading
        error={new Error('boom')}
        isEmpty
        noResultsComponent={<>nothing here</>}
      >
        <span>content</span>
      </SearchResultStateBoundary>,
    );

    expect(getByTestId('progress')).toBeInTheDocument();
    expect(queryByRole('alert')).toBeNull();
    expect(queryByText('nothing here')).toBeNull();
    expect(queryByText('content')).toBeNull();
  });
});
