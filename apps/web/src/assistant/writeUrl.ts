/**
 * Where something a person types (a request, a fire report) is sent. Only the deployed app, on live air, sends to
 * our API. The prototype, the tests and the recorded days keep it on the device, because the recorded days are a
 * shared recording: nothing done there may reach anything others can see.
 */
export const writeUrl = (live: boolean, recorded: boolean, api: string): string | undefined =>
  live && !recorded ? api : undefined;
