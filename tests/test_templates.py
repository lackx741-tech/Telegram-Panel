"""
Unit tests for message templates and variable substitution.
"""
import os

import pytest

from src.templates import (
    MessageTemplate,
    TemplateStore,
    extract_variables,
    substitute,
)


class TestSubstitute:
    def test_basic_substitution(self):
        out = substitute("Hi {first_name}!", {"first_name": "Alex"})
        assert out == "Hi Alex!"

    def test_multiple_variables(self):
        out = substitute(
            "Hi {first_name} (@{username})",
            {"first_name": "Alex", "username": "alexg"},
        )
        assert out == "Hi Alex (@alexg)"

    def test_unknown_kept_by_default(self):
        out = substitute("Hi {first_name} {missing}", {"first_name": "Alex"})
        assert out == "Hi Alex {missing}"

    def test_unknown_blanked_when_requested(self):
        out = substitute(
            "Hi {first_name}{missing}", {"first_name": "Alex"}, keep_unknown=False
        )
        assert out == "Hi Alex"

    def test_spintax_group_untouched(self):
        # A spintax group contains '|' and must not be treated as a variable.
        out = substitute("Hi {first_name}, {hello|hi}", {"first_name": "Alex"})
        assert out == "Hi Alex, {hello|hi}"

    def test_none_value_becomes_empty(self):
        out = substitute("Hi {first_name}", {"first_name": None})
        assert out == "Hi "

    def test_empty_input(self):
        assert substitute("", {"a": "b"}) == ""


class TestExtractVariables:
    def test_extract(self):
        assert extract_variables("Hi {first_name} @{username}") == [
            "first_name",
            "username",
        ]

    def test_dedup_preserves_order(self):
        assert extract_variables("{a} {b} {a}") == ["a", "b"]

    def test_ignores_spintax(self):
        assert extract_variables("{a|b} {name}") == ["name"]

    def test_no_variables(self):
        assert extract_variables("plain text") == []


class TestMessageTemplate:
    def test_variables_derived(self):
        t = MessageTemplate("1", "Greeting", "Hi {first_name}!")
        assert t.variables == ["first_name"]

    def test_render(self):
        t = MessageTemplate("1", "Greeting", "Hi {first_name}!")
        assert t.render({"first_name": "Sam"}) == "Hi Sam!"

    def test_roundtrip_dict(self):
        t = MessageTemplate("1", "Greeting", "Hi {name}", category="promo")
        restored = MessageTemplate.from_dict(t.to_dict())
        assert restored.name == "Greeting"
        assert restored.content == "Hi {name}"
        assert restored.category == "promo"


class TestTemplateStore:
    def test_create_and_get(self, tmp_path):
        store = TemplateStore(str(tmp_path / "templates.json"))
        created = store.create("Welcome", "Hi {first_name}", category="onboarding")
        assert created.id == "1"
        fetched = store.get("1")
        assert fetched is not None
        assert fetched.name == "Welcome"
        assert fetched.variables == ["first_name"]

    def test_list_and_filter_by_category(self, tmp_path):
        store = TemplateStore(str(tmp_path / "templates.json"))
        store.create("A", "x", category="promo")
        store.create("B", "y", category="news")
        assert len(store.list()) == 2
        assert [t.name for t in store.list(category="promo")] == ["A"]

    def test_update(self, tmp_path):
        store = TemplateStore(str(tmp_path / "templates.json"))
        t = store.create("A", "old")
        updated = store.update(t.id, content="new {name}")
        assert updated is not None
        assert updated.content == "new {name}"
        assert updated.variables == ["name"]

    def test_update_missing_returns_none(self, tmp_path):
        store = TemplateStore(str(tmp_path / "templates.json"))
        assert store.update("999", name="x") is None

    def test_delete(self, tmp_path):
        store = TemplateStore(str(tmp_path / "templates.json"))
        t = store.create("A", "x")
        assert store.delete(t.id) is True
        assert store.get(t.id) is None
        assert store.delete(t.id) is False

    def test_persistence_across_instances(self, tmp_path):
        path = str(tmp_path / "templates.json")
        store = TemplateStore(path)
        store.create("A", "Hi {name}")
        # A fresh store loading the same file should see the template and keep
        # assigning fresh ids.
        reopened = TemplateStore(path)
        assert len(reopened.list()) == 1
        second = reopened.create("B", "y")
        assert second.id == "2"
        assert os.path.exists(path)
