# Multi-Account Message Sender — Core Modules

This document covers the message-sender core added under brief
*"Port Multi-Account Message Sender from Python TMMS to
Node.js/React Telegram-Panel"* and explains an important scope decision.

## Scope note: stack mismatch with the brief

The brief and its tasks were written on the assumption that this repository
(`lackx741-tech/Telegram-Panel`) is a **Node.js + React + Express + SQLite +
GramJS** web app — referencing `backend/src/services/*.js`, `better-sqlite3`,
`apiPool.js`, React components under `src/components/dashboard/`, and Python
source files under `app/core/`.

In reality this repository is a **Python + Telethon** account-management panel
(bot + interactive CLI + command CLI sharing one core service layer). None of
the Node/React/Express/GramJS infrastructure the tasks reference exists here,
and neither do the `app/core/*.py` "source" files they cite.

Rather than scaffold a disconnected second-stack app inside a Python project,
the **stack-agnostic core capabilities** from the brief's success criteria have
been implemented in the repository's actual stack (Python, stdlib-only, fully
unit-tested). These integrate naturally with the existing Telethon core
(`src/actions.py`, `src/Client.py`, `src/utils.py`).

## What was delivered

| Module | Capability | Brief success criteria | Source tasks |
|--------|-----------|------------------------|--------------|
| `src/spintax.py` | `{a\|b\|c}` spintax processing, validation, preview sampling | #5 Spintax | XLA-57, XLA-8 |
| `src/throttler.py` | Per-account + global rate limiting (minute/hour/day), concurrency semaphores, jitter | #4 Per-account rate limiting | XLA-8 |
| `src/templates.py` | Reusable templates with `{first_name}`/`{username}` substitution + JSON CRUD store | #7 Template system | XLA-20 |
| `src/recipients.py` | Recipient management: manual entry, CSV import (configurable column map), audience pull, dedup, per-recipient status | #8 Recipient management | XLA-27, XLA-40 |

New defaults live in `src/constants.py`
(`DEFAULT_RATE_PER_MINUTE`, `GLOBAL_MAX_CONCURRENCY`, `DEFAULT_JITTER_SECONDS`,
`DEFAULT_WARMUP_MESSAGES`, etc.), matching the TMMS `env_template.txt` values.

## Usage sketch

```python
from src.spintax import SpintaxProcessor
from src.templates import substitute
from src.recipients import RecipientList
from src.throttler import Throttler

recipients = RecipientList()
recipients.add_from_csv(open("audience.csv").read())

throttler = Throttler()          # 30/min, 100/hr, 1000/day per account by default
spinner = SpintaxProcessor()
template = "Hi {first_name}, {hello|hey|hi} — check this out!"

for r in recipients.pending():
    text = substitute(template, r.context())   # fill {first_name}
    text = spinner.process(text).text           # pick a spintax variant
    # await throttler.acquire_account_token(account_id)
    # await client.send_message(target, text)
    # await throttler.apply_jitter()
    r.mark_sent(account_id="...")
```

The three steps compose cleanly because `substitute()` only touches bare
`{identifier}` placeholders and leaves spintax groups (which contain `|`)
untouched for `SpintaxProcessor` to expand afterward.

## Tests

Each module has a stdlib-only `pytest` suite:

- `tests/test_spintax.py`
- `tests/test_throttler.py` (uses a fake clock — no real waiting)
- `tests/test_templates.py`
- `tests/test_recipients.py`

Run with `pytest tests/test_spintax.py tests/test_throttler.py
tests/test_templates.py tests/test_recipients.py` (part of the existing
`pytest` / `python tests/run_tests.py` flow).

## Deferred (require product decisions or infrastructure not present)

These brief items were **not** implemented in this pass because they depend on
the nonexistent Node/React/SQLite layer, or require live multi-account
integration and owner decisions best made interactively:

- Campaign lifecycle engine with persisted pause/resume/stop/retry state
  (the repo already has one-shot concurrent bulk send with FloodWait /
  SessionRevoked handling in `src/actions.py`).
- Account warmup scheduler, per-account proxy configuration/testing,
  timezone-aware scheduling, numeric health scoring.
- All REST API endpoints and React dashboard components (no web layer exists).
- Telethon `.session` → GramJS StringSession conversion (this app *is* the
  Telethon side; no GramJS target exists).

The delivered core modules are the reusable building blocks those features
would sit on top of.
