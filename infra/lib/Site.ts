import { Duration, Fn, RemovalPolicy } from 'aws-cdk-lib';
import type { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import {
  AllowedMethods,
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

/**
 * What the page may load and call. The app's own files, its fonts, images and workers; the map's tiles; the free
 * weather and place-search services it asks; and our own API, which is the same address. Nothing else, and no
 * other site may put the app in a frame.
 */
export const CONTENT_SECURITY_POLICY = [
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
].join('; ');

export interface SiteProps {
  readonly api: HttpApi;
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
        contentSecurityPolicy: { contentSecurityPolicy: CONTENT_SECURITY_POLICY, override: true },
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

    this.distribution = new Distribution(this, 'Distribution', {
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
        '/v1/me': {
          origin: new HttpOrigin(Fn.parseDomainName(props.api.apiEndpoint)),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: CachePolicy.CACHING_DISABLED,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeaders,
        },
        '/v1/*': {
          origin: new HttpOrigin(Fn.parseDomainName(props.api.apiEndpoint)),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCache,
          originRequestPolicy: apiOrigin,
          responseHeadersPolicy: securityHeaders,
          compress: true,
        },
      },
    });
  }
}
