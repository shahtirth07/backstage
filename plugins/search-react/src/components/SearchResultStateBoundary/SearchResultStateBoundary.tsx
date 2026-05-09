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

import { ReactNode } from 'react';

import { Progress, ResponseErrorPanel } from '@backstage/core-components';

/**
 * Props for {@link SearchResultStateBoundary}.
 */
export type SearchResultStateBoundaryProps = {
  /**
   * Whether the result set is still loading. Renders a default {@link Progress} indicator.
   */
  loading?: boolean;
  /**
   * Error from the result fetch. Renders a default {@link ResponseErrorPanel}.
   */
  error?: Error;
  /**
   * Whether the result set is empty. Renders {@link SearchResultStateBoundaryProps.noResultsComponent}.
   */
  isEmpty?: boolean;
  /**
   * Node rendered for the empty case. Pass `null` to suppress empty rendering.
   */
  noResultsComponent?: ReactNode;
  /**
   * Content rendered when the result is loaded, error-free, and non-empty.
   */
  children: ReactNode;
};

/**
 * Internal facade that consolidates the loading / error / empty rendering
 * for search result components. Centralizing these UX choices (Progress,
 * ResponseErrorPanel, empty-state slot) keeps the surrounding components
 * focused on success rendering and avoids drift in copy or behavior across
 * result surfaces.
 *
 * Branch precedence: loading > error > empty > children.
 */
export const SearchResultStateBoundary = (
  props: SearchResultStateBoundaryProps,
) => {
  const { loading, error, isEmpty, noResultsComponent, children } = props;

  if (loading) {
    return <Progress />;
  }

  if (error) {
    return (
      <ResponseErrorPanel
        title="Error encountered while fetching search results"
        error={error}
      />
    );
  }

  if (isEmpty) {
    return <>{noResultsComponent}</>;
  }

  return <>{children}</>;
};
