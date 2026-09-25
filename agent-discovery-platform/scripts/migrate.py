"""Apply the idempotent schema v1 bootstrap; no seed credentials or network targets."""

from agent_census.config import Settings
from agent_census.storage import Store


def main() -> None:
    store = Store(Settings.from_env().database_url)
    assert store.ready()
    store.engine.dispose()
    print("Schema version 1 is ready.")


if __name__ == "__main__":
    main()
