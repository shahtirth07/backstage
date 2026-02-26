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

import { test, expect } from '@playwright/test';
import { failOnBrowserErrors } from '@backstage/e2e-test-utils';

failOnBrowserErrors();

test('user can register an existing component via catalog import', async ({
  page,
}) => {
  // Stub catalog location creation to keep the flow deterministic.
  await page.route('**/api/catalog/locations**', async route => {
    if (route.request().method() !== 'POST') {
      return route.continue();
    }

    const requestBody = route.request().postDataJSON() as {
      target?: string;
    };
    const target =
      requestBody?.target ??
      'https://github.com/backstage/backstage/blob/master/catalog-info.yaml';

    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        location: { type: 'url', target },
        entities: [
          {
            kind: 'Component',
            metadata: {
              name: 'imported-component-e2e',
              namespace: 'default',
            },
          },
        ],
        exists: route.request().url().includes('dryRun=true') ? false : false,
      }),
    });
  });

  await page.goto('/');

  const enterButton = page.getByRole('button', { name: 'Enter' });
  await expect(enterButton).toBeVisible();
  await enterButton.click();

  await expect(page).toHaveURL(/\/catalog/);

  await page.goto('/catalog-import');

  await expect(
    page.getByRole('heading', { name: 'Register an existing component' }),
  ).toBeVisible();

  const exampleUrl =
    'https://github.com/backstage/backstage/blob/master/catalog-info.yaml';

  await page.getByLabel('URL').fill(exampleUrl);
  await page.getByRole('button', { name: 'Analyze' }).click();

  await expect(
    page.getByText('The following entities will be added to the catalog:'),
  ).toBeVisible();
  await expect(page.getByText('imported-component-e2e')).toBeVisible();

  await page.getByRole('button', { name: 'Import' }).click();

  await expect(
    page.getByText('The following entities have been added to the catalog:'),
  ).toBeVisible();
  await expect(page.getByText('imported-component-e2e')).toBeVisible();
});
