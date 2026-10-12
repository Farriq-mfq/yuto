# PRD: Yuto

**Yuto** is a self-hosted money tracker. The name is Javanese for "million" (*juta*).
You run it on your own server or home machine; your financial data never leaves it.

## 1. Problem
People in Indonesia keep money in several places (banks, e-wallets, cash). They cannot see their total position or where money goes each month.

## 2. Goal
One app, run by the user on their own hardware, to record transactions, see every account balance, and understand monthly spending by category. No cloud account, no subscription, no telemetry.

## 3. Users
One person: the owner of the host. Someone who values owning their financial data and can run `docker compose up` (home server, VPS, NAS), with 2+ bank accounts and e-wallets (BCA, Mandiri, GoPay, OVO). Single-user by design: no accounts, roles, or sharing. Anyone else who wants Yuto runs their own instance.

## 4. MVP scope
| Area | Requirement |
|------|-------------|
| Auth | One owner password, set in `.env` (`YUTO_PASSWORD`). Login and logout only; no registration, no user accounts. Every route except login requires the session. |
| Self-host | One-command install with Docker, data in a named volume, documented backup, restore, and upgrade. See TRD section 7. |
| Home | Month picker; income, expense, and net for the month; list of transactions grouped by day with a daily total; filter All / Expense / Income; "analysis ready" banner linking to Reports. |
| Wallet | Total balance across all accounts; account list; Transfer and New Account buttons; hide/show balances. |
| Record transaction | Kind (expense/income), account, category, amount (typed or quick chips +10k/+20k/+50k/+100k), title, optional item list, optional payment location (map pin), balance preview `before -> after`. |
| Edit / delete transaction | Same form as record. Balance preview recalculates from the balance *before* this transaction. |
| Transfer | From account, to account, amount, optional note, preview of both balances. |
| New account | Type (Bank / E-wallet / Cash), institution, optional custom name, account category, opening balance, "show category on card" toggle. |
| Activity | Month calendar; tap a day to see that day's expense, income, and transactions; empty state when none. |
| Reports | Per-category totals for a month, share of total (%), change vs last month; switch Expense / Income. |

## 5. Non-goals (MVP)
Hosted/SaaS version, multiple users or roles, sharing, telemetry or analytics, budgets, savings goals, bank sync, receipt scanning, multi-currency, shared wallets, push notifications.

## 6. Success metrics
- Median time to record a transaction under 15 seconds.
- Transactions recorded per week.
- Day-30 retention.
- Fresh install to first recorded transaction in under 10 minutes for someone who has Docker.

## 7. Acceptance criteria (must hold)
1. Account balance = opening balance + income - expense + transfers in - transfers out. Always.
2. Editing or deleting a transaction updates balances correctly.
3. A transfer either changes both accounts or neither.
4. Report totals equal the sum of the month's transactions.
5. Home "net" and Wallet "total balance" are labelled differently so they are never confused.
6. Editing a transaction never silently changes its category.
7. A fresh install, a backup, and a restore into a new install give identical data.
8. The app makes no outbound network calls on its own (no telemetry, no update ping). The optional map picker is the only exception and can be turned off.

## 8. Changes from the reference video
- Login added: even self-hosted, the server may be reachable from the internet, so one owner password protects the data. The video showed no login.
- Home "Total Saldo" (income minus expense of the month) is renamed **"Net this month"**. In the video it looked like the wallet total but was a different number.

## 9. Open decisions
- Default category list (see BACKGROUND_SCHEMA.md seed).
- Map provider for the location picker (default: OpenStreetMap tiles; setting to disable).
- Whether deleting an account with transactions should be blocked (MVP: blocked).
