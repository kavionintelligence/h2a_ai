.PHONY: install check test demo serve
install:
	python -m pip install --require-hashes -r requirements.lock
	python -m pip install --no-deps -e .
check:
	python -m ruff format --check .
	python -m ruff check .
	python -m mypy src/agent_census
test:
	python -m pytest
demo:
	python scripts/demo.py
serve:
	python -m uvicorn agent_census.api:create_app --factory --host 127.0.0.1 --port 8000
