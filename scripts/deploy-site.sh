#!/usr/bin/env bash
# Builds the app for the live address and puts it on S3 behind CloudFront. Run it yourself, after `cdk deploy`.
#   AWS_PROFILE=vayu scripts/deploy-site.sh
set -euo pipefail
cd "$(dirname "$0")/.."
STACK="${STACK:-Vayu}"
REGION="${AWS_REGION:-ap-south-1}"

output() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET="$(output SiteBucketName)"
DIST="$(output DistributionId)"
URL="$(output SiteUrl)"
if [ -z "$BUCKET" ] || [ "$BUCKET" = "None" ]; then
  echo "The stack $STACK has no site bucket yet. Run: make deploy-diff, then cdk deploy." >&2
  exit 1
fi

# An empty API address: the page and the API share one address, so there is nothing to allow across sites.
VITE_API_URL= npm run build -w @vayu/web
node scripts/check-bundle.mjs

# Files with a hash in their name never change, so they are kept for a year; the page itself is always asked for.
aws s3 sync apps/web/dist/assets "s3://$BUCKET/assets" --delete --cache-control "public,max-age=31536000,immutable"
aws s3 sync apps/web/dist "s3://$BUCKET" --delete --exclude "assets/*" --exclude "index.html" --cache-control "public,max-age=3600"
aws s3 cp apps/web/dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/" "/index.html" >/dev/null
echo "Uploaded. $URL"
