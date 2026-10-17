import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { CurrentApiKey } from './current-api-key.decorator';

function getFactory() {
  class Target {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handler(@CurrentApiKey() _apiKey: unknown) {}
  }
  const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Target, 'handler');
  return args[Object.keys(args)[0]].factory;
}

describe('CurrentApiKey', () => {
  it('reads the API key from an HTTP request', () => {
    const apiKey = { id: 'k1', tenantId: 't1' };
    const ctx = new ExecutionContextHost([{ apiKey }, {}, () => undefined]);
    ctx.setType('http');
    expect(getFactory()(undefined, ctx)).toBe(apiKey);
  });

  it('gives undefined for an HTTP request without an API key', () => {
    const ctx = new ExecutionContextHost([{}, {}, () => undefined]);
    ctx.setType('http');
    expect(getFactory()(undefined, ctx)).toBeUndefined();
  });

  it('reads the API key from a GraphQL context', () => {
    const apiKey = { id: 'k2' };
    const ctx = new ExecutionContextHost([{}, {}, { req: { apiKey } }, {}]);
    ctx.setType('graphql');
    expect(getFactory()(undefined, ctx)).toBe(apiKey);
  });
});
