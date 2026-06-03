export type DerivSymbol = {
  code: string;
  label: string;
  group: "Volatility" | "Volatility (1s)" | "Crash/Boom" | "Jump" | "Step";
  pip: number;
};

// `pip` here is only a fallback used before the live pip_size arrives
// from the Deriv API. The actual pip is read per-tick from the socket.
export const DERIV_SYMBOLS: DerivSymbol[] = [
  // 1-second volatility
  { code: "1HZ10V", label: "Volatility 10 (1s) Index", group: "Volatility (1s)", pip: 2 },
  { code: "1HZ25V", label: "Volatility 25 (1s) Index", group: "Volatility (1s)", pip: 2 },
  { code: "1HZ50V", label: "Volatility 50 (1s) Index", group: "Volatility (1s)", pip: 2 },
  { code: "1HZ75V", label: "Volatility 75 (1s) Index", group: "Volatility (1s)", pip: 2 },
  { code: "1HZ90V", label: "Volatility 90 (1s) Index", group: "Volatility (1s)", pip: 3 },
  { code: "1HZ100V", label: "Volatility 100 (1s) Index", group: "Volatility (1s)", pip: 2 },

  // Standard volatility (2-second ticks)
  { code: "R_10", label: "Volatility 10 Index", group: "Volatility", pip: 3 },
  { code: "R_25", label: "Volatility 25 Index", group: "Volatility", pip: 3 },
  { code: "R_50", label: "Volatility 50 Index", group: "Volatility", pip: 4 },
  { code: "R_75", label: "Volatility 75 Index", group: "Volatility", pip: 4 },
  { code: "R_100", label: "Volatility 100 Index", group: "Volatility", pip: 2 },

  // Crash / Boom
  { code: "BOOM300N", label: "Boom 300 Index", group: "Crash/Boom", pip: 3 },
  { code: "BOOM500", label: "Boom 500 Index", group: "Crash/Boom", pip: 3 },
  { code: "BOOM1000", label: "Boom 1000 Index", group: "Crash/Boom", pip: 3 },
  { code: "CRASH300N", label: "Crash 300 Index", group: "Crash/Boom", pip: 3 },
  { code: "CRASH500", label: "Crash 500 Index", group: "Crash/Boom", pip: 3 },
  { code: "CRASH1000", label: "Crash 1000 Index", group: "Crash/Boom", pip: 3 },

  // Jump
  { code: "JD10", label: "Jump 10 Index", group: "Jump", pip: 2 },
  { code: "JD25", label: "Jump 25 Index", group: "Jump", pip: 2 },
  { code: "JD50", label: "Jump 50 Index", group: "Jump", pip: 2 },
  { code: "JD75", label: "Jump 75 Index", group: "Jump", pip: 2 },
  { code: "JD100", label: "Jump 100 Index", group: "Jump", pip: 2 },

  // Step
  { code: "stpRNG", label: "Step Index", group: "Step", pip: 1 },
];

export const DEFAULT_SYMBOL = "1HZ10V";
export const DEFAULT_TICK_COUNT = 1000;
export const TICK_COUNT_OPTIONS = [100, 500, 1000, 5000];
