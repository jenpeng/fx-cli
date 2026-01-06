# GitHub代码推送功能

GitHub代码推送功能允许用户从GitHub仓库中提取代码，并将其推送到服务端。该功能支持Vue组件、JavaScript插件、Groovy/Java函数和类的分类推送，并提供详细的进度显示和错误处理机制。

## 快速开始

1. 配置GitHub访问令牌：
   ```bash
   fx-cli config set github.token YOUR_GITHUB_TOKEN
   ```

2. 从GitHub仓库推送代码（自动认证）：
   ```bash
   fx-cli github-push --repo https://github.com/username/repository.git
   ```

## 主要特性

- 支持Vue组件、JavaScript插件、Groovy/Java函数和类的分类推送
- 灵活的仓库选择（分支、提交ID、特定目录）
- 实时进度显示和状态更新
- 自动重试机制和详细的错误提示
- 推送历史记录和追踪
- 仓库配置管理
- 统一的代码识别规则和元数据提取
- **支持unchangeableJson.json文件处理，避免重复创建已存在的资源**
- **自动认证功能，从GitHub仓库中的.fx-cli/config.json自动获取认证信息**

## 自动认证功能

GitHub推送功能现在支持自动认证，可以从GitHub仓库中的`.fx-cli/config.json`文件自动读取认证配置并应用到本地环境，实现无感知的认证流程。

### 工作原理

1. 执行`github-push`命令时，系统会首先检查GitHub仓库中的`.fx-cli/config.json`文件
2. 如果找到配置文件，会验证其中的认证信息是否有效
3. 如果认证信息有效且与当前配置不同，会自动应用新的认证配置
4. 如果认证信息无效或与当前配置相同，则跳过自动认证流程
5. 继续执行正常的推送流程

### 使用方法

```bash
# 启用自动认证（默认）
fx-cli github-push --repo https://github.com/username/repository.git

# 禁用自动认证
fx-cli github-push --repo https://github.com/username/repository.git --no-auto-auth
```

### 配置文件格式

GitHub仓库中的`.fx-cli/config.json`文件应包含以下认证信息：

```json
{
  "auth": {
    "domain": "your-domain.com",
    "certificate": "your-certificate-content",
    "lastAuth": "2023-01-01T00:00:00.000Z"
  },
  "project": {
    "rootDir": "./",
    "defaultType": "component",
    "defaultOutputDir": "./fx-app"
  }
}
```

详细文档请参考：[自动认证功能详解](../../../docs/github-push-auto-auth.md)

## 代码识别规则

### Vue组件 (.vue)
- 识别包含`<template>`、`<script>`和`<style>`标签的文件
- 提取组件名称、API名称、绑定对象API名称等元数据
- 语言类型设置为vue (1)

### JavaScript插件 (.js)
- 识别ES6模块和CommonJS模块导出
- 提取插件名称、API名称、绑定对象API名称等元数据
- 语言类型设置为javascript (2)

### Groovy/Java函数 (.groovy, .java)
- 识别函数定义模式
- 提取函数名称、API名称、绑定对象API名称等元数据
- 语言类型设置为groovy (0)

### Groovy/Java类 (.groovy, .java)
- 识别类定义模式
- 提取类名称、API名称、绑定对象API名称等元数据
- 语言类型设置为groovy (0)

## unchangeableJson.json文件支持

GitHub推送功能现在支持识别和处理项目中的`unchangeableJson.json`文件，该文件包含已推送资源的记录信息。当推送代码时，系统会：

1. 自动检查本地或GitHub仓库中的`unchangeableJson.json`文件
2. 读取文件中记录的组件、插件、函数和类信息
3. 将这些信息传递给推送服务，确保已存在的资源被更新而非重复创建
4. 在推送结果中标记资源是否为新创建

### 指定unchangeableJson.json文件位置

```bash
# 使用本地文件
fx-cli github-push --repo https://github.com/username/repository.git --local-unchangeable-json /path/to/local/unchangeableJson.json

# 使用仓库中的文件（默认行为）
fx-cli github-push --repo https://github.com/username/repository.git
```

## 详细文档

查看[完整文档](./github-push-implementation.md)了解更多详细信息，包括：
- 安装和配置指南
- 高级使用选项
- 详细的代码识别规则和元数据提取
- 仓库配置管理
- unchangeableJson.json文件处理详解
- 错误处理和故障排除
- API参考和最佳实践

## 更新日志

### v1.2.0
- **新增**：支持unchangeableJson.json文件处理，避免重复创建已存在的资源
- **改进**：推送结果中包含资源是否为新创建的标记
- **优化**：支持从本地或GitHub仓库读取unchangeableJson.json文件

### v1.1.0
- 更新代码识别规则，与现有pushService.js和相关服务保持一致
- 改进元数据提取方式，支持更多属性
- 优化Groovy/Java函数和类的识别逻辑
- 修复数据结构不一致问题