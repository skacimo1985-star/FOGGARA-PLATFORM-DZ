"""Standalone guard tests: no application import, database connection or deletion."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tests.database_safety import validate_test_database_url


class DatabaseSafetyTests(unittest.TestCase):
    def test_accepts_current_ci_loopback_target(self):
        for host in ("localhost", "127.0.0.1", "[::1]"):
            for name in ("foggara_test", "foggara_test_gis", "test_foggara"):
                url = f"postgresql+psycopg://postgres@{host}:5432/{name}"
                with self.subTest(host=host, name=name):
                    self.assertEqual(validate_test_database_url(url), url)

    def test_rejects_remote_and_implicit_hosts_even_with_legacy_opt_in(self):
        with patch.dict(os.environ, {"ALLOW_DESTRUCTIVE_POSTGRES_TESTS": "yes"}):
            for url in ("postgresql://postgres@example.invalid/foggara_test",
                        "postgresql:///foggara_test", "postgresql://postgres@db/foggara_test"):
                with self.subTest(url=url), self.assertRaises(RuntimeError):
                    validate_test_database_url(url)

    def test_rejects_host_overrides_and_service_files(self):
        for query in ("host=example.invalid", "hostaddr=192.0.2.1", "service=production",
                      "host=%2Ftmp", "sslmode=require"):
            with self.subTest(query=query), self.assertRaises(RuntimeError):
                validate_test_database_url(f"postgresql://postgres@localhost/foggara_test?{query}")

    def test_rejects_non_test_databases(self):
        for name in ("postgres", "foggara", "production", "test", "not-test"):
            with self.subTest(name=name), self.assertRaises(RuntimeError):
                validate_test_database_url(f"postgresql://postgres@localhost/{name}")

    def test_accepts_new_temporary_sqlite_file_without_creating_it(self):
        with tempfile.TemporaryDirectory(prefix="foggara-tests-") as directory:
            target = Path(directory) / "isolated_test.db"
            url = "sqlite:///" + str(target)
            self.assertEqual(validate_test_database_url(url), url)
            self.assertFalse(target.exists())

    def test_preserves_existing_sqlite_bytes(self):
        with tempfile.TemporaryDirectory(prefix="foggara-tests-") as directory:
            target = Path(directory) / "isolated_test.db"
            target.write_bytes(b"existing database sentinel")
            with self.assertRaises(RuntimeError):
                validate_test_database_url("sqlite:///" + str(target))
            self.assertEqual(target.read_bytes(), b"existing database sentinel")

    def test_rejects_sqlite_memory_relative_uri_and_non_temporary_paths(self):
        for url in ("sqlite://", "sqlite:///:memory:", "sqlite:///local_test.db",
                    "sqlite:////var/lib/foggara_test.db", "sqlite:////tmp/data.db",
                    "sqlite:////tmp/isolated_test.db?uri=true", "mysql://localhost/foggara_test",
                    "", "not a URL"):
            with self.subTest(url=url), self.assertRaises(RuntimeError):
                validate_test_database_url(url)

    def test_rejects_broken_symlinks_without_touching_target(self):
        with tempfile.TemporaryDirectory(prefix="foggara-tests-") as directory:
            target = Path(directory) / "missing.db"
            link = Path(directory) / "isolated_test.db"
            link.symlink_to(target)
            with self.assertRaises(RuntimeError):
                validate_test_database_url("sqlite:///" + str(link))
            self.assertTrue(link.is_symlink())
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
