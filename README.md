# 积木 IDE —— 像拼积木一样写 C / C++ / Swift

一个基于 **Node.js 零依赖** 的积木式编程 IDE Web 原型。拖积木拼程序，实时生成代码，内置解释器可直接运行看结果。

## 运行

```bash
cd /workspace/blockide
node server.js
# 浏览器打开 http://localhost:3000
```

兼容 Node.js 18+，无需 `npm install`（纯原生模块）。

## 已实现功能

| 功能 | 说明 |
|---|---|
| 积木拖拽拼装 | Pointer Events 实现，兼容鼠标 / 触屏；支持从积木盒拖入、画布内调整顺序、删除 |
| 三种语言代码生成 | C / C++ / Swift 实时切换，类型映射、printf/cout/print、for/while/if 语法各自适配 |
| 双向高亮联动 | 点积木 → 高亮对应代码行；点代码行 → 选中对应积木 |
| 内置解释器 | 无需系统编译器，直接"运行"积木树，变量/循环/条件/表达式求值，输出到控制台 |
| 实时编辑 | 改积木参数（变量名、数值、运算符、类型）代码即时更新 |
| 本地持久化 | 状态存 localStorage，刷新不丢失；「重置」恢复示例程序 |
| iOS 风格 UI | iOS 配色与圆角，窄屏自动单栏适配，可直接用 Capacitor 打包成 iOS App |

## 积木类型

- **流程**：程序（根）、注释
- **变量**：声明变量、赋值、变量引用
- **I/O**：打印
- **控制**：如果 / 如果否则、重复(for)、当(while)
- **运算**：数字、文本、布尔、二元运算（+ - × ÷ % 比较）
- **函数**：定义函数、返回

## 目录结构

```
blockide/
├── server.js              # Node 静态服务
├── public/
│   ├── index.html
│   ├── styles.css
│   └── js/
│       ├── blocks.js      # 积木模型定义与默认程序
│       ├── generators.js  # 积木树 → C/C++/Swift 代码 + 行号映射
│       ├── engine.js      # 积木树解释器
│       └── app.js         # 渲染 / 拖拽 / 联动 / 事件
```

## 从原型到 iOS App

本原型是纯前端架构，后续可用 Capacitor 打包：

```bash
npm i @capacitor/core @capacitor/cli
npx cap init
npx cap add ios
npx cap sync
npx cap open ios   # 需要 macOS + Xcode
```

若要真机编译 C/C++/Swift 代码，可对接在线编译 API 或 WebAssembly 编译器（如 clang.wasm / SwiftWasm）。
