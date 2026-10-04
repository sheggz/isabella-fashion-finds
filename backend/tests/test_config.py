import pytest

from app.core.config import ENV_FILE, Settings


def test_env_file_points_at_the_project_root():
    assert ENV_FILE.name == ".env"
    assert (ENV_FILE.parent / "backend").is_dir()


def test_settings_read_database_url_from_the_environment(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h/db")
    assert Settings(_env_file=None).database_url == "postgresql://u:p@h/db"


@pytest.mark.parametrize(
    ("fmt", "env", "expected"),
    [
        ("auto", "production", True),
        ("auto", "development", False),
        ("json", "development", True),
        ("text", "production", False),
    ],
)
def test_log_format_auto_means_json_in_production_text_elsewhere(fmt, env, expected):
    settings = Settings(_env_file=None, log_format=fmt, app_env=env)
    assert settings.log_json is expected


def test_owner_emails_are_parsed_and_normalised(monkeypatch):
    monkeypatch.setenv("OWNER_EMAILS", " A@x.com, b@y.com ,")
    assert Settings(_env_file=None).owner_email_list == ["a@x.com", "b@y.com"]


def test_tests_get_their_settings_from_the_fixture_and_never_from_a_local_env_file():
    # Guard: if the hermetic fixture is removed, tests would again pass on a developer's machine
    # (which has a real .env) and fail in CI (which has none).
    from app.core.config import get_settings

    settings = get_settings()
    assert settings.database_url == "postgresql://test:test@localhost:1/test"
    assert settings.session_secret == "t" * 48
    assert settings.supabase_url == "https://test.supabase.co"
