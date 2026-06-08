export interface SettingInfo {
  title: string;
  concept: string;
  rationale: string;
  tip: string;
}

export const SETTINGS_EDUCATION = {
  tradeTargets: {
    title: "Risk-to-Reward Ratio (TP/SL)",
    concept:
      "Take Profit (TP) and Stop Loss (SL) establish your mathematical exit brackets. A default setting of 4.0% TP and 2.0% SL enforces a strict 2:1 Risk-to-Reward ratio.",
    rationale:
      "By maintaining a 2:1 ratio, your winning trades yield twice as much as your losing trades. Mathematically, this means you only need to be right 34% of the time to break even, removing emotional guesswork from your exits.",
    tip: "If you lower your TP to 3.0%, consider lowering your SL to 1.5% to preserve the structural 2:1 advantage.",
  },
  rsiBand: {
    title: "Relative Strength Index (RSI) Band",
    concept:
      "RSI is a momentum oscillator measuring the speed and change of price movements on a scale from 0 to 100. Traditionally, values over 70 mean an asset is overbought, and under 30 mean it is oversold.",
    rationale:
      "TrendScan looks for the 'sweet spot' (55–65). An RSI above 55 confirms strong bullish momentum and institutional buying. Capping it at 65 ensures you entry right as a trend accelerates, rather than buying at the absolute peak when the asset is exhausted and ready to pull back.",
    tip: "Widening the high band to 70 will surface more stocks, but increases the risk of buying minor temporary peaks.",
  },
  volatilityFloor: {
    title: "Volatility Floor (ATR %)",
    concept:
      "Average True Range (ATR) measures the average distance a stock moves from high to low each day. The ATR % normalizes this absolute dollar amount against the stock's current price.",
    rationale:
      "For a short-term swing trading strategy (1–5 days), the asset must move enough daily to actually hit your 4% Take Profit target. If a stock only moves 0.5% a day, it could take weeks to hit your target, exposing you to unnecessary holding risk.",
    tip: "Keep this at or above 1.5% to ensure you are scanning for 'fast movers' that can quickly hit your targets during a momentum burst.",
  },
  movingAverages: {
    title: "Structural Moving Averages (MA)",
    concept:
      "Moving Averages smooth out price data to form a single flowing trendline. The 50-day MA represents the medium-term market trend, while the 200-day MA serves as the ultimate long-term macro baseline.",
    rationale:
      "The algorithm requires the asset to trade above both lines, and enforces that the 50 MA sits above the 200 MA (a structural 'Golden Cross'). This absolute rule acts as a defensive shield, completely eliminating stocks trapped in long-term bear markets.",
    tip: "These are institutional-grade anchors. Modifying them shifts your scanner away from established macro support levels.",
  },
} satisfies Record<string, SettingInfo>;

export type SettingHelpId = keyof typeof SETTINGS_EDUCATION;
