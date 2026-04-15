.PHONY: help install dev typecheck build-ui watch-ui lint test check

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

install:  ## Install Python package in dev mode
	pip install -e ".[dev]"

dev: install  ## Install everything (Python + UI dev deps)
	cd ui && npm install

# ── Red Line Checks ─────────────────────────────────

typecheck:  ## TypeScript type checking
	cd ui && npx tsc --noEmit
	@echo "✓ TypeScript clean"

build-ui:  ## Build the React SPA into the Python package
	cd ui && npm ci && npm run build
	@echo "✓ UI built → src/riverflow/server/ui/dist/"

watch-ui:  ## Start Vite dev server with HMR
	cd ui && npm run dev

generate-types:  ## Generate TS types from running OpenAPI (server must be up)
	cd ui && npm run generate-types

# ── Quality ──────────────────────────────────────────

test:  ## Run Python tests
	python -m pytest tests/ -v

check: typecheck build-ui test  ## Full pre-commit check (TS + build + tests)
	@echo "✓ All checks passed"
