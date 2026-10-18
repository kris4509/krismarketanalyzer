# Project rules

- Deriv market data connects first to the new public endpoint `wss://api.derivws.com/trading/v1/options/ws/public`, with legacy `ws.derivws.com`/`ws.binaryws.com` v3 hosts only as fallbacks — Deriv retired the legacy hosts (they return 520), and the new public endpoint needs no app id.
