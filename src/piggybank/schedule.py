"""Allowance due-date calculation in vault time."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Collection, Mapping, Sequence
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")
ALLOWANCE_HOUR = 19


def period_key(due_date: date) -> str:
    return due_date.isoformat()


def due_at(due_date: date) -> datetime:
    return datetime.combine(due_date, time(ALLOWANCE_HOUR), tzinfo=TAIPEI)


def _sorted_rules(
    rules: Sequence[Mapping[str, Any]],
) -> list[tuple[date, int, Mapping[str, Any]]]:
    return sorted(
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


def _active_rule(
    dated_rules: Sequence[tuple[date, int, Mapping[str, Any]]],
    due: date,
) -> Mapping[str, Any]:
    return next(
        item for item in reversed(dated_rules) if item[0] <= due
    )[2]


def _rule_is_due(active: Mapping[str, Any], due: date) -> bool:
    return (
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


def eligible_periods(
    rules: Sequence[Mapping[str, Any]],
    claimed_keys: Collection[str],
    now: datetime,
) -> list[dict[str, Any]]:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")

    dated_rules = _sorted_rules(rules)
    if not dated_rules:
        return []

    current = now.astimezone(TAIPEI)
    today = current.date()
    claimed = set(claimed_keys)
    due = dated_rules[0][0]
    result: list[dict[str, Any]] = []
    while due_at(due) <= current:
        active = _active_rule(dated_rules, due)
        key = period_key(due)
        if _rule_is_due(active, due) and key not in claimed:
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


def next_allowance_at(
    rules: Sequence[Mapping[str, Any]],
    claimed_keys: Collection[str],
    now: datetime,
) -> datetime | None:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be timezone-aware")

    dated_rules = _sorted_rules(rules)
    if not dated_rules:
        return None

    current = now.astimezone(TAIPEI)
    claimed = set(claimed_keys)
    due = dated_rules[0][0]
    limit = current.date() + timedelta(days=400)
    while due <= limit:
        moment = due_at(due)
        if moment > current:
            active = _active_rule(dated_rules, due)
            if _rule_is_due(active, due) and period_key(due) not in claimed:
                return moment
        due += timedelta(days=1)
    return None
