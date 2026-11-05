import { Duration, Fn, RemovalPolicy } from 'aws-cdk-lib';
import type { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import {
  AllowedMethods,
  type BehaviorOptions,
  CacheCookieBehavior,
  CacheHeaderBehavior,
  CachePolicy,
  CacheQueryStringBehavior,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  OriginRequestHeaderBehavior,
  OriginRequestPolicy,
  OriginRequestQueryStringBehavior,
  OriginRequestCookieBehavior,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Every page request gets `index.html` unless it names a file: the app is one page that finds its screen from the
 * part of the address after `#`, so a path with no file extension is the app.
 */
export const APP_INDEX_FUNCTION = `
function handler(event) {
  var request = event.request;
  var last = request.uri.split('/').pop();
  if (last.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
`;

/** The origins the Android and iOS apps run from. They are the only sites other than this one that may call the API. */
export const MOBILE_ORIGINS = ['https://localhost', 'capacitor://localhost'] as const;

/**
 * The browser asks "may I?" with an OPTIONS request before it sends a POST or a request with a token. The API has no
 * route for that, so CloudFront answers it for the app origins and passes everything else through untouched.
 */
export const API_PREFLIGHT_FUNCTION = `
var ALLOWED = ${JSON.stringify(MOBILE_ORIGINS)};
function handler(event) {
  var request = event.request;
  if (request.method !== 'OPTIONS') return request;
  var origin = request.headers.origin ? request.headers.origin.value : '';
  if (ALLOWED.indexOf(origin) === -1) return request;
  return {
    statusCode: 204,
    statusDescription: 'No Content',
    headers: {
      'access-control-allow-origin': { value: origin },
      'access-control-allow-methods': { value: 'GET, POST, PUT, DELETE, OPTIONS' },
      'access-control-allow-headers': { value: 'content-type, authorization' },
      'access-control-max-age': { value: '86400' },
      vary: { value: 'Origin' }
    }
  };
}
`;

/**
 * What the page may load and call. The app's own files, its fonts, images and workers; the map's tiles; the free
 * weather and place-search services it asks; and our own API, which is the same address. Nothing else, and no
 * other site may put the app in a frame.
 */
/**
 * The page's content policy. `extraConnect` adds hosts the page may send data to, for the one optional service (crash
 * reporting); each must be a plain host name, so nothing else can be slipped in.
 */
export const contentSecurityPolicy = (extraConnect: readonly string[] = []): string => {
  for (const host of extraConnect) {
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/u.test(host))
      throw new Error(`Not a plain host name: ${host}`);
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://tiles.openfreemap.org",
    "font-src 'self' data: https://tiles.openfreemap.org",
    "connect-src 'self' data: blob: https://tiles.openfreemap.org https://api.open-meteo.com https://air-quality-api.open-meteo.com https://geocoding-api.open-meteo.com https://photon.komoot.io https://cognito-idp.ap-south-1.amazonaws.com",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
    .join('; ')
    .replace(/(connect-src [^;]*)/u, (match) =>
      [match, ...extraConnect.map((host) => `https://${host}`)].join(' '),
    );
};

export const CONTENT_SECURITY_POLICY = contentSecurityPolicy();

export interface SiteProps {
  /** A secret CloudFront adds as `x-origin-verify` on every request to the API, which refuses requests without it. */
  readonly originSecret?: string | undefined;
  readonly api: HttpApi;
  /** A host the page may send crash reports to (e.g. `o123.ingest.us.sentry.io`). Without it the policy allows none. */
  readonly crashReportingHost?: string | undefined;
  /** The ARN of a web firewall made in us-east-1 (see Edge.ts). Without it the address has no firewall. */
  readonly webAclArn?: string | undefined;
}

/**
 * The public address: a private bucket holding the app, in front of CloudFront, which also fronts our API under
 * `/v1/*`. The app and the API are then one origin, so there is no cross-site call to allow, and the API's slow-moving
 * answers are kept at the edge for a few minutes, so a crowd of visitors makes few calls to AWS and none to OpenAQ.
 */
export class Site extends Construct {
  readonly bucket: Bucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: SiteProps) {
    super(scope, id);

    this.bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const appIndex = new CloudFrontFunction(this, 'AppIndex', {
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromInline(APP_INDEX_FUNCTION),
    });

    const csp = contentSecurityPolicy(
      props.crashReportingHost === undefined ? [] : [props.crashReportingHost],
    );
    const securityHeaders = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
      },
      customHeadersBehavior: {
        // The camera and the location are asked for by the page itself; nothing else may use them.
        customHeaders: [
          {
            header: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=(self), payment=(), usb=()',
            override: true,
          },
        ],
      },
    });

    // The same headers for the API's answers, plus permission for the phone apps to read them.
    const apiHeaders = new ResponseHeadersPolicy(this, 'ApiHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
      },
      customHeadersBehavior: {
        // The camera and the location are asked for by the page itself; nothing else may use them.
        customHeaders: [
          {
            header: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=(self), payment=(), usb=()',
            override: true,
          },
        ],
      },
      corsBehavior: {
        accessControlAllowOrigins: [...MOBILE_ORIGINS],
        accessControlAllowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        accessControlAllowHeaders: ['content-type', 'authorization'],
        accessControlAllowCredentials: false,
        accessControlMaxAge: Duration.days(1),
        originOverride: true,
      },
    });

    const apiPreflight = new CloudFrontFunction(this, 'ApiPreflight', {
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromInline(API_PREFLIGHT_FUNCTION),
    });

    // The API's answers say how long they may be kept (`cache-control`); this lets that be at most fifteen
    // minutes, keyed on the whole address, and compresses what it sends.
    const apiCache = new CachePolicy(this, 'ApiCache', {
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(0),
      maxTtl: Duration.minutes(15),
      queryStringBehavior: CacheQueryStringBehavior.all(),
      headerBehavior: CacheHeaderBehavior.none(),
      cookieBehavior: CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // What the API is sent besides the address: the viewer's address (for the daily limits, which hash it) and
    // nothing else. The viewer's own Host header must not be forwarded: API Gateway answers it with a 403.
    const apiOrigin = new OriginRequestPolicy(this, 'ApiOrigin', {
      headerBehavior: OriginRequestHeaderBehavior.allowList('CloudFront-Viewer-Address'),
      queryStringBehavior: OriginRequestQueryStringBehavior.all(),
      cookieBehavior: OriginRequestCookieBehavior.none(),
    });

    const apiHttpOrigin = (): HttpOrigin =>
      new HttpOrigin(Fn.parseDomainName(props.api.apiEndpoint), {
        ...(props.originSecret === undefined
          ? {}
          : { customHeaders: { 'x-origin-verify': props.originSecret } }),
      });
    const signedInBehavior: BehaviorOptions = {
      origin: apiHttpOrigin(),
      viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
      allowedMethods: AllowedMethods.ALLOW_ALL,
      cachePolicy: CachePolicy.CACHING_DISABLED,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      responseHeadersPolicy: apiHeaders,
      functionAssociations: [
        { function: apiPreflight, eventType: FunctionEventType.VIEWER_REQUEST },
      ],
    };

    this.distribution = new Distribution(this, 'Distribution', {
      ...(props.webAclArn === undefined ? {} : { webAclId: props.webAclArn }),
      defaultRootObject: 'index.html',
      priceClass: PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: securityHeaders,
        compress: true,
        functionAssociations: [{ function: appIndex, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        // A signed-in person's own data: never cached, and the viewer's Authorization header goes through to the API,
        // which API Gateway checks before anything runs. (The Host header still does not go, as for the rest.)
        '/v1/me': signedInBehavior,
        // The signed-in usage events and the admin statistics need the token passed through too.
        '/v1/me/events': signedInBehavior,
        '/v1/admin/*': signedInBehavior,
        '/v1/*': {
          origin: apiHttpOrigin(),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCache,
          originRequestPolicy: apiOrigin,
          responseHeadersPolicy: apiHeaders,
          functionAssociations: [
            { function: apiPreflight, eventType: FunctionEventType.VIEWER_REQUEST },
          ],
          compress: true,
        },
      },
    });
  }
}
