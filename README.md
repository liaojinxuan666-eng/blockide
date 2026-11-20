# 积木 IDE —— 像拼积木一样写 C / C++ / Swift

一个基于 **Node.js 零依赖** 的积木式编程 IDE。拖积木拼程序，实时生成代码，**代码与积木真正双向同步**，内置解释器可直接运行看结果。

在线访问：https://liaojinxuan666-eng.github.io/blockide/ （已开启 GitHub Pages，打开即用）

## 运行

```bash
cd blockide
node server.js
# 浏览器打开 http://localhost:3000
```

兼容 Node.js 18+，无需 `npm install`（纯原生模块）。

## 核心功能

| 功能 | 说明 |
|---|---|
| 积木拖拽拼装 | Pointer Events 实现，兼容鼠标 / 触屏；支持拖入、调整顺序、删除 |
| 三种语言代码生成 | C / C++ / Swift 一键切换，类型映射、printf/cout/print、循环/条件语法各自适配 |
| **代码 ↔ 积木真双向** | 拖积木实时生成代码；**直接编辑代码点击「应用」即可反解析回积木树**；点积木/代码行双向高亮 |
| 内置解释器 | 无需系统编译器，直接运行积木树，变量/循环/条件/表达式/数组求值，输出到控制台 |
| 撤销 / 重做 | 支持 Ctrl+Z / Ctrl+Shift+Z，60 步历史 |
| 积木搜索 | 按名称实时过滤积木 |
| 多示例程序 | 累加求和、阶乘、数组遍历、斐波那契、逻辑比较 |
| 导入 / 导出 | 导出源码文件（.c/.cpp/.swift），导入源码自动转成积木 |
| 实时编辑 | 改积木参数代码即时更新 |
| 本地持久化 | 状态存 localStorage，刷新不丢失 |

## 积木类型（30+ 种）

- **流程**：程序、注释、break、continue
- **输入输出**：打印、读入变量
- **变量**：声明、赋值、自增/自减、变量引用
- **数组**：声明数组、设置元素、读取元素、数组长度
- **控制**：如果 / 如果否则、重复(for)、遍历数组、当(while)
- **运算**：数字、文本、布尔、二元运算（+ - × ÷ % 比较 且 或）、非、数学函数(abs/sqrt/pow/min/max/round)、字符串长度
- **函数**：定义函数、调用函数、返回

## 技术实现

四层架构，全部零依赖：

| 文件 | 职责 |
|---|---|
| `js/blocks.js` | 积木模型定义、分类、示例程序 |
| `js/generators.js` | 积木树 → C/C++/Swift 源码 + 行号映射（高亮用） |
| `js/engine.js` | 积木树解释器，直接执行 |
| `js/parser.js` | **源码 → 积木树**：词法分析（带行号）+ 递归下降解析，支持表达式优先级、三种语言语法差异 |
| `js/app.js` | 渲染 / 拖拽 / 双向同步 / 撤销重做 / 导入导出 |

代码→积木的解析支持：变量声明/赋值、for/while/if-else、数组、函数调用、printf/cout/print，以及完整的表达式优先级。已通过 5 个示例 × 3 种语言 = 15 组「生成→反解析→运行」往返一致性测试。

## 从原型到 iOS App

本原型是纯前端架构，后续可用 Capacitor 打包：

```bash
npm i @capacitor/core @capacitor/cli
npx cap init
npx cap add ios
npx cap sync
npx cap open ios   # 需要 macOS + Xcode
```

若要真机编译 C/C++/Swift 代码，可对接在线编译 API 或 WebAssembly 编译器（clang.wasm / SwiftWasm）。
