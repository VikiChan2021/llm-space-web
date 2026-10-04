# 源码证据索引

核对日期：2026-09-03。HEAD 基准：`c5fd749c4ec3d0d1e0d073a635ee361928d1646c`。行号基于当时工作树；精确指纹见 [sources.json](sources.json)。

这些入口用于追踪真实实现；测试文件是阅读与验证入口，不表示本轮已运行对应产品测试。

## 01  项目运行架构

| 源码 | 定位符 |
| --- | --- |
| [apps/desktop/src/bun/app/start-desktop-app.ts · L59](../../apps/desktop/src/bun/app/start-desktop-app.ts#L59) | `const workspacePath` |
| [packages/ui/src/host/types.ts · L70](../../packages/ui/src/host/types.ts#L70) | `export interface ToolExecutionPolicy` |
| [apps/web/src/host/web-host.ts · L56](../../apps/web/src/host/web-host.ts#L56) | `export const webHost` |
| [apps/web/src/thread-viewer.tsx · L8](../../apps/web/src/thread-viewer.tsx#L8) | `ThreadPlayground` |
| [apps/cloud/src/guest-index.ts · L7](../../apps/cloud/src/guest-index.ts#L7) | `const quotaStore` |
| [apps/cloud/src/index.ts · L14](../../apps/cloud/src/index.ts#L14) | `assertRuntimeDatabaseIsolation(config.databaseUrl)` |
| [apps/cloud/src/http-server.ts · L131](../../apps/cloud/src/http-server.ts#L131) | `url.pathname === "/api/session"` |
| [apps/cloud/migrations/0001_identity_and_tenants.sql · L4](../../apps/cloud/migrations/0001_identity_and_tenants.sql#L4) | `CREATE TABLE` |
| [packages/core/package.json · L9](../../packages/core/package.json#L9) | `"./server"` |

## 02  一次 Desktop Run 的时序

| 源码 | 定位符 |
| --- | --- |
| [packages/ui/src/components/thread-playground/stores/thread-store.ts · L1137](../../packages/ui/src/components/thread-playground/stores/thread-store.ts#L1137) | `async run(fromMessageId` |
| [apps/desktop/src/client/rpc-transport.ts · L18](../../apps/desktop/src/client/rpc-transport.ts#L18) | `export function createRpcTransport` |
| [apps/desktop/src/bun/rpc/stream-thread-request.ts · L8](../../apps/desktop/src/bun/rpc/stream-thread-request.ts#L8) | `export async function forwardStreamThread` |
| [apps/desktop/src/bun/rpc/index.ts · L532](../../apps/desktop/src/bun/rpc/index.ts#L532) | `forwardStreamThread(` |
| [packages/runtime/src/runtime/local-runtime-client.ts · L428](../../packages/runtime/src/runtime/local-runtime-client.ts#L428) | `streamThread(` |
| [packages/runtime/src/streaming/stream-thread.ts · L12](../../packages/runtime/src/streaming/stream-thread.ts#L12) | `export class StreamThreadController` |
| [packages/core/src/server/agent/stream.ts · L22](../../packages/core/src/server/agent/stream.ts#L22) | `export async function* streamAgent` |
| [packages/core/src/client/reducer.ts · L35](../../packages/core/src/client/reducer.ts#L35) | `export function reduceMessages` |

## 03  Guest Web 的数据流

| 源码 | 定位符 |
| --- | --- |
| [apps/web/src/guest/guest-api.ts · L161](../../apps/web/src/guest/guest-api.ts#L161) | `export function createGuestTransport` |
| [apps/cloud/src/guest-http-server.ts · L290](../../apps/cloud/src/guest-http-server.ts#L290) | `url.pathname === "/api/guest/runs"` |
| [apps/cloud/src/guest-http-server.ts · L448](../../apps/cloud/src/guest-http-server.ts#L448) | `request.model?.provider` |
| [apps/cloud/src/guest-model.ts · L17](../../apps/cloud/src/guest-model.ts#L17) | `export function createGuestModelExecutor` |
| [apps/cloud/src/guest-quota.ts · L22](../../apps/cloud/src/guest-quota.ts#L22) | `export class GuestQuotaStore` |
| [apps/cloud/src/guest-node-index.ts · L9](../../apps/cloud/src/guest-node-index.ts#L9) | `const quotaStore` |
| [apps/web/src/guest/guest-workspace.ts · L339](../../apps/web/src/guest/guest-workspace.ts#L339) | `persistGuestThreadUpdate` |
| [apps/web/src/guest/guest-tools.ts · L251](../../apps/web/src/guest/guest-tools.ts#L251) | `canGuestAutoExecute` |
| [apps/cloud/src/guest-tool-service.ts · L17](../../apps/cloud/src/guest-tool-service.ts#L17) | `export` |
| [apps/web/src/host/web-host.ts · L56](../../apps/web/src/host/web-host.ts#L56) | `export const webHost` |

## 04  工具调用与 ReAct 循环

| 源码 | 定位符 |
| --- | --- |
| [packages/ui/src/components/thread-playground/stores/thread-store.ts · L594](../../packages/ui/src/components/thread-playground/stores/thread-store.ts#L594) | `const executePendingToolCalls` |
| [packages/ui/src/components/thread-playground/stores/thread-store.ts · L1137](../../packages/ui/src/components/thread-playground/stores/thread-store.ts#L1137) | `async run(fromMessageId` |
| [packages/core/src/server/agent/stream.ts · L22](../../packages/core/src/server/agent/stream.ts#L22) | `export async function* streamAgent` |
| [packages/ui/src/host/types.ts · L70](../../packages/ui/src/host/types.ts#L70) | `export interface ToolExecutionPolicy` |
| [apps/web/src/guest/guest-tools.ts · L251](../../apps/web/src/guest/guest-tools.ts#L251) | `canGuestAutoExecute` |
| [apps/web/src/host/web-host.ts · L56](../../apps/web/src/host/web-host.ts#L56) | `export const webHost` |

## 05  Thread、快照与存储边界

| 源码 | 定位符 |
| --- | --- |
| [apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx · L139](../../apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx#L139) | `new SerializedPersistence` |
| [packages/ui/src/components/thread-playground/stores/thread-store.ts · L1137](../../packages/ui/src/components/thread-playground/stores/thread-store.ts#L1137) | `async run(fromMessageId` |
| [packages/core/src/server/storage/local/file-system.ts · L156](../../packages/core/src/server/storage/local/file-system.ts#L156) | `async write(p: string` |
| [packages/core/src/server/storage/local/run-history-store.ts · L47](../../packages/core/src/server/storage/local/run-history-store.ts#L47) | `export class RunHistoryStore` |
| [apps/desktop/src/bun/app/start-desktop-app.ts · L59](../../apps/desktop/src/bun/app/start-desktop-app.ts#L59) | `const workspacePath` |
| [apps/web/src/guest/guest-workspace.ts · L339](../../apps/web/src/guest/guest-workspace.ts#L339) | `persistGuestThreadUpdate` |
| [apps/web/src/guest/guest-evaluation-lab.ts · L19](../../apps/web/src/guest/guest-evaluation-lab.ts#L19) | `export const GUEST_EVALUATION_LAB_STORAGE_KEY` |
| [apps/cloud/src/guest-quota.ts · L22](../../apps/cloud/src/guest-quota.ts#L22) | `export class GuestQuotaStore` |
| [apps/cloud/src/guest-node-index.ts · L9](../../apps/cloud/src/guest-node-index.ts#L9) | `const quotaStore` |
| [apps/cloud/src/http-server.ts · L131](../../apps/cloud/src/http-server.ts#L131) | `url.pathname === "/api/session"` |
| [apps/cloud/migrations/0001_identity_and_tenants.sql · L4](../../apps/cloud/migrations/0001_identity_and_tenants.sql#L4) | `CREATE TABLE` |

## 06  宿主能力矩阵

| 源码 | 定位符 |
| --- | --- |
| [packages/ui/src/host/types.ts · L70](../../packages/ui/src/host/types.ts#L70) | `export interface ToolExecutionPolicy` |
| [apps/web/src/host/web-host.ts · L56](../../apps/web/src/host/web-host.ts#L56) | `export const webHost` |
| [apps/web/src/thread-viewer.tsx · L8](../../apps/web/src/thread-viewer.tsx#L8) | `ThreadPlayground` |
| [apps/web/src/guest/guest-tools.ts · L251](../../apps/web/src/guest/guest-tools.ts#L251) | `canGuestAutoExecute` |
| [apps/cloud/src/guest-tool-service.ts · L17](../../apps/cloud/src/guest-tool-service.ts#L17) | `export` |
| [packages/runtime/src/runtime/types.ts · L90](../../packages/runtime/src/runtime/types.ts#L90) | `export interface RuntimeClient` |
| [apps/desktop/src/bun/remote/remote-runtime-client.ts · L191](../../apps/desktop/src/bun/remote/remote-runtime-client.ts#L191) | `async streamThread(` |
| [apps/server/src/http-server.ts · L33](../../apps/server/src/http-server.ts#L33) | `assertAuthorized(request` |
| [apps/desktop/src/bun/fs/generator-project.ts · L32](../../apps/desktop/src/bun/fs/generator-project.ts#L32) | `export` |

## 07  Evaluation Lab V2 的改进循环

| 源码 | 定位符 |
| --- | --- |
| [packages/core/src/thread/evaluation-experiment.ts · L22](../../packages/core/src/thread/evaluation-experiment.ts#L22) | `export const EVALUATION_LAB_VERSION` |
| [packages/core/src/thread/evaluation-experiment.ts · L279](../../packages/core/src/thread/evaluation-experiment.ts#L279) | `export function planEvaluationPromotion` |
| [packages/core/src/thread/evaluation-experiment.ts · L338](../../packages/core/src/thread/evaluation-experiment.ts#L338) | `export function createNextEvaluationExperiment` |
| [apps/web/src/guest/guest-evaluation-runner.ts · L27](../../apps/web/src/guest/guest-evaluation-runner.ts#L27) | `export async function runGuestEvaluationItem` |
| [apps/web/src/guest/guest-evaluation-lab-dialog.tsx · L294](../../apps/web/src/guest/guest-evaluation-lab-dialog.tsx#L294) | `const runItems` |
| [apps/web/src/guest/guest-workbench.tsx · L541](../../apps/web/src/guest/guest-workbench.tsx#L541) | `const applyEvaluationCandidate` |
| [apps/web/src/guest/guest-evaluation-lab.ts · L19](../../apps/web/src/guest/guest-evaluation-lab.ts#L19) | `export const GUEST_EVALUATION_LAB_STORAGE_KEY` |

## 08  Prompt 渲染与 Python 导出

| 源码 | 定位符 |
| --- | --- |
| [packages/core/src/thread/prompt-variables.ts · L431](../../packages/core/src/thread/prompt-variables.ts#L431) | `export async function renderThreadPromptVariables` |
| [packages/core/src/thread/template-render.ts · L235](../../packages/core/src/thread/template-render.ts#L235) | `renderTemplateText` |
| [packages/core/src/client/api.ts · L14](../../packages/core/src/client/api.ts#L14) | `export async function* streamThread` |
| [packages/core/src/client/converters.ts · L12](../../packages/core/src/client/converters.ts#L12) | `convertToPiContext` |
| [packages/core/src/generator/langgraph/index.ts · L106](../../packages/core/src/generator/langgraph/index.ts#L106) | `export const langgraphGenerator` |
| [packages/core/src/generator/langgraph/variables.py · L30](../../packages/core/src/generator/langgraph/variables.py#L30) | `def ` |
| [apps/desktop/src/bun/fs/generator-project.ts · L32](../../apps/desktop/src/bun/fs/generator-project.ts#L32) | `export` |
| [packages/core/tests/generator/langgraph/index.test.ts · L9](../../packages/core/tests/generator/langgraph/index.test.ts#L9) | `test(` |

## 09  Remote Runtime 的连接与数据路径

| 源码 | 定位符 |
| --- | --- |
| [apps/desktop/src/bun/remote/remote-server-manager.ts · L162](../../apps/desktop/src/bun/remote/remote-server-manager.ts#L162) | `connectServer(` |
| [apps/desktop/src/bun/remote/remote-runtime-manager.ts · L13](../../apps/desktop/src/bun/remote/remote-runtime-manager.ts#L13) | `registerConfiguredRemoteRuntime` |
| [apps/desktop/src/bun/remote/remote-runtime-client.ts · L191](../../apps/desktop/src/bun/remote/remote-runtime-client.ts#L191) | `async streamThread(` |
| [packages/runtime/src/runtime/runtime-router.ts · L3](../../packages/runtime/src/runtime/runtime-router.ts#L3) | `export class RuntimeRouter` |
| [packages/runtime/src/runtime/types.ts · L90](../../packages/runtime/src/runtime/types.ts#L90) | `export interface RuntimeClient` |
| [apps/server/src/http-server.ts · L33](../../apps/server/src/http-server.ts#L33) | `assertAuthorized(request` |
| [apps/server/src/stream.ts · L10](../../apps/server/src/stream.ts#L10) | `export function createStreamResponse` |
| [apps/server/src/runtime-factory.ts · L19](../../apps/server/src/runtime-factory.ts#L19) | `export` |

