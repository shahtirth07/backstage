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

import type {
  OpenAPIObject,
  OperationObject,
  PathItemObject,
} from 'openapi3-ts';
import yaml from 'yaml';
import {
  formatDefinition,
  mergeSpecs,
} from './InternalOpenApiDocumentationProvider';

describe('InternalOpenApiDocumentationProvider helpers', () => {
  describe('mergeSpecs', () => {
    it('merges multiple plugin specs into a single OpenAPI document with base server', async () => {
      const baseUrl = 'https://backstage.example.com';

      const specA: OpenAPIObject = {
        openapi: '3.0.0',
        info: { title: 'Service A', version: '1.0.0' },
        paths: {
          '/service-a': {
            get: {
              operationId: 'getServiceA',
            } as OperationObject,
          } as PathItemObject,
        },
      };

      const specB: OpenAPIObject = {
        openapi: '3.0.0',
        info: { title: 'Service B', version: '1.0.0' },
        paths: {
          '/service-b': {
            post: {
              operationId: 'createServiceB',
            } as OperationObject,
          } as PathItemObject,
        },
      };

      const merged = await mergeSpecs({ baseUrl, specs: [specA, specB] });

      expect(merged.openapi).toBe('3.0.3');
      expect(merged.info?.title).toBe('Backstage API');
      expect(merged.info?.version).toBe('1');

      expect(merged.servers?.[0]?.url).toBe(baseUrl);

      expect(Object.keys(merged.paths ?? {})).toEqual(
        expect.arrayContaining(['/service-a', '/service-b']),
      );
      expect(
        (merged.paths?.['/service-a']?.get as OperationObject)?.operationId,
      ).toBe('getServiceA');
      expect(
        (merged.paths?.['/service-b']?.post as OperationObject)?.operationId,
      ).toBe('createServiceB');
    });
  });

  describe('formatDefinition', () => {
    const definition: OpenAPIObject = {
      openapi: '3.0.3',
      info: {
        title: 'Backstage API',
        version: '1.0.0',
      },
      paths: {},
    };

    it('formats definition as pretty-printed JSON', () => {
      const result = formatDefinition(definition, 'json');
      expect(typeof result).toBe('string');

      const parsed = JSON.parse(result);
      expect(parsed).toEqual(definition);
    });

    it('formats definition as YAML', () => {
      const result = formatDefinition(definition, 'yaml');
      expect(typeof result).toBe('string');

      const parsed = yaml.parse(result);
      expect(parsed).toEqual(definition);
    });

    it('throws for unsupported format', () => {
      expect(() => formatDefinition(definition, 'xml')).toThrow(
        'Unsupported format type: xml',
      );
    });
  });
});
