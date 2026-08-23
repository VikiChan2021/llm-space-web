[English](./README.md) | [中文](./README.zh-CN.md)

[![CI](https://github.com/VikiChan2021/llm-space-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/VikiChan2021/llm-space-web/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](./package.json)
[![Bun](https://img.shields.io/badge/Bun-1.3+-000000?logo=bun&logoColor=white)](./mise.toml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# LLM Space Web

An interactive learning workbench for building, running, tracing, and comparing AI Agents directly in the browser.

**Try it online:** [https://kandian.site/llm-space-web/#/workbench](https://kandian.site/llm-space-web/#/workbench)

![LLM Space Web workbench](./.agents/kaizen-loop/audits/2026-08-14-113417-persistent-learning-coach-layout-v1/online-three-column-1440.png)

## What you can do

- Start from nine editable Agent examples, including Weather Agent, Deep Research, General Agent, Translation, and Deep Wiki.
- Edit models, prompts, messages, variables, tools, MCP configuration, and ReAct settings in one workbench.
- Run supported Agents with streamed model output and safe browser/server tools.
- Inspect Run history and traces, compare executions, restore snapshots, and record evaluations.
- Run small browser-local Baseline/Candidate experiments with fixed text cases, deterministic checks, trace inspection, manual scoring, and JSON import/export.
- Learn with an Agentic AI assistant that explains the current surface, guides a weather-agent learning track, and performs only registered, confirmation-aware page actions.
- Keep guest Threads in the current browser and import or export them as JSON.

## Hosted Alpha boundaries

This repository currently showcases the Web Hosted Alpha. It is not presented as a production multi-tenant SaaS.

- Guest Threads and virtual files are stored in the current browser.
- Free model usage is quota-limited; provider credentials remain on the server.
- Only allowlisted models and tools are available.
- Host Bash, host filesystem access, arbitrary DOM/JavaScript control, public remote MCP, login, BYOK, billing, and cross-device Thread sync are not available in the guest experience.

See the in-product [Web quick start](https://kandian.site/llm-space-web/#/docs/quick-start) for the current user guide.

## Local development

The repository uses [mise](https://mise.jdx.dev) as the task entry point and [Bun](https://bun.com) as the package manager/runtime. Do not use npm, pnpm, or yarn for workspace dependencies.

```bash
mise run setup
mise run dev:guest-web
```

The guest Web app runs on `http://localhost:15175/llm-space-web/`.

Useful checks:

```bash
mise run check:changed
mise run build:guest-web
mise run pack:guest-api
```

## Web architecture

```text
apps/
  web/       # React/Vite workbench, docs, examples, and browser persistence
  cloud/     # Guest HTTP/SSE API, model quota, coach, and safe tool execution
packages/
  core/      # Browser-safe Agent/thread domain and server storage primitives
  ui/        # Shared Thread Playground and design system
  runtime/   # Model, tool, MCP, and Agent runtime implementations
```

The Web UI and guest API are built separately and served under the same origin in the Tencent Cloud deployment. Provider secrets never enter the browser bundle or local storage.

## Project origin

This repository is a Web-focused fork of [deer-flow/llm-space](https://github.com/deer-flow/llm-space). The upstream project is a native Electrobun desktop application; this fork retains shared packages and desktop source for compatibility while the repository homepage, README, and hosted product focus on the browser workbench.

## License

Released under the [MIT License](./LICENSE).
