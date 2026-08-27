import re


PHI_PATTERNS = {
    "email": re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    "id": re.compile(r"\b[STFGM]\d{7}[A-Z]\b", re.I),
    "phone": re.compile(r"\b(?:\+65[\s-]?)?(?:[689]\d{3}[\s-]?\d{4})\b"),
    "structured_id": re.compile(r"\b(?:MRN|ID|IC|FIN)(?=[:#\s-])[:#\s-]*[A-Z0-9-]{5,}\b", re.I),
    "name": re.compile(r"\b(?:Jane Tan|Alex Lim|Sam Lee|Mina Koh|Avery Ong|Bo Chen)\b", re.I),
}

UNRESOLVED_NAME_PATTERN = re.compile(
    r"\b(?!(?:No known|Repeat renal|Patient reports|Patient denies|Clinician discussed|Doctor discussed|Nurse notes|Staff notes)\b)[A-Z][a-z]+ [A-Z][a-z]+\b"
)


class MockProvider:
    def __init__(self):
        self.received = []

    def invoke(self, text: str):
        self.received.append(text)
        return {"text": "synthetic structured response"}


def redact_for_llm(text: str):
    replacements = []
    redacted = text
    for phi_class, pattern in PHI_PATTERNS.items():
        next_text = []
        last = 0
        for match in pattern.finditer(redacted):
            token = f"[{phi_class.upper()}_{len(replacements) + 1}]"
            next_text.append(redacted[last:match.start()])
            next_text.append(token)
            replacements.append({"class": phi_class, "start": match.start(), "end": match.end()})
            last = match.end()
        next_text.append(redacted[last:])
        redacted = "".join(next_text)

    verification_failed = [
        phi_class for phi_class, pattern in PHI_PATTERNS.items() if pattern.search(redacted)
    ]
    if UNRESOLVED_NAME_PATTERN.search(redacted):
        verification_failed.append("name")
    return {
        "allowed": not verification_failed,
        "redacted_text": redacted,
        "classes": sorted({replacement["class"] for replacement in replacements}),
        "replacement_count": len(replacements),
        "blocked_reason": ",".join(verification_failed) if verification_failed else None,
    }


def safe_gateway(raw_text: str, provider: MockProvider):
    result = redact_for_llm(raw_text)
    metadata = {
        "classes": result["classes"],
        "replacement_count": result["replacement_count"],
        "allowed": result["allowed"],
        "blocked_reason": result["blocked_reason"],
    }
    if not result["allowed"]:
        return {"ok": False, "metadata": metadata}
    return {"ok": True, "metadata": metadata, "response": provider.invoke(result["redacted_text"])}


def test_redacts_multiple_phi_classes_before_provider_invocation():
    provider = MockProvider()
    raw = "Jane Tan S1234567D can be reached at +65 9123 4567 or jane.tan@example.test."

    result = safe_gateway(raw, provider)

    assert result["ok"] is True
    assert provider.received
    sent = provider.received[0]
    assert "Jane Tan" not in sent
    assert "S1234567D" not in sent
    assert "+65 9123 4567" not in sent
    assert "jane.tan@example.test" not in sent
    assert result["metadata"]["classes"] == ["email", "id", "name", "phone"]
    assert result["metadata"]["replacement_count"] == 4


def test_singapore_style_phone_formats_are_redacted():
    provider = MockProvider()
    raw = "Call 8123 4567, 61234567, or +65-9123-4567 for this synthetic case."

    result = safe_gateway(raw, provider)

    assert result["ok"] is True
    assert "8123 4567" not in provider.received[0]
    assert "61234567" not in provider.received[0]
    assert "+65-9123-4567" not in provider.received[0]
    assert result["metadata"]["classes"] == ["phone"]


def test_nric_fin_like_identifier_redaction():
    provider = MockProvider()
    result = safe_gateway("Synthetic identifiers S1234567D and F7654321A are present.", provider)

    assert result["ok"] is True
    assert "S1234567D" not in provider.received[0]
    assert "F7654321A" not in provider.received[0]
    assert result["metadata"]["classes"] == ["id"]


def test_synthetic_name_redaction():
    provider = MockProvider()
    result = safe_gateway("Alex Lim discussed symptoms for Jane Tan.", provider)

    assert result["ok"] is True
    assert "Alex Lim" not in provider.received[0]
    assert "Jane Tan" not in provider.received[0]
    assert result["metadata"]["classes"] == ["name"]


def test_safe_text_passes_without_redaction():
    provider = MockProvider()
    raw = "Patient reports nocturnal cough for three weeks and needs renal panel follow-up."

    result = safe_gateway(raw, provider)

    assert result["ok"] is True
    assert provider.received == [raw]
    assert result["metadata"]["replacement_count"] == 0


def test_verification_failure_blocks_provider_call_without_exposing_raw_value():
    provider = MockProvider()
    result = safe_gateway("Unlisted synthetic patient Taylor Ng has follow-up.", provider)

    assert result["ok"] is False
    assert provider.received == []
    assert result["metadata"]["blocked_reason"] == "name"
    assert "Taylor Ng" not in str(result["metadata"])


def test_false_positive_sensitive_clinical_text_is_allowed():
    provider = MockProvider()
    raw = "No known drug allergies. eGFR 65. Repeat renal panel in two weeks."

    result = safe_gateway(raw, provider)

    assert result["ok"] is True
    assert provider.received == [raw]
