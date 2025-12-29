# 更新日志

本文档记录了 fx-cli 项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 新增
- 添加打包和发布指南文档
- 添加从本地包安装的说明

## [1.0.0] - 2025-12-29

### 新增
- 初始版本发布
- 支持组件和插件管理
- 支持项目构建和打包
- 支持Jenkins集成
- 支持配置管理
- 支持完善的日志和错误处理机制

### 命令
- `auth` - 登录认证管理
- `init` - 项目初始化
- `create` - 创建资源文件
- `pull` - 拉取资源文件
- `push` - 推送资源文件
- `deploy` - 推送并部署
- `jenkins` - Jenkins集成相关命令
- `config` - 配置管理

### 支持的资源类型
- 组件 (component)
- 插件 (plugin)
- 函数 (function)
- 类 (class)

### 文档
- 完整的API参考文档
- 快速入门指南
- 实现文档
- 各种推送功能的详细说明