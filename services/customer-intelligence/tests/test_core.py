import pytest
from pydantic import ValidationError
from app.crypto_utils import normalize_email, normalize_phone, sha256_identifier
from app.schemas import TrackingEventIn
from app.auditor import menu_schema_check, directory_check


def test_hashing_is_normalized_and_deterministic():
    assert normalize_email(" Guest@Example.COM ") == "guest@example.com"
    assert normalize_phone("(785) 555-1212") == "+7855551212"
    assert sha256_identifier(" Guest@Example.COM ") == sha256_identifier("guest@example.com")
    assert len(sha256_identifier("guest@example.com")) == 64


def test_clickstream_rejects_personal_identifiers():
    with pytest.raises(ValidationError):
        TrackingEventIn(
            tenant_id="11111111-1111-1111-1111-111111111111",
            property_id="22222222-2222-2222-2222-222222222222",
            idempotency_key="unique-event-001",
            event_name="Viewed_Menu",
            anonymous_id="anonymous-001",
            properties={"email": "guest@example.com"},
        )


def test_menu_schema_reports_missing_fields():
    check = menu_schema_check({"@context": "https://schema.org", "@type": "Menu"})
    assert check.status == "NEEDS_WORK"
    assert "name" in check.detail


def test_directory_audit_is_deterministic():
    check = directory_check("https://hotel.example", [{
        "website": "https://hotel.example", "name": "Hotel", "address": "1 Main", "phone": "555", "hours": "24/7"
    }])
    assert check.status == "PASS"
    assert check.score == 100
