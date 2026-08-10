# StockAI

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Release](https://img.shields.io/github/v/release/hyhmrright/StockAI)](https://github.com/hyhmrright/StockAI/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/hyhmrright/StockAI/total)](https://github.com/hyhmrright/StockAI/releases)
[![Stars](https://img.shields.io/github/stars/hyhmrright/StockAI?style=social)](https://github.com/hyhmrright/StockAI/stargazers)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/hyhmrright/StockAI/releases/latest)

![StockAI Dashboard](./docs/screenshot-dashboard.png)

**An AI equity research desk that runs on your own machine.** StockAI gathers live news, prices, fundamentals and money flow for US stocks and Chinese A-shares, then puts AI on top of them: a fast sentiment read, a panel of 13 investor-master agents that each argue the case from their own philosophy, and a chat window that answers questions with citations back to the source. Built with **Tauri 2** — one desktop binary, no server, and your API keys never leave the device.

> **Bring your own model.** OpenAI, Anthropic, DeepSeek, GLM, or a fully local Ollama. This project hosts nothing and proxies nothing.

## 🌟 Features

### 🧠 AI analysis, in three depths

- **Sentiment scan** — collects recent news for a ticker and returns a bullish / bearish ratio with colour-coded factor cards. Deep Mode extracts full article bodies instead of just headlines.
- **Deep Master Analysis** — 13 investor-master agents (Buffett, Munger, Graham, Burry, Wood, Lynch, Fisher, Ackman, Pabrai, Taleb, Druckenmiller, Damodaran, Jhunjhunwala). Each is one LLM call carrying that investor's actual framework, and a synthesizer aggregates them into a consensus rating you can expand master by master. You pick who runs, and the panel shows the exact LLM-call count **before** you spend anything.
- **Ask the filings** — a chat panel grounded in the company's earnings reports, the news just scraped, and the quant metrics on screen. Every answer carries citations you can click back to the original.

**Analysis never fires on its own.** Switching tickers loads market data but spends no tokens — every LLM run is an explicit click. Models are assignable per role, so a cheap one can handle summarising while a strong one does the reasoning.

### 📊 Quant scoring, screening & backtesting

- **Quant score (1–100)** — a technical + fundamental composite, blended with a valuation read and pulled toward neutral by a volatility measure. When a dimension is unavailable it degrades to a weaker claim instead of inventing a number.
- **Natural-language screener** — type *"main-board A-shares with ROE above 15% and P/E below 20"*, and it parses the conditions, sweeps the entire A-share market, then pulls fundamentals for the leading candidates. It shows you how it interpreted your sentence before spending time on it.
- **Strategy backtest** — run a strategy across the loaded history and get total return, annualised return, trade count and a buy-and-hold baseline, with entries, exits and the equity curve drawn on the chart.
- **Master track record** — every directional call a master makes is logged locally and marked to the current price, so hit rates and an equal-weight NAV curve accumulate forward from your very first analysis.

### 📈 Charts & market data

- **Interactive K-line chart** — MA / BOLL overlays, nine ranges (1D / 5D / 1M / 3M / 6M / YTD / 1Y / 5Y / All), a switchable sub-chart (MACD / RSI / KDJ / OBV / VWAP), log scale, forward/backward dividend adjustment, a comparison baseline, and the live price merged into the last candle during trading hours.
- **Market overview** — a persistent index bar (SSE / SZSE / ChiNext / S&P 500 / Nasdaq / Dow) that opens into industry and concept sector leaderboards (main-force net inflow, advancers/decliners, leading stock) plus the **Dragon-Tiger list**: the latest session's top net buys and sells with each listing reason.
- **Company profile (F10, A-shares)** — corporate overview, latest-period revenue breakdown by product / industry / region with gross margins, holder-account count, top-10 tradable shareholders and sector tags. Fetched only when you expand it.

### 💼 Your own book

- **Portfolio tracking** — real positions (shares + weighted-average cost) with live market value, unrealised P&L, day P&L and position weight; adding to a holding merges the cost basis by share-weighted average. **Currencies are totalled separately** — there is no FX data source here, and summing CNY with USD would produce a meaningless number. Positions without a quote are excluded from totals and named explicitly, never filled in with zeros.
- **Watchlist & price alerts** — quick-add from the sidebar, with optional upper / lower price alerts delivered as system notifications.
- **Analysis history** — every analysis, deep analysis and screen is archived to a local SQLite database and reopens in full.

### ⚙️ Built to keep working

- **Redundant data sources** — quotes, K-lines, fundamentals, sector boards, fund flow and market snapshots each fall back across Tencent / Eastmoney / Sina / Yahoo, so a single upstream outage doesn't blank the app. News keeps working where Google and Yahoo are unreachable, through an Eastmoney source that depends on neither domain.
- **Local-first, key-safe** — settings and API keys live in the OS-level store. Keys reach the analysis process through a `0600` temp file, never through command-line arguments where any process listing would expose them.
- **Three languages** — 简体中文 / English / 日本語, switchable at runtime and carried all the way down into the LLM prompts.
- **Signed in-app updates** — v0.15.0 and later update themselves.

## 🏗️ Architecture

Three layers with strictly unidirectional dependencies: **UI → Tauri Core (Rust) → Sidecar (Bun)**.

1. **Frontend (`src/`)** — React 19 + TypeScript + Vite. All IPC goes through one entry point; local history is SQLite via `tauri-plugin-sql`.
2. **Tauri Core (`src-tauri/`)** — Rust. Exposes exactly one command, `invoke_sidecar`, which knows no business logic: it swaps sentinels for temp-file paths (config, oversized payloads) and cleans them up. Adding a capability therefore needs no Rust change.
3. **Sidecar (`sidecar/`)** — a compiled Bun binary, spawned per call and fully stateless. Scrapes news (plain-`fetch` strategies first, Playwright only when they come up empty), runs the quant computation, and talks to the AI providers.

`shared/` is the single source of truth across all three: DTO types, the CLI action manifest, provider profiles and market detection.

Full contract: [`.claude/rules/architecture.md`](./.claude/rules/architecture.md).

## 📦 Installation

Pre-built binaries are on the [Releases](https://github.com/hyhmrright/StockAI/releases/latest) page.

Then open the app → **Settings** (top right) → enter the API key for your provider of choice → Save.

### macOS — "StockAI is damaged" error

macOS Gatekeeper blocks apps that aren't notarized by an Apple Developer certificate. Run this in Terminal to clear the quarantine flag:

```bash
xattr -cr /Applications/StockAI.app
```

Then open the app normally. This is safe — the app contains no network backdoors and the full source is auditable in this repository.

> **Why this happens:** apps downloaded from the internet receive a quarantine attribute. Without an Apple code-signing certificate, macOS reports "damaged" instead of the usual "unknown developer" prompt.

### Windows — SmartScreen warning

Click **More info → Run anyway**. This appears for any unsigned executable.

### Linux (.deb)

```bash
sudo dpkg -i StockAI_*_amd64.deb
```

Requires WebKitGTK (pre-installed on most GNOME-based distros).

---

## 🚀 Building from source

### Prerequisites

- **Bun** — package manager and Sidecar runtime. [Install Bun](https://bun.sh/)
- **Rust** — for the Tauri core. [Install Rust](https://www.rust-lang.org/)

### 1. Install dependencies

```bash
bun install
```

### 2. Start the dev environment

```bash
bun tauri dev
```

This compiles the Sidecar binary for your machine first, so there is no separate build step.

### 3. Package a release build

```bash
bun tauri build
```

To cross-compile the Sidecar for another platform explicitly:

```bash
BUN_TARGET=bun-windows-x64 bun sidecar/build-script.ts
```

Valid targets: `bun-darwin-arm64` · `bun-darwin-x64` · `bun-linux-x64` · `bun-windows-x64`. The output lands in `src-tauri/bin/` named with the Rust target triple Tauri expects.

## 🧪 Testing

```bash
bun run test              # full offline suite — frontend Vitest + Sidecar Bun tests
bun run test:integration  # the above, plus live-network assertions against every data source
bun run test:e2e          # boots Vite in a real browser and asserts the chart actually renders
bun run format            # Biome formatter
cd src-tauri && cargo test # Rust core
```

The default suite is **entirely offline** — scraping and parsing are decoupled so every network call has an injection point. Because offline fixtures never change, they are structurally blind to an upstream redesign; each external data source therefore also carries a shape assertion in a `*.integration.ts` file, run daily by CI.

## 🛠️ Tech Stack

- **Desktop**: Tauri 2 (Rust), SQLite via `tauri-plugin-sql`, signed auto-updates
- **Frontend**: React 19, TailwindCSS 4, Lightweight Charts v5, Lucide Icons
- **Sidecar**: Bun, Playwright, node-html-markdown
- **AI**: OpenAI SDK, Anthropic SDK, Ollama SDK (DeepSeek / GLM over the OpenAI-compatible protocol)
- **Tooling**: Biome, Vitest, Lefthook

## 📅 Development Conventions

- **Code comments** are written in **Chinese** (project preference).
- **UI component files stay under 200 lines** — complex logic is extracted into hooks.
- **Unidirectional dependencies** (UI → Core → Sidecar), with `shared/` as the only cross-layer source of truth.
- **Parsing logic lives apart from the network layer** and must be covered by offline unit tests.

## 🤝 Contributing

Contributions are welcome! Please read the [Contributing Guide](./CONTRIBUTING.md) to get started, and our [Code of Conduct](./CODE_OF_CONDUCT.md). Found a bug or have an idea? Open an [issue](https://github.com/hyhmrright/StockAI/issues) or start a [discussion](https://github.com/hyhmrright/StockAI/discussions).

## ⚠️ Disclaimer

StockAI is a research and educational tool. Its output — including AI-generated ratings, master consensus, quant scores and backtest results — is not investment advice. Market data comes from public third-party sources and may be delayed, incomplete or wrong. You alone are responsible for your investment decisions.

## 📄 License

[MIT](./LICENSE) © hyhmrright
