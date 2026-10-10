.PHONY: install lint format typecheck test synth prove deploy-diff smoke

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

# One command that proves the claims: lint, types, tests and the stack, and it fails closed.
prove: lint typecheck test synth
	@echo "prove: lint, types, tests and cdk synth passed"

# ---- AWS (only run these on purpose: they touch a real account) ----
# Read what would change before anything is deployed.
deploy-diff:
	cd infra && AWS_PROFILE=vayu npx cdk diff

# A live check of a deployed address: make smoke LIVE_URL=https://...
smoke:
	npx tsx tests/smoke/live.ts $(LIVE_URL)
