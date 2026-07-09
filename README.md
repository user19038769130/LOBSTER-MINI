   # LOBSTER-MINI
Open-source Embodied Automation AI Agent Based on Harness Scheduling Architecture
## Project Introduction
LOBSTER-MINI is natively built on the complete Harness agent scheduling architecture, filling the gap of physical graphical execution layer missing in traditional text-only API agents.

It adopts a three-tier architecture plus a three-in-one execution suite: upper Harness scheduling core, middle Node control service, bottom Docker isolated sandbox cluster. Each sandbox integrates three core modules: Docker isolated environment, open-computer-use desktop control engine, Web VNC real-time visualization.

The system empowers AI with full desktop operation capabilities including screen visual recognition, OCR text parsing, mouse & keyboard simulation, multi-window interaction. It realizes the technical upgrade from interface-only text agents to embodied agents that can manipulate real graphical interfaces.

## System Layered Architecture (Match Architecture Diagram)
### Tier 1: Harness Global Scheduling Layer
- Central task entrypoint, receiving automation tasks from business systems and LLMs; manage task queue, priority and concurrency limits
- Natively compatible with original Harness business workflow, no large-scale refactoring for upper-layer business code
- Distribute operation commands down to LOBSTER-MINI Node service, collect sandbox feedback including operation logs, screenshots and error reports
- Full lifecycle control: task dispatch, pause, retry, snapshot rollback, task termination

### Tier 2: LOBSTER-MINI Node Middle Control Service
Developed with Node.js, acts as exclusive communication bridge between scheduler and container sandboxes
1. Container Cluster Management: Create, start/stop, snapshot/reset, destroy sandbox instances in batches via Docker Compose
2. Command Forwarding: Standard encapsulation for open-computer-use API, send screenshot, mouse and keyboard execution instructions
3. VNC Gateway: Unified port mapping and authentication for all sandbox VNC services, provide browser-accessible real-time view links
4. Persistent Data Storage: Cache and store full operation logs, screenshots, AI action vectors; upload data to upper scheduler for anomaly troubleshooting

### Tier 3: Docker Isolated Sandbox Execution Cluster
One independent container per task, multiple containers form a scalable sandbox cluster. Each sandbox contains two built-in core components:
#### ① open-computer-use Desktop Control Engine (Action Execution Core)
- Vision capabilities: Full/partial screen capture, OCR text recognition, precise window coordinate locating
- Input simulation: Mouse click/drag/scroll, keyboard text input, system shortcut simulation
- Real-time data upload: Send captured screen frames and execution results to middle Node service for storage

#### ② Web VNC Visualization Service (Human-Machine Collaboration Channel)
- Client-free access: Directly view full sandbox desktop in browser with real-time operation stream
- Manual intervention support: Take over mouse/keyboard at any time to pause AI automation and fix wrong operations
- Complete operation record: Persist all screen streams to reproduce recognition errors and abnormal action vectors

### Full Data Flow
Business/LLM Task Request → Harness Scheduler Dispatch Task → Node Service Create/Reuse Docker Sandbox → Send Commands to open-computer-use for Desktop Execution
Parallel stream: Desktop video stream pushed to Web VNC for manual monitoring; screenshots, logs and recognition results upload back to Harness for unified storage.

## Core Features
1. Secure Isolation via Independent Docker Sandboxes
Each task runs in separated container with configurable CPU/memory resource limits and permission whitelist. One-click snapshot reset for sandbox environment. All tasks are fully isolated without polluting host machine or interfering each other.

2. Full-Scale Graphical Interface Automation
Powered by open-computer-use engine, supports screen capture, global/local OCR, all mouse actions, batch text input and multi-window scheduling, covering all web pages and PC client scenarios.

3. Web VNC Visualized Human-Machine Collaboration Architecture
Lightweight VNC stream service built in each container, unified port forwarding and authentication by middle service. Real-time AI operation view via browser; instant manual correction supported. Full operation logs and screen records for fast anomaly location.

4. Native Compatibility with Harness Scheduling Link
Fully reuse existing Harness task queue and management logic. Only add LOBSTER-MINI middle control service to connect bottom sandbox execution cluster. No heavy reconstruction required for original text agents to expand desktop automation ability with low cost.

## Application Scenarios
- Intelligent Office Automation: Batch form filling, backend data crawling, multi-page data collection
- UI Automated Testing: Flow inspection and repetitive operation verification for web & desktop clients
- Embodied AI Research: Screen-interaction LLM training, human-machine collaboration automation validation
- Unattended batch desktop tasks with visualized real-time maintenance and manual correction support

## Layered Tech Stack
1. Upper Scheduler: Harness Agent Scheduling Framework
2. Middle Gateway: Node.js
3. Container Orchestration: Docker Compose
4. Desktop Execution Core: open-computer-use
5. Real-Time Visualization: Web VNC

## Architecture Diagram Annotation Guide
1. Top Module: Harness Task Scheduler
2. Middle Core Module: LOBSTER-MINI Node Service
3. Bottom Cluster: Docker Sandbox Group
    Sub-components inside single sandbox: open-computer-use Desktop Engine, Web VNC Visual Desktop
4. Bidirectional Data Arrow: Down = Scheduling Execution Commands; Up = Logs, Screenshots & Status Feedback

## Open Source License
MIT License

---
## Supplementary Instructions
1. Copy all Markdown content to README.md in your repository. Submit the file and refresh repo homepage to display full architecture, features and scenarios.
2. Upload system layered architecture diagram to repo and insert image links in document for intuitive structure display.
3. Unified standard technical terms, friendly to both beginner developers and business users.
# LOBSTER-MINI 龙虾迷你版
基于Harness调度架构的开源具身自动化AI智能体

## 项目简介
LOBSTER-MINI 原生深度适配完整Harness智能体分层调度架构，补齐传统纯文本API智能体缺失的**图形界面物理执行层**。
整体采用「三层分层架构 + 底层三位一体执行套件」方案：上层Harness调度核心、中层Node控制服务、底层Docker隔离沙箱集群；单沙箱内部集成 **Docker环境隔离 + open-computer-use桌面操控引擎 + Web网页VNC可视化观测** 三大核心组件。
完整赋予AI屏幕画面识别、OCR文字解析、键鼠仿真操作、多窗口联动交互全套电脑操控能力，实现从纯接口调用文本智能体，到可自主操作真实桌面、网页客户端的具身智能技术跃迁。

## 系统分层架构（配套架构图说明）
### 第一层：上层 Harness 统一调度层
- 全系统统一任务入口，接收业务、大模型下发的桌面自动化任务，管理任务队列、执行优先级、并发限制
- 原生兼容原有Harness业务链路，上层业务代码无需大规模重构，低成本接入桌面自动化能力
- 向下分发操作指令至LOBSTER-MINI中间控制服务，向上收集沙箱回传操作日志、实时截图、异常报错数据
- 完整管控任务全生命周期：任务下发、暂停、重试、快照回滚、任务销毁

### 第二层：中层 LOBSTER-MINI Node 中转控制服务
基于Node.js开发，是调度层与容器沙箱的唯一通信桥梁
1. 容器集群管理：调用Docker Compose批量创建、启停、快照保存/一键重置、销毁隔离沙箱实例
2. 操控指令转发：封装open-computer-use标准化调用接口，下发键鼠、截图、图像识别执行指令
3. VNC可视化网关：统一托管所有沙箱VNC端口映射、访问鉴权，对外提供浏览器直接访问的实时观测地址
4. 数据持久化：缓存存储全流程操作日志、画面截图、AI动作向量数据，统一回传上层用于异常排查复盘

### 第三层：底层 Docker 隔离沙箱执行集群
单任务独立容器隔离运行，多容器组成沙箱集群批量调度，每个沙箱内置两大运行组件：
#### ① open-computer-use 桌面操控引擎（动作执行核心）
- 底层视觉能力：全屏/区域截图、画面OCR文字识别、窗口坐标精准定位
- 人机交互仿真：鼠标单击/双击/拖拽/滚轮、键盘文本输入、系统快捷键模拟
- 实时数据回流：采集操作画面、动作执行结果，推送至中层Node服务持久存储

#### ② Web VNC 可视化桌面观测服务（人机协同通道）
- 免客户端访问：浏览器直接实时渲染沙箱完整桌面画面，同步AI全部操作流程
- 人工实时介入：随时接管键鼠权限，中断自动化流程、手动修正错误操作
- 全流程录像留存：完整画面流归档，可复现识别偏差、动作向量生成异常等问题

### 完整数据流链路
业务/大模型任务请求 → Harness调度层下发自动化任务指令 → Node控制服务创建/复用Docker沙箱实例 → 指令下发沙箱open-computer-use引擎执行桌面操作
同步分支：沙箱桌面画面实时推送Web VNC供人工监控；截图、操作日志、识别结果逐层回流至Harness调度层统一存储管理

## 核心特性
1. **Docker独立沙箱安全隔离体系**
单任务单容器隔离运行，支持自定义CPU、内存资源限额，系统权限白名单管控；中层服务统一提供任务快照功能，一键重置沙箱运行环境。各任务运行环境完全隔绝，互不干扰、不会污染宿主机本地系统。

2. **全维度图形界面自动化操控能力**
依托内置open-computer-use引擎实现完整桌面交互能力：画面截图、全局/局部OCR文字识别、全类型鼠标操作、批量键盘输入、多窗口定位与自动化调度，覆盖网页、PC客户端全部数字界面场景。

3. **Web VNC可视化人机协同架构**
容器内置轻量化VNC桌面流服务，由中层统一做端口转发与鉴权，浏览器开箱即用实时观测AI操作；支持随时人工介入接管修正，所有操作画面、执行步骤全链路日志留存，快速定位视觉识别、动作向量生成异常。

4. **原生兼容Harness完整调度链路**
上层完全复用现有Harness任务队列、任务管理、分发逻辑，仅新增LOBSTER-MINI中层控制服务对接底层桌面执行沙箱，上层业务无需重构开发，低成本为原有文本智能体拓展图形界面自动化能力。

## 适用落地场景
- AI智能办公自动化：网页后台批量填报、表单录入、多页面数据采集
- UI自动化测试：网页/桌面客户端流程巡检、重复操作自动化验证
- 具身AI算法实验：屏幕交互大模型实操训练、人机协同自动化方案验证
- 无人值守批量桌面任务，配套可视化运维，支持随时人工干预纠错

## 分层技术栈
1. 上层任务调度：Harness 智能体调度框架
2. 中层控制网关：Node.js
3. 容器编排集群：Docker Compose
4. 底层桌面动作核心：open-computer-use
5. 实时可视化观测：Web VNC

## 配套架构图标注说明（可直接配图使用）
1. 顶层模块：Harness Task Scheduler 任务调度核心
2. 中间核心模块：LOBSTER-MINI Node Service 中转控制服务
3. 底层集群模块：Docker Sandbox Group 隔离沙箱集群
    单个沙箱内子组件：open-computer-use 桌面操控引擎、Web VNC 可视化桌面
4. 双向数据流：下行箭头=调度执行指令；上行箭头=日志、截图、状态回传数据

## 开源协议
MIT License

---
## 补充提示
1. 将本段完整Markdown内容复制到仓库README.md，提交创建文件后刷新仓库首页，架构、特性、场景内容即可完整展示；
2. 建议配套上传系统分层架构图至仓库，在文档内插入图片链接，直观展示三层运行架构；
3. 全文技术名词统一规范，兼顾新手开发者与业务使用者阅读门槛。
