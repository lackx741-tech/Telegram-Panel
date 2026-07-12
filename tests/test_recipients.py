"""
Unit tests for recipient management and CSV import.
"""
import pytest

from src.recipients import (
    STATUS_FAILED,
    STATUS_PENDING,
    STATUS_SENT,
    Recipient,
    RecipientList,
    parse_recipients_csv,
)


class TestRecipient:
    def test_username_normalized(self):
        r = Recipient(username="@alex")
        assert r.username == "alex"
        assert r.key == "u:alex"

    def test_phone_key_when_no_username(self):
        r = Recipient(phone="+123456789")
        assert r.key == "p:+123456789"

    def test_invalid_without_username_or_phone(self):
        r = Recipient(first_name="Alex")
        assert r.is_valid is False
        assert r.key == ""

    def test_mark_sent_and_failed(self):
        r = Recipient(username="alex")
        r.mark_sent(account_id=5)
        assert r.status == STATUS_SENT and r.account_id == 5
        r.mark_failed("FloodWait", account_id=7)
        assert r.status == STATUS_FAILED
        assert r.error_message == "FloodWait" and r.account_id == 7

    def test_context_for_template(self):
        r = Recipient(username="alex", first_name="Alex")
        ctx = r.context()
        assert ctx["username"] == "alex"
        assert ctx["first_name"] == "Alex"


class TestParseCsv:
    def test_basic(self):
        csv_text = "username,first_name\n@alex,Alex\nbob,Bob\n"
        recipients = parse_recipients_csv(csv_text)
        assert len(recipients) == 2
        assert recipients[0].username == "alex"
        assert recipients[0].first_name == "Alex"
        assert recipients[0].source == "csv"

    def test_custom_column_map(self):
        csv_text = "handle,name\n@alex,Alex\n"
        recipients = parse_recipients_csv(
            csv_text, column_map={"handle": "username", "name": "first_name"}
        )
        assert recipients[0].username == "alex"
        assert recipients[0].first_name == "Alex"

    def test_skips_invalid_rows(self):
        csv_text = "username,first_name\n,NoUser\nalex,Alex\n"
        recipients = parse_recipients_csv(csv_text)
        assert len(recipients) == 1
        assert recipients[0].username == "alex"

    def test_phone_only_row_valid(self):
        csv_text = "username,phone\n,+123\n"
        recipients = parse_recipients_csv(csv_text)
        assert len(recipients) == 1
        assert recipients[0].phone == "+123"

    def test_empty_content(self):
        assert parse_recipients_csv("") == []
        assert parse_recipients_csv("   ") == []


class TestRecipientList:
    def test_add_and_dedup(self):
        rl = RecipientList()
        assert rl.add_manual(username="alex") is True
        assert rl.add_manual(username="@alex") is False  # duplicate after norm
        assert len(rl) == 1

    def test_add_invalid_rejected(self):
        rl = RecipientList()
        assert rl.add_manual(first_name="NoTarget") is False
        assert len(rl) == 0

    def test_add_from_csv(self):
        rl = RecipientList()
        added = rl.add_from_csv("username\nalex\nbob\nalex\n")
        assert added == 2
        assert len(rl) == 2

    def test_add_from_audience(self):
        rl = RecipientList()
        rows = [
            {"username": "alex", "first_name": "Alex"},
            {"phone": "+1", "first_name": "Bob"},
            {"first_name": "NoTarget"},  # invalid, skipped
        ]
        assert rl.add_from_audience(rows) == 2

    def test_status_queries_and_reset(self):
        rl = RecipientList()
        rl.add_manual(username="a")
        rl.add_manual(username="b")
        rl.add_manual(username="c")
        a, b, c = list(rl)
        a.mark_sent()
        b.mark_failed("err")
        assert len(rl.pending()) == 1
        assert len(rl.sent()) == 1
        assert len(rl.failed()) == 1
        assert rl.reset_failed() == 1
        assert len(rl.pending()) == 2
        assert len(rl.failed()) == 0

    def test_stats(self):
        rl = RecipientList()
        rl.add_manual(username="a")
        rl.add_manual(username="b")
        list(rl)[0].mark_sent()
        stats = rl.stats()
        assert stats == {"total": 2, "pending": 1, "sent": 1, "failed": 0}
