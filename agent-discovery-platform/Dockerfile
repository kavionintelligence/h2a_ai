FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock pyproject.toml README.md LICENSE ./
RUN python -m pip install --no-cache-dir --require-hashes -r requirements.lock
COPY src ./src
COPY scripts ./scripts
COPY examples ./examples
RUN python -m pip install --no-cache-dir --no-deps . && \
    useradd --uid 10001 --create-home census && \
    mkdir -p /app/data /app/output/reports && chown -R census:census /app/data /app/output
USER census
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "agent_census.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
