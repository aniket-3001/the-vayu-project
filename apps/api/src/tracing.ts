import { Tracer } from '@aws-lambda-powertools/tracer';

/**
 * One tracer for every function. In Lambda with active tracing it records each call to AWS as a
 * piece of a trace, so the X-Ray service map shows which function called which service and how
 * long it took. Outside Lambda (tests, scripts) it switches itself off and does nothing.
 */
export const tracer = new Tracer({ serviceName: 'vayu' });

type TraceableClient = Parameters<Tracer['captureAWSv3Client']>[0];

/** Wraps an AWS SDK v3 client so its calls show up in the trace. Returns the same client. */
export function traced<Client extends TraceableClient>(client: Client): Client {
  return tracer.captureAWSv3Client(client);
}

/** Puts a searchable label on the current trace (for example the route or a result). No-op outside Lambda. */
export function annotate(name: string, value: string | number | boolean): void {
  tracer.putAnnotation(name, value);
}
