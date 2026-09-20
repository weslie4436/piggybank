"""Allowance due-date calculation in vault time."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Collection, Mapping, Sequence
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")


def period_key(due_date: date) -> str:
    return due_date.isoformat()


def eligible_periods(
    rules: Sequence[Mapping[str, Any]],
    claimed_keys: Collection[str],
    now: datetime,
) -> list[dict[str, Any]]:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")

    dated_rules = sorted(
        (
            (
                value
                if isinstance(value := rule["effective_date"], date)
                else date.fromisoformat(value),
                int(rule["id"]),
                rule,
            )
            for rule in rules
        ),
        key=lambda item: (item[0], item[1]),
    )
    if not dated_rules:
        return []

    today = now.astimezone(TAIPEI).date()
    claimed = set(claimed_keys)
    due = dated_rules[0][0]
    result: list[dict[str, Any]] = []
    while due <= today:
        active = next(
            item
            for item in reversed(dated_rules)
            if item[0] <= due
        )[2]
        is_due = (
            active["period"] == "daily"
            or (
                active["period"] == "weekly"
                and due.weekday() == active["weekday"]
            )
            or (
                active["period"] == "monthly"
                and due.day == active["monthday"]
            )
        )
        key = period_key(due)
        if is_due and key not in claimed:
            result.append(
                {
                    "period_key": key,
                    "rule_id": active["id"],
                    "amount": active["amount"],
                    "due_date": due,
                    "claim_kind": "on_time" if due == today else "makeup",
                }
            )
        due += timedelta(days=1)
    return result
