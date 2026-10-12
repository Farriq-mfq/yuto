# App Flow

## Navigation (bottom tabs)
Home `/` · Wallet `/wallet` · **Record** `/record` (center button) · Activity `/activity` · Reports `/reports`
Unauthenticated users are redirected to `/login` (password only). There is no register screen and no user to create; the password comes from `YUTO_PASSWORD` in `.env`. Any `401` from the API sends the user back to `/login`.

## Screens
| Route | Purpose |
|-------|---------|
| /login | Owner password |
| / | Month summary + grouped transactions + filter |
| /wallet | Total balance, accounts, Transfer, New Account |
| /wallet/new | New account form |
| /wallet/:id | Edit account |
| /transfer | Transfer between accounts |
| /record | Record transaction |
| /transactions/:id | Confirmation / detail (items, location, note) |
| /transactions/:id/edit | Edit transaction |
| /activity | Calendar + selected day |
| /reports | Category analysis |

## Flow 1: Record a transaction
Tap Record -> choose kind -> account -> category -> amount (type or quick chips) -> title -> items (optional) -> location (optional) -> Save -> back to Home, new row at top.
- Preview shows `before -> after` for the chosen account.
- Save is disabled until kind, account, category, and amount > 0 are set.
- Cancel asks for confirmation only if the form has changes.

## Flow 2: New account
Wallet -> New Account -> tab (Bank / E-wallet / Cash) -> institution -> custom name (optional, defaults to institution) -> account category -> opening balance -> toggle -> Save -> Wallet.

## Flow 3: Transfer
Wallet -> Transfer -> from -> to (cannot equal from) -> amount -> note -> Save -> Wallet. Both previews update live.

## Flow 4: Review
- Home: change month, filter kind, tap a row for detail, Edit from detail.
- Activity: tap a date; empty days show "No data / no transactions on this date".
- Reports: switch Expense/Income; tap a category to list its transactions.

## Flow 5: Edit / delete transaction
Detail -> Edit -> same form, preview recalculated from the balance *before* this transaction -> Save. Delete asks for confirmation and updates balances.

## States every list/screen must handle
loading (skeleton), empty, error with retry, offline message.
