import { describe, expect, it } from 'vitest';
import { AuthError, cognito } from './cognito';

const config = { userPoolId: 'ap-south-1_abc', clientId: 'client1', region: 'ap-south-1' };

interface Call {
  target: string;
  body: Record<string, unknown>;
}

const fake = (
  replies: { ok: boolean; body?: unknown }[],
): { fetchImpl: typeof fetch; calls: Call[] } => {
  const calls: Call[] = [];
  const fetchImpl = ((_url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({
      target: (headers['x-amz-target'] ?? '').replace('AWSCognitoIdentityProviderService.', ''),
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    });
    const reply = replies.shift() ?? { ok: true, body: {} };
    return Promise.resolve({
      ok: reply.ok,
      json: () => Promise.resolve(reply.body ?? {}),
    } as Response);
  }) as typeof fetch;
  return { fetchImpl, calls };
};

describe('the sign-in calls', () => {
  it('signs up with the email as the user name and the email as an attribute', async () => {
    const { fetchImpl, calls } = fake([{ ok: true }]);
    await cognito(config, fetchImpl).signUp('a@b.in', 'secret123');
    expect(calls[0]).toEqual({
      target: 'SignUp',
      body: {
        ClientId: 'client1',
        Username: 'a@b.in',
        Password: 'secret123',
        UserAttributes: [{ Name: 'email', Value: 'a@b.in' }],
      },
    });
  });

  it('signs in with the password flow and gives back the tokens and when they stop', async () => {
    const { fetchImpl, calls } = fake([
      {
        ok: true,
        body: {
          AuthenticationResult: {
            IdToken: 'id',
            AccessToken: 'access',
            RefreshToken: 'refresh',
            ExpiresIn: 3600,
          },
        },
      },
    ]);
    const tokens = await cognito(config, fetchImpl, () => 1_000, { srp: false }).signIn(
      'a@b.in',
      'secret123',
    );
    expect(calls[0]?.target).toBe('InitiateAuth');
    expect(calls[0]?.body).toMatchObject({
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: 'a@b.in', PASSWORD: 'secret123' },
    });
    expect(tokens).toEqual({
      idToken: 'id',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 1_000 + 3_600_000,
    });
  });

  it('keeps the same refresh token when a refresh does not send a new one', async () => {
    const { fetchImpl, calls } = fake([
      {
        ok: true,
        body: { AuthenticationResult: { IdToken: 'i2', AccessToken: 'a2', ExpiresIn: 60 } },
      },
    ]);
    const tokens = await cognito(config, fetchImpl).refresh('old-refresh');
    expect(calls[0]?.body).toMatchObject({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: { REFRESH_TOKEN: 'old-refresh' },
    });
    expect(tokens.refreshToken).toBe('old-refresh');
  });

  it('turns each failure into words a person can act on, with a code to branch on', async () => {
    const cases: [string, string, RegExp][] = [
      ['UsernameExistsException', 'UsernameExistsException', /already an account/u],
      ['com.amazonaws#InvalidPasswordException', 'InvalidPasswordException', /8 characters/u],
      ['NotAuthorizedException', 'NotAuthorizedException', /do not match/u],
      ['CodeMismatchException', 'CodeMismatchException', /not right/u],
      ['ExpiredCodeException', 'ExpiredCodeException', /expired/u],
      ['LimitExceededException', 'LimitExceededException', /Too many/u],
      ['UserNotConfirmedException', 'UserNotConfirmedException', /not confirmed/u],
      ['SomethingNew', 'SomethingNew', /Something went wrong/u],
    ];
    for (const [type, code, words] of cases) {
      const { fetchImpl } = fake([
        { ok: false, body: { __type: type, message: 'internal detail' } },
      ]);
      const error = await cognito(config, fetchImpl)
        .signIn('a@b.in', 'x')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AuthError);
      expect((error as AuthError).code).toBe(code);
      expect((error as AuthError).message).toMatch(words);
      expect((error as AuthError).message).not.toContain('internal detail');
    }
  });

  it('says so when the service cannot be reached', async () => {
    const fetchImpl = (() => Promise.reject(new Error('down'))) as typeof fetch;
    const error = await cognito(config, fetchImpl)
      .signUp('a@b.in', 'x')
      .catch((e: unknown) => e);
    expect((error as AuthError).code).toBe('offline');
  });

  it('confirms, resets and deletes with the right calls', async () => {
    const { fetchImpl, calls } = fake([
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
    ]);
    const c = cognito(config, fetchImpl);
    await c.confirmSignUp('a@b.in', '123456');
    await c.forgotPassword('a@b.in');
    await c.confirmForgotPassword('a@b.in', '654321', 'newpass1');
    await c.signOut('access');
    await c.deleteUser('access');
    expect(calls.map((c2) => c2.target)).toEqual([
      'ConfirmSignUp',
      'ForgotPassword',
      'ConfirmForgotPassword',
      'GlobalSignOut',
      'DeleteUser',
    ]);
    expect(calls[2]?.body).toMatchObject({ ConfirmationCode: '654321', Password: 'newpass1' });
    expect(calls[4]?.body).toEqual({ AccessToken: 'access' });
  });
});

describe('signing in with SRP', () => {
  const challenge = {
    ok: true,
    body: {
      ChallengeName: 'PASSWORD_VERIFIER',
      Session: 'sess-1',
      ChallengeParameters: {
        USER_ID_FOR_SRP: 'user-uuid',
        SALT: 'aabbccddeeff00112233445566778899',
        SRP_B: 'ab'.repeat(300),
        SECRET_BLOCK: 'c2VjcmV0LWJsb2Nr',
      },
    },
  };
  const signedIn = {
    ok: true,
    body: {
      AuthenticationResult: {
        IdToken: 'id',
        AccessToken: 'access',
        RefreshToken: 'refresh',
        ExpiresIn: 3600,
      },
    },
  };

  it('proves it knows the password without sending it', async () => {
    const { fetchImpl, calls } = fake([challenge, signedIn]);
    const tokens = await cognito(config, fetchImpl, () => Date.UTC(2026, 10, 4, 3, 4, 5)).signIn(
      'a@b.in',
      'secret123',
    );
    expect(calls.map((c) => c.target)).toEqual(['InitiateAuth', 'RespondToAuthChallenge']);
    expect(calls[0]?.body).toMatchObject({
      AuthFlow: 'USER_SRP_AUTH',
      AuthParameters: { USERNAME: 'a@b.in' },
    });
    const srpA = (calls[0]?.body.AuthParameters as { SRP_A: string }).SRP_A;
    expect(srpA).toMatch(/^[0-9a-f]+$/u);
    expect(calls[1]?.body).toMatchObject({
      ChallengeName: 'PASSWORD_VERIFIER',
      Session: 'sess-1',
      ChallengeResponses: {
        USERNAME: 'user-uuid',
        PASSWORD_CLAIM_SECRET_BLOCK: 'c2VjcmV0LWJsb2Nr',
        TIMESTAMP: 'Wed Nov 4 03:04:05 UTC 2026',
      },
    });
    const responses = calls[1]?.body.ChallengeResponses as { PASSWORD_CLAIM_SIGNATURE: string };
    expect(responses.PASSWORD_CLAIM_SIGNATURE).toMatch(/^[A-Za-z0-9+/]{43}=$/u);
    // The password appears in no request at all.
    expect(JSON.stringify(calls)).not.toContain('secret123');
    expect(tokens.idToken).toBe('id');
  });

  it('falls back to the older sign-in only when the pool does not offer SRP', async () => {
    const { fetchImpl, calls } = fake([
      { ok: false, body: { __type: 'InvalidParameterException' } },
      signedIn,
    ]);
    const tokens = await cognito(config, fetchImpl).signIn('a@b.in', 'secret123');
    expect(calls.map((c) => c.body.AuthFlow)).toEqual(['USER_SRP_AUTH', 'USER_PASSWORD_AUTH']);
    expect(tokens.accessToken).toBe('access');
  });

  it('does not try a wrong password a second time', async () => {
    const { fetchImpl, calls } = fake([
      challenge,
      { ok: false, body: { __type: 'NotAuthorizedException' } },
    ]);
    await expect(cognito(config, fetchImpl).signIn('a@b.in', 'wrong')).rejects.toMatchObject({
      code: 'NotAuthorizedException',
      message: 'That email and password do not match.',
    });
    expect(calls.map((c) => c.target)).toEqual(['InitiateAuth', 'RespondToAuthChallenge']);
  });

  it('gives up plainly on a challenge it cannot answer (such as a second factor)', async () => {
    const { fetchImpl } = fake([{ ok: true, body: { ChallengeName: 'SMS_MFA', Session: 's' } }]);
    await expect(cognito(config, fetchImpl).signIn('a@b.in', 'secret123')).rejects.toBeInstanceOf(
      AuthError,
    );
  });
});
