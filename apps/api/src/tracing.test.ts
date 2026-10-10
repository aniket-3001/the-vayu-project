import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { describe, expect, it } from 'vitest';
import { annotate, traced } from './tracing';

describe('tracing outside Lambda', () => {
  it('hands back the very same client, so wrapping one is always safe', () => {
    const client = new DynamoDBClient({});
    expect(traced(client)).toBe(client);
  });

  it('does nothing, and does not throw, when there is no trace to annotate', () => {
    expect(() => {
      annotate('route', '/v1/timeline');
    }).not.toThrow();
  });
});
