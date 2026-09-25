"""Create local secrets without logging them or overwriting existing configuration."""

import secrets
from pathlib import Path


def main() -> None:
    path = Path(".env")
    content = "\n".join(
        [
            "CENSUS_ADMIN_TOKEN=" + secrets.token_urlsafe(32),
            "CENSUS_READER_TOKEN=" + secrets.token_urlsafe(32),
            "CENSUS_INGEST_TOKEN=" + secrets.token_urlsafe(32),
            "POSTGRES_PASSWORD=" + secrets.token_urlsafe(32),
            "CENSUS_DATABASE_URL=sqlite:///./census.db",
            "CENSUS_ALLOWED_ORIGINS=",
            "CENSUS_ALLOW_PRIVATE=false",
            "CENSUS_ALLOW_HTTP=false",
            "CENSUS_MONITOR_INTERVAL_SECONDS=30",
            "",
        ]
    )
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(content)
        path.chmod(0o600)
        print("Created .env. Keep this local file private; no credentials were printed.")
    except FileExistsError:
        print(".env already exists; it was not modified.")


if __name__ == "__main__":
    main()
