/**
 * Amazon Cognito's sign-in calls, made straight from the page. They are a handful of small JSON requests over HTTPS
 * to the user pool's own address, so there is no library: sign up, confirm the emailed code, sign in, keep the
 * session going, reset a password, and delete the account. Every failure is turned into words a person can act on.
 */
import { passwordClaim, srpAvailable, startSrp } from './srp';

export interface AuthConfig {
  readonly userPoolId: string;
  readonly clientId: string;
  readonly region: string;
}

export interface Tokens {
  readonly idToken: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  /** When the tokens stop working, in milliseconds since 1970. */
  readonly expiresAt: number;
}

/** `code` is stable for the screen to branch on; `message` is for the person. */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const WORDS: Readonly<Record<string, string>> = {
  UsernameExistsException: 'There is already an account with that email. Sign in instead.',
  InvalidPasswordException: 'The password needs at least 8 characters, with a letter and a number.',
  NotAuthorizedException: 'That email and password do not match.',
  UserNotFoundException: 'That email and password do not match.',
  CodeMismatchException: 'That code is not right. Check the email and try again.',
  ExpiredCodeException: 'That code has expired. Ask for a new one.',
  LimitExceededException: 'Too many tries. Wait a few minutes and try again.',
  TooManyRequestsException: 'Too many tries. Wait a few minutes and try again.',
  TooManyFailedAttemptsException: 'Too many tries. Wait a few minutes and try again.',
  InvalidParameterException: 'Check the email and password and try again.',
  UserNotConfirmedException: 'This email is not confirmed yet. Enter the code we sent.',
};

export type Fetch = typeof fetch;

/** The name Cognito puts in an error: "com.amazonaws...#CodeMismatchException" or "CodeMismatchException". */
const nameOf = (type: unknown): string =>
  typeof type === 'string' ? (type.split('#').pop() ?? type) : '';

export interface CognitoClient {
  readonly signUp: (email: string, password: string) => Promise<void>;
  readonly confirmSignUp: (email: string, code: string) => Promise<void>;
  readonly resendCode: (email: string) => Promise<void>;
  readonly signIn: (email: string, password: string) => Promise<Tokens>;
  readonly refresh: (refreshToken: string) => Promise<Tokens>;
  readonly forgotPassword: (email: string) => Promise<void>;
  readonly confirmForgotPassword: (email: string, code: string, password: string) => Promise<void>;
  readonly signOut: (accessToken: string) => Promise<void>;
  readonly deleteUser: (accessToken: string) => Promise<void>;
}

/** Thrown inside, never shown: the pool does not offer the SRP sign-in, so the older password sign-in is used. */
class SrpNotOffered extends Error {}

export interface CognitoOptions {
  /** Whether to sign in with SRP, so the password is never sent. On by default wherever the browser can do it. */
  readonly srp?: boolean;
}

export function cognito(
  config: AuthConfig,
  fetchImpl: Fetch = fetch,
  now: () => number = Date.now,
  options: CognitoOptions = {},
): CognitoClient {
  const endpoint = `https://cognito-idp.${config.region}.amazonaws.com/`;

  async function call(
    target: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-amz-json-1.1',
          'x-amz-target': `AWSCognitoIdentityProviderService.${target}`,
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AuthError('offline', 'Could not reach the sign-in service. Check your connection.');
    }
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      // An empty body is fine for the calls that return nothing.
    }
    if (res.ok) return json;
    const name = nameOf(json.__type);
    throw new AuthError(
      name === '' ? 'failed' : name,
      WORDS[name] ?? 'Something went wrong. Try again in a moment.',
    );
  }

  const tokensFrom = (result: unknown, keepRefresh?: string): Tokens => {
    const r = result as {
      IdToken?: string;
      AccessToken?: string;
      RefreshToken?: string;
      ExpiresIn?: number;
    };
    const refreshToken = r.RefreshToken ?? keepRefresh;
    if (r.IdToken === undefined || r.AccessToken === undefined || refreshToken === undefined)
      throw new AuthError('failed', 'Something went wrong. Try again in a moment.');
    return {
      idToken: r.IdToken,
      accessToken: r.AccessToken,
      refreshToken,
      expiresAt: now() + (r.ExpiresIn ?? 3600) * 1000,
    };
  };

  /** The name Cognito uses for the pool inside the proof, the part of the id after the underscore. */
  const poolName = config.userPoolId.split('_')[1] ?? config.userPoolId;

  /** Sign in without sending the password: a proof that it is known goes instead (see srp.ts). */
  async function signInWithSrp(email: string, password: string): Promise<Tokens> {
    const start = startSrp();
    let first: Record<string, unknown>;
    try {
      first = await call('InitiateAuth', {
        AuthFlow: 'USER_SRP_AUTH',
        ClientId: config.clientId,
        AuthParameters: { USERNAME: email, SRP_A: start.A.toString(16) },
      });
    } catch (error) {
      // The pool answers a flow it does not offer with "invalid parameter"; nothing about the password has been tried.
      if (error instanceof AuthError && error.code === 'InvalidParameterException')
        throw new SrpNotOffered();
      throw error;
    }
    // A server that is satisfied at once (it has the tokens ready) needs no proof from us.
    if (first.AuthenticationResult !== undefined) return tokensFrom(first.AuthenticationResult);
    const params = first.ChallengeParameters as Record<string, string> | undefined;
    if (
      first.ChallengeName !== 'PASSWORD_VERIFIER' ||
      params?.USER_ID_FOR_SRP === undefined ||
      params.SRP_B === undefined ||
      params.SALT === undefined ||
      params.SECRET_BLOCK === undefined
    )
      throw new AuthError('failed', 'Something went wrong. Try again in a moment.');
    let claim: Awaited<ReturnType<typeof passwordClaim>>;
    try {
      claim = await passwordClaim(
        poolName,
        start,
        {
          userIdForSrp: params.USER_ID_FOR_SRP,
          saltHex: params.SALT,
          srpBHex: params.SRP_B,
          secretBlockBase64: params.SECRET_BLOCK,
        },
        password,
        new Date(now()),
      );
    } catch {
      throw new AuthError('failed', 'Something went wrong. Try again in a moment.');
    }
    const out = await call('RespondToAuthChallenge', {
      ChallengeName: 'PASSWORD_VERIFIER',
      ClientId: config.clientId,
      ChallengeResponses: {
        USERNAME: params.USER_ID_FOR_SRP,
        PASSWORD_CLAIM_SECRET_BLOCK: params.SECRET_BLOCK,
        TIMESTAMP: claim.timestamp,
        PASSWORD_CLAIM_SIGNATURE: claim.signature,
      },
      ...(typeof first.Session === 'string' ? { Session: first.Session } : {}),
    });
    return tokensFrom(out.AuthenticationResult);
  }

  /** The older sign-in, which sends the password itself over HTTPS. Used only where SRP cannot be. */
  async function signInWithPassword(email: string, password: string): Promise<Tokens> {
    const out = await call('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: config.clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    });
    return tokensFrom(out.AuthenticationResult);
  }

  return {
    async signUp(email: string, password: string): Promise<void> {
      await call('SignUp', {
        ClientId: config.clientId,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: 'email', Value: email }],
      });
    },
    async confirmSignUp(email: string, code: string): Promise<void> {
      await call('ConfirmSignUp', {
        ClientId: config.clientId,
        Username: email,
        ConfirmationCode: code,
      });
    },
    async resendCode(email: string): Promise<void> {
      await call('ResendConfirmationCode', { ClientId: config.clientId, Username: email });
    },
    async signIn(email: string, password: string): Promise<Tokens> {
      if (options.srp !== false && srpAvailable()) {
        try {
          return await signInWithSrp(email, password);
        } catch (error) {
          // Only "this pool does not offer SRP" falls back. A wrong password must not be tried a second time.
          if (!(error instanceof SrpNotOffered)) throw error;
        }
      }
      return signInWithPassword(email, password);
    },
    async refresh(refreshToken: string): Promise<Tokens> {
      const out = await call('InitiateAuth', {
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        ClientId: config.clientId,
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      });
      return tokensFrom(out.AuthenticationResult, refreshToken);
    },
    async forgotPassword(email: string): Promise<void> {
      await call('ForgotPassword', { ClientId: config.clientId, Username: email });
    },
    async confirmForgotPassword(email: string, code: string, password: string): Promise<void> {
      await call('ConfirmForgotPassword', {
        ClientId: config.clientId,
        Username: email,
        ConfirmationCode: code,
        Password: password,
      });
    },
    async signOut(accessToken: string): Promise<void> {
      await call('GlobalSignOut', { AccessToken: accessToken });
    },
    async deleteUser(accessToken: string): Promise<void> {
      await call('DeleteUser', { AccessToken: accessToken });
    },
  };
}
