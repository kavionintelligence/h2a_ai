"""False-positive and provenance regressions for the detection policy."""

from datetime import UTC, datetime, timedelta

import pytest

from agent_census.detection import (
    classify,
    fingerprint,
    infer_capabilities,
    parse_otlp,
    required_capabilities,
    resolve_identity,
    runtime_candidates,
    shadow_decision,
)
from agent_census.models import AgentRecord, Candidate, Evidence, RuntimeEvent

STAMP = datetime(2020, 1, 1, tzinfo=UTC)


def candidate(**changes):
    values = {"candidate_id": "one", "name": "one", "source": "test", "observed_at": STAMP}
    values.update(changes)
    return Candidate(**values)


def behavioral(*kinds):
    return candidate(
        evidence=[
            Evidence(kind=kind, source="otel", observed_at=STAMP, event_id=str(idx))
            for idx, kind in enumerate(kinds)
        ]
    )


def record(observation, registered=False):
    fp = fingerprint([observation])
    result = classify(fp, [observation])
    return AgentRecord(
        agent_id="AGT-test",
        name="one",
        discovery_sources=[observation.source],
        first_seen=STAMP,
        last_seen=STAMP,
        confidence=result.confidence,
        evidence=fp.evidence,
        fingerprint=fp,
        classification=result,
        registered=registered,
    )


def test_unknown_fingerprint_values_stay_unknown():
    fp = fingerprint(
        [
            candidate(
                model="known-model",
                tools=["secret_scanner"],
                metadata={"planning": True, "autonomous": True},
            )
        ]
    )
    assert fp.models == ["known-model"]
    assert fp.llm_interaction is None
    assert fp.tool_usage is None
    assert fp.planning is None
    assert fp.owner is None
    assert fp.first_seen == fp.last_seen == STAMP


@pytest.mark.parametrize(
    "observation,expected",
    [
        (candidate(protocols=["mcp"], tools=["secret_scanner"]), "mcp_server"),
        (candidate(entity_hint="api"), "api"),
        (candidate(entity_hint="microservice"), "traditional_microservice"),
        (behavioral("llm_call"), "llm_wrapper"),
        (behavioral("llm_call", "tool_call"), "ai_enabled_application"),
    ],
)
def test_weak_signals_are_not_agents(observation, expected):
    result = classify(fingerprint([observation]), [observation])
    assert not result.is_agent
    assert result.entity_type == expected
    assert not shadow_decision(record(observation))


def test_static_llm_workflow_is_not_automatically_an_agent():
    observation = behavioral("llm_call", "tool_call", "multi_step", "memory_access")
    observation.entity_hint = "workflow"
    result = classify(fingerprint([observation]), [observation])
    assert result.entity_type == "workflow"
    assert not result.is_agent


def test_agent_card_and_registration_alone_are_uncertain():
    observation = behavioral("agent_card", "manual_registration")
    observation.registration_id = "approved-registration"
    result = classify(fingerprint([observation]), [observation])
    assert not result.is_agent
    assert result.classification == "uncertain"


def test_repeated_weak_events_do_not_raise_the_score():
    one = behavioral("llm_call")
    many = behavioral(*(["llm_call"] * 100))
    assert (
        classify(fingerprint([one]), [one]).confidence
        == classify(fingerprint([many]), [many]).confidence
    )


def test_behavior_and_declaration_corroborate_a_confirmed_agent():
    observation = behavioral("llm_call", "tool_call", "planning", "memory_access", "agent_card")
    result = classify(fingerprint([observation]), [observation])
    assert result.is_agent
    assert result.classification == "confirmed_agent"
    assert "not a calibrated probability" in result.score_semantics
    assert shadow_decision(record(observation))
    assert not shadow_decision(record(observation, registered=True))


def test_runtime_behavior_without_declaration_is_probable():
    observation = behavioral("llm_call", "tool_call", "autonomous_action")
    result = classify(fingerprint([observation]), [observation])
    assert result.classification == "probable_agent"
    assert shadow_decision(record(observation))


def test_explicit_subtypes_require_positive_behavior():
    observation = behavioral("llm_call", "tool_call", "delegation")
    observation.entity_hint = "multi_agent_system"
    assert classify(fingerprint([observation]), [observation]).entity_type == "multi_agent_system"
    observation.entity_hint = "dynamic_sub_agent"
    assert classify(fingerprint([observation]), [observation]).entity_type == "dynamic_sub_agent"
    weak = candidate(entity_hint="dynamic_sub_agent")
    assert not classify(fingerprint([weak]), [weak]).is_agent


def test_evidence_can_be_aggregated_across_sources():
    first = behavioral("llm_call", "tool_call")
    second = candidate(
        candidate_id="two",
        source="instrumentation",
        evidence=[
            Evidence(kind="planning", source="instrumentation", observed_at=STAMP),
            Evidence(kind="memory_access", source="instrumentation", observed_at=STAMP),
        ],
    )
    fp = fingerprint([first, second])
    assert classify(fp, [first, second]).is_agent
    assert fp.discovery_sources == ["instrumentation", "otel", "test"]
    assert len(fp.evidence) == 4


def test_conflicting_fingerprint_metadata_is_not_arbitrarily_selected():
    fp = fingerprint([candidate(owner="team-one"), candidate(owner="team-two")])
    assert fp.owner is None


def test_endpoint_normalization_and_path_boundaries():
    previous = candidate(endpoint="https://Example.com:443")
    decision = resolve_identity(
        candidate(candidate_id="new", source="a2a", endpoint="https://example.com/"),
        [("AGT-one", previous)],
    )
    assert decision.merged and decision.canonical_agent_id == "AGT-one"
    assert decision.evidence[0]["signal"] == "same_endpoint"
    other_path = candidate(candidate_id="new", source="a2a", endpoint="https://example.com/other")
    assert not resolve_identity(other_path, [("AGT-one", previous)]).merged


def test_name_or_hostname_only_does_not_merge():
    first = candidate(endpoint="http://same.test:8000/a")
    second = candidate(source="other", candidate_id="two", endpoint="http://same.test:9000/a")
    assert first.name == second.name
    assert not resolve_identity(second, [("AGT-one", first)]).merged


def test_full_workload_identity_merges_but_service_name_alone_does_not():
    previous = candidate(namespace="prod", service="security", deployment="security-v1")
    observed = candidate(
        source="runtime",
        candidate_id="two",
        namespace="prod",
        service="security",
        deployment="security-v1",
    )
    assert resolve_identity(observed, [("AGT-one", previous)]).merged
    observed.deployment = None
    assert not resolve_identity(observed, [("AGT-one", previous)]).merged


def test_conflicting_registration_cannot_merge_through_unregistered_alias():
    endpoint = "local://one"
    registered = candidate(registration_id="A", endpoint=endpoint)
    alias = candidate(source="otel", candidate_id="alias", endpoint=endpoint)
    other = candidate(source="manual", candidate_id="new", endpoint=endpoint, registration_id="B")
    decision = resolve_identity(other, [("AGT-one", registered), ("AGT-one", alias)])
    assert not decision.merged
    assert any("registration IDs" in item for item in decision.conflicts)


def test_conflicting_namespaces_and_ambiguous_matches_require_review():
    previous = candidate(endpoint="local://one", namespace="prod")
    other = candidate(candidate_id="new", source="other", endpoint="local://one", namespace="dev")
    assert not resolve_identity(other, [("AGT-one", previous)]).merged
    other.namespace = "prod"
    decision = resolve_identity(other, [("AGT-one", previous), ("AGT-two", previous)])
    assert not decision.merged
    assert "ambiguous" in decision.conflicts[-1]


def test_capability_provenance_and_closed_tool_mapping():
    observation = candidate(
        skills=["code_security"],
        tools=["secret_scanner", "some_secret_like_name"],
        evidence=[
            Evidence(
                kind="tool_call",
                source="runtime",
                value="secret_scanner",
                observed_at=STAMP,
                event_id="event-one",
            )
        ],
    )
    capabilities = infer_capabilities([observation])
    index = {(cap.name, cap.basis): cap for cap in capabilities}
    assert ("code_security", "declared") in index
    assert ("code_security", "inferred") in index
    assert ("tool:secret_scanner", "observed") in index
    assert index["code_security", "inferred"].confidence == 0.85
    assert all(cap.evidence for cap in capabilities)
    unknown = infer_capabilities([candidate(tools=["some_secret_like_name"])])
    assert unknown == []


def test_unknown_invoked_tool_is_observed_but_not_given_semantic_capabilities():
    observation = candidate(
        evidence=[
            Evidence(
                kind="tool_call", source="runtime", value="send_email_preview", observed_at=STAMP
            )
        ]
    )
    capabilities = infer_capabilities([observation])
    assert [(cap.name, cap.basis) for cap in capabilities] == [
        ("tool:send_email_preview", "observed")
    ]


def test_runtime_identity_timestamp_replay_and_metadata_are_safe():
    event = RuntimeEvent(
        event_id="id-1",
        timestamp=STAMP,
        service="worker",
        namespace="prod",
        deployment="worker",
        event_type="llm_call",
        model="mock-model",
        metadata={"planning": True, "owner": "invented-owner"},
    )
    tool = RuntimeEvent(
        event_id="id-2",
        timestamp=STAMP + timedelta(seconds=1),
        service="worker",
        namespace="prod",
        deployment="worker",
        event_type="tool_call",
        tool="secret_scanner",
    )
    first = runtime_candidates([event])[0]
    combined = runtime_candidates(
        [event, tool, event.model_copy(update={"timestamp": STAMP + timedelta(days=1)})]
    )[0]
    assert first.candidate_id == combined.candidate_id
    assert len(combined.evidence) == 2
    assert combined.observed_at == tool.timestamp
    assert combined.owner is None
    assert fingerprint([combined]).planning is None
    tool.namespace = "dev"
    assert len(runtime_candidates([event, tool])) == 2


def attr(key, value):
    return {"key": key, "value": {"stringValue": value}}


def otlp(operation="chat"):
    return {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": [
                        attr("service.name", "worker"),
                        attr("k8s.namespace.name", "prod"),
                        attr("k8s.deployment.name", "worker"),
                        attr("authorization", "DO_NOT_STORE"),
                    ]
                },
                "scopeSpans": [
                    {
                        "spans": [
                            {
                                "traceId": "a" * 32,
                                "spanId": "b" * 16,
                                "startTimeUnixNano": "1577836800000000000",
                                "attributes": [
                                    attr("gen_ai.operation.name", operation),
                                    attr("gen_ai.request.model", "mock-model"),
                                    attr("gen_ai.tool.name", "secret_scanner"),
                                    attr("gen_ai.input.messages", "PRIVATE_PROMPT"),
                                ],
                            }
                        ]
                    }
                ],
            }
        ]
    }


def test_otlp_safe_subset_real_timestamp_and_replay_id():
    payload = otlp()
    first = parse_otlp(payload)[0]
    assert first.event_type == "llm_call"
    assert first.service == "worker"
    assert first.namespace == "prod"
    assert first.timestamp == STAMP
    assert first.event_id == parse_otlp(payload)[0].event_id
    assert first.tool is None
    serialized = first.model_dump_json()
    assert "DO_NOT_STORE" not in serialized
    assert "PRIVATE_PROMPT" not in serialized
    assert parse_otlp(otlp("execute_tool"))[0].tool == "secret_scanner"


def test_otlp_unknown_operation_is_not_invented_into_behavior():
    assert parse_otlp(otlp("invoke_workflow")) == []
    assert parse_otlp(otlp("some_llm_sounding_operation")) == []


def test_otlp_explicit_custom_event_extension():
    payload = otlp()
    span = payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0]
    span["events"] = [
        {"name": "agent_census.planning", "timeUnixNano": "1577836801000000000"},
        {"name": "agent_census.invented", "timeUnixNano": "1577836801000000000"},
        {"name": "tool selection", "timeUnixNano": "1577836801000000000"},
    ]
    events = parse_otlp(payload)
    assert [event.event_type for event in events] == ["llm_call", "planning"]
    assert events[1].timestamp == STAMP + timedelta(seconds=1)


@pytest.mark.parametrize(
    "field,value", [("startTimeUnixNano", None), ("traceId", "invalid"), ("spanId", "invalid")]
)
def test_otlp_invalid_relevant_span_rejected_without_fabricating_time(field, value):
    payload = otlp()
    payload["resourceSpans"][0]["scopeSpans"][0]["spans"][0][field] = value
    with pytest.raises(ValueError):
        parse_otlp(payload)


def test_otlp_duplicate_identity_attribute_rejected():
    payload = otlp()
    payload["resourceSpans"][0]["resource"]["attributes"].append(attr("service.name", "second"))
    with pytest.raises(ValueError, match="duplicate"):
        parse_otlp(payload)


@pytest.mark.parametrize(
    "task,expected",
    [
        ("Find agents capable of code security.", ["code_security"]),
        ("Find agents that can analyse GitHub repositories.", ["repository_analysis"]),
        ("Find agents that can perform image classification.", ["image_classification"]),
        ("Find agents that can send email.", ["email_delivery"]),
        ("Tell me a joke about an emailer", []),
        ("unknown task", []),
        ("Find agents using MCP", []),
    ],
)
def test_explicit_task_vocabulary_does_not_match_unknown_words(task, expected):
    assert required_capabilities(task) == expected
