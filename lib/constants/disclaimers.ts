// Single source of truth for the "we don't model broker fees" notice. Broker
// commissions were removed from the app (see lib/strategy.ts): every displayed
// TP/SL price and projected P&L is gross of fees, and the user is expected to
// factor their own broker costs into position sizing. Reused across Settings,
// both scanners and the detail panels so the wording never drifts.
export const COMMISSION_DISCLAIMER =
  "Prices and P&L are gross of broker commissions — factor your fees in yourself.";
