.PHONY: install lint format typecheck test prove

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

# One command that proves the claims: lint, types and tests, and it fails closed.
prove: lint typecheck test
	@echo "prove: lint, types and tests passed"
