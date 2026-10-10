.PHONY: install lint format typecheck test synth bundle prove local local-api deploy-diff deploy-site smoke

install:
	npm install

lint:
	npm run lint

format:
	npm run format

typecheck:
	npm run typecheck

test:
	npm test

# The stack must build, and its assertion tests (every wait has a timeout, caps exist) run in `make test`.
synth:
	cd infra && npx cdk synth --quiet

# The deployed app must hold no prototype code (device frames, scenarios, the tour); the prototype build must still have it.
bundle:
	npm run build -w @vayu/web
	npm run build:demo -w @vayu/web
	node scripts/check-bundle.mjs

# One command that proves the claims: lint, types, tests and the stack, and it fails closed.
prove: lint typecheck test synth bundle
	@echo "prove: lint, types, tests, cdk synth and the bundle check passed"

# ---- AWS (only run these on purpose: they touch a real account) ----
# Read what would change before anything is deployed.
deploy-diff:
	cd infra && AWS_PROFILE=vayu npx cdk diff

# A live check of a deployed address: make smoke LIVE_URL=https://...
smoke:
	npx tsx tests/smoke/live.ts $(LIVE_URL)

# Put the built app on S3 behind CloudFront (after `cdk deploy` has made the bucket): AWS_PROFILE=vayu make deploy-site
deploy-site:
	scripts/deploy-site.sh

# The whole app on your own machine, on real air data when OPENAQ_API_KEY is set (otherwise fixtures, labelled).
#   terminal 1: make local-api        terminal 2: make local
local-api:
	npx tsx scripts/dev-api.mts
local:
	VITE_API_URL=http://localhost:8787 npm run dev -w @vayu/web
