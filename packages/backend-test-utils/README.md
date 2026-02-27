# @backstage/backend-test-utils

Test helpers library for Backstage backends.

## Usage

Add the library as a `devDependency` to your backend package:

```sh
# From your Backstage root directory, go to your backend package, or to a backend plugin
cd plugins/my-plugin-backend
yarn add --dev @backstage/backend-test-utils
```

## TestDatabases quick usage

`TestDatabases` helps run the same integration test logic against one or more
database engines.

```ts
import { TestDatabases } from '@backstage/backend-test-utils';

describe('my plugin', () => {
  const databases = TestDatabases.create();

  it.each(databases.eachSupportedId())('works on %p', async databaseId => {
    const knex = await databases.init(databaseId);
    // run migrations, then execute assertions against your service/router
  });
});
```

For fast local iteration, disable Docker-backed database targets:

```sh
BACKSTAGE_TEST_DISABLE_DOCKER=1 yarn test --no-watch plugins/my-plugin-backend/src
```

## Environment variables

- `BACKSTAGE_TEST_DISABLE_DOCKER`
  - Setting the value to `1` disables Docker for tests
- `CI`
  - Setting the value to `1` enables long-running tests, including the ones utilizing Docker
- `BACKSTAGE_TEST_DOCKER_REGISTRY`
  - Docker registry mirror address where to pull images for tests, for example `mycompany.docker.io/mirror`
  - See [documentation](https://node.testcontainers.org/configuration/) for information
    about authentication (`DOCKER_AUTH_CONFIG`)

Connection strings for different databases that are used for testing. The value of the
string should point to the running instance of the database.

- `BACKSTAGE_TEST_DATABASE_POSTGRES13_CONNECTION_STRING`
- `BACKSTAGE_TEST_DATABASE_POSTGRES12_CONNECTION_STRING`
- `BACKSTAGE_TEST_DATABASE_POSTGRES11_CONNECTION_STRING`
- `BACKSTAGE_TEST_DATABASE_POSTGRES9_CONNECTION_STRING`
- `BACKSTAGE_TEST_DATABASE_MYSQL8_CONNECTION_STRING`

## Documentation

- [Backstage Readme](https://github.com/backstage/backstage/blob/master/README.md)
- [Backstage Documentation](https://backstage.io/docs)
