import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { HttpMethod, type HttpApi, type HttpRoute } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type { UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { AccountRecovery, UserPool } from 'aws-cdk-lib/aws-cognito';
import type { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface AccountsProps {
  readonly api: HttpApi;
  /** The API's own function, which serves `/v1/me` once API Gateway has checked the token. */
  readonly apiFunction: LambdaFunction;
}

/**
 * Accounts, as small as they can be and still work: Amazon Cognito keeps the email and password, sends the
 * verification and reset codes, and issues the tokens. The app signs in straight to Cognito (no hosted page, no
 * third party). API Gateway checks the token on `/v1/me`, where one person's saved places and settings live in the
 * Watch table, keyed by the user id in the token. Nothing else in the API asks who the caller is.
 */
export class Accounts extends Construct {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  /** The routes that need a sign-in, so the stage can throttle them. */
  readonly routes: HttpRoute[];

  constructor(scope: Construct, id: string, props: AccountsProps) {
    super(scope, id);

    this.userPool = new UserPool(this, 'Users', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Eight characters with a letter and a digit: Cognito's own rules, shown to the person as they are.
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      // A lost password is reset with a code sent to the verified email.
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.client = this.userPool.addClient('Web', {
      generateSecret: false,
      disableOAuth: true,
      // The app sends the email and password to Cognito over HTTPS. There is no hosted page and no OAuth redirect.
      authFlows: { userPassword: true },
      // The same answer whether or not an email has an account, so the form cannot be used to find out who has one.
      preventUserExistenceErrors: true,
      idTokenValidity: Duration.hours(1),
      accessTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    const authorizer = new HttpUserPoolAuthorizer('UserAuth', this.userPool, {
      userPoolClients: [this.client],
    });
    const integration = new HttpLambdaIntegration('MeIntegration', props.apiFunction);
    this.routes = props.api.addRoutes({
      path: '/v1/me',
      methods: [HttpMethod.GET, HttpMethod.PUT, HttpMethod.DELETE],
      integration,
      authorizer,
    });
    // The same sign-in check guards the signed-in usage events and the admin statistics. Who counts as an admin is
    // decided in the function, from the verified email and a list given at deploy time; this only requires a sign-in.
    this.routes.push(
      ...props.api.addRoutes({
        path: '/v1/me/events',
        methods: [HttpMethod.POST],
        integration,
        authorizer,
      }),
      ...props.api.addRoutes({
        path: '/v1/admin/{proxy+}',
        methods: [HttpMethod.GET],
        integration,
        authorizer,
      }),
    );

    // The API may tell the app which pool to use: these two ids are public, not secrets.
    props.apiFunction.addEnvironment('USER_POOL_ID', this.userPool.userPoolId);
    props.apiFunction.addEnvironment('USER_POOL_CLIENT_ID', this.client.userPoolClientId);
  }
}
