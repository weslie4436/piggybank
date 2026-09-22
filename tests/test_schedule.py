"""Tests for allowance schedule calculation."""

from __future__ import annotations

import unittest
from datetime import date, datetime, timezone

from piggybank.schedule import (
    due_at,
    eligible_periods,
    next_allowance_at,
    period_key,
    starter_effective_date,
)


def rule(
    rule_id: int,
    amount: int,
    period: str,
    effective_date: date,
    *,
    weekday: int | None = None,
    monthday: int | None = None,
) -> dict:
    return {
        "id": rule_id,
        "amount": amount,
        "period": period,
        "weekday": weekday,
        "monthday": monthday,
        "effective_date": effective_date.isoformat(),
    }


class TestSchedule(unittest.TestCase):
    def test_period_key_is_due_date_iso_string(self):
        self.assertEqual(period_key(date(2026, 9, 21)), "2026-09-21")

    def test_naive_now_raises(self):
        with self.assertRaises(ValueError):
            eligible_periods([], [], datetime(2026, 9, 21, 12, 0))

    def test_daily_spans_dates_with_on_time_and_makeup(self):
        periods = eligible_periods(
            [rule(1, 30, "daily", date(2026, 9, 19))],
            [],
            datetime(2026, 9, 20, 16, 30, tzinfo=timezone.utc),
        )

        self.assertEqual(
            [
                ("2026-09-19", "makeup"),
                ("2026-09-20", "makeup"),
            ],
            [(item["period_key"], item["claim_kind"]) for item in periods],
        )

    def test_daily_becomes_claimable_at_four_pm_taipei(self):
        rules = [rule(1, 30, "daily", date(2026, 9, 19))]
        before = eligible_periods(
            rules,
            [],
            datetime(2026, 9, 21, 7, 59, tzinfo=timezone.utc),
        )
        self.assertEqual(
            ["2026-09-19", "2026-09-20"],
            [item["period_key"] for item in before],
        )
        periods = eligible_periods(
            rules,
            [],
            datetime(2026, 9, 21, 8, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(
            [
                ("2026-09-19", "makeup"),
                ("2026-09-20", "makeup"),
                ("2026-09-21", "on_time"),
            ],
            [(item["period_key"], item["claim_kind"]) for item in periods],
        )
        nxt = next_allowance_at(
            rules,
            {"2026-09-19", "2026-09-20", "2026-09-21"},
            datetime(2026, 9, 21, 8, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(due_at(date(2026, 9, 22)), nxt)

    def test_starter_effective_date_opens_seven_default_days(self):
        after_reset = datetime(2026, 9, 22, 8, 0, tzinfo=timezone.utc)
        start = starter_effective_date(after_reset)
        self.assertEqual(date(2026, 9, 16), start)
        opened = eligible_periods(
            [rule(1, 30, "daily", start)],
            [],
            after_reset,
        )
        self.assertEqual(7, len(opened))
        self.assertTrue(all(item["amount"] == 30 for item in opened))
        self.assertEqual("2026-09-22", opened[-1]["period_key"])

        before_reset = datetime(2026, 9, 22, 7, 59, tzinfo=timezone.utc)
        earlier = starter_effective_date(before_reset)
        self.assertEqual(date(2026, 9, 15), earlier)
        waiting = eligible_periods(
            [rule(1, 30, "daily", earlier)],
            [],
            before_reset,
        )
        self.assertEqual(7, len(waiting))
        self.assertEqual(
            ["2026-09-15", "2026-09-21"],
            [waiting[0]["period_key"], waiting[-1]["period_key"]],
        )

    def test_weekly_only_produces_selected_weekday(self):
        periods = eligible_periods(
            [
                rule(
                    1,
                    50,
                    "weekly",
                    date(2026, 9, 14),
                    weekday=0,
                )
            ],
            [],
            datetime(2026, 9, 21, 7, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(
            [date(2026, 9, 14)],
            [item["due_date"] for item in periods],
        )

    def test_monthly_only_produces_selected_monthday(self):
        periods = eligible_periods(
            [
                rule(
                    1,
                    80,
                    "monthly",
                    date(2026, 8, 1),
                    monthday=15,
                )
            ],
            [],
            datetime(2026, 9, 21, 7, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(
            [date(2026, 8, 15), date(2026, 9, 15)],
            [item["due_date"] for item in periods],
        )

    def test_new_rule_only_changes_due_dates_from_its_effective_date(self):
        periods = eligible_periods(
            [
                rule(1, 10, "daily", date(2026, 9, 18)),
                rule(2, 25, "daily", date(2026, 9, 20)),
            ],
            [],
            datetime(2026, 9, 21, 7, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(
            [
                ("2026-09-18", 1, 10),
                ("2026-09-19", 1, 10),
                ("2026-09-20", 2, 25),
            ],
            [
                (item["period_key"], item["rule_id"], item["amount"])
                for item in periods
            ],
        )

    def test_claimed_keys_are_excluded_and_results_are_oldest_first(self):
        periods = eligible_periods(
            [
                rule(2, 25, "daily", date(2026, 9, 20)),
                rule(1, 10, "daily", date(2026, 9, 18)),
            ],
            {"2026-09-20"},
            datetime(2026, 9, 21, 7, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(
            ["2026-09-18", "2026-09-19"],
            [item["period_key"] for item in periods],
        )


if __name__ == "__main__":
    unittest.main()
