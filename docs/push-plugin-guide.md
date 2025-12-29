# Push Plugin 使用指南

## 概述

`fx-cli push -t plugin` 命令用于将本地开发的插件推送到远程服务器。本文档详细介绍如何使用 `push` 命令推送插件资源。

## 基本语法

```bash
fx-cli push -t plugin [options]
```

### 参数说明

- `-t, --type`: 资源类型，此处为 `plugin`
- `-p, --path`: 插件路径或名称（可选）
- `-f, --file`: 指定文件路径（可选）
- `-h, --help`: 显示帮助信息

## 推送插件的多种方式

### 1. 推送所有插件

```bash
fx-cli push -t plugin
```

此命令会扫描 `fx-app/main/PWC/plugins` 目录下的所有子目录，并推送每个包含 `plugin.xml` 文件的插件。

### 2. 推送指定插件

```bash
fx-cli push -t plugin -p MyPlugin
```

推送名为 `MyPlugin` 的插件。系统会在 `fx-app/main/PWC/plugins` 目录下查找该插件。

### 3. 推送指定路径的插件

```bash
fx-cli push -t plugin /path/to/plugin
```

推送指定路径下的插件。可以是绝对路径或相对路径。

### 4. 推送当前目录的插件

```bash
fx-cli push -t plugin .
```

推送当前目录作为插件。

## 插件目录结构

插件目录应包含以下结构：

```
MyPlugin/
├── plugin.xml          # 插件配置文件（必需）
├── sourceFiles/        # 源代码目录（可选）
│   └── index.js        # 插件入口文件
├── fileTree/           # 文件树目录（可选，与sourceFiles二选一）
└── static/             # 静态资源目录（可选）
    └── README.md       # 静态资源文件
```

## 插件推送流程

当执行插件推送命令时，系统会按照以下流程进行处理：

1. **参数解析**: 解析命令行参数，确定推送类型和目标
2. **路径解析**: 根据 `-p` 参数或默认规则确定要推送的插件路径
3. **插件验证**: 验证插件目录中是否包含必要的 `plugin.xml` 文件
4. **文件收集**: 收集插件目录中的所有文件，包括源代码和静态资源
5. **数据打包**: 将文件数据打包成适合传输的格式
6. **API调用**: 调用服务器API推送插件数据
7. **结果处理**: 处理服务器响应，显示推送结果

## 插件版本冲突处理

插件推送实现了智能的版本冲突处理机制：

### 自动版本同步

当遇到"当前代码在线上有更高版本"错误时，系统会自动执行以下操作：

1. 从服务器获取最新的插件信息
2. 更新本地 `unchangeableJson.json` 文件中的 `updateTime`
3. 使用正确的时间戳重试推送，无需手动干预

### 智能重试机制

针对不同类型的错误，系统采用不同的重试策略：

- **系统异常**：尝试将 `updateTime` 设置为 0
- **版本冲突**：从服务器获取最新信息
- **重复名称错误**：使用正确的时间戳

### 插件键名智能判断

系统会根据 `unchangeableJson.json` 中插件是否已存在，智能选择使用原始插件名称或清理后的插件名称作为键名，确保插件记录的一致性和可追溯性。

## 插件错误处理

系统实现了完善的插件错误处理机制：

### 错误分类与处理

- **系统提示类错误**：如"提示信息"、"系统提示"等会被降级为警告，避免中断用户操作
- **权限不足、参数错误、资源不存在等错误**：会被分类处理，提供相应的解决建议

### 具体错误处理

- **文件不存在错误**：检查插件目录和必要文件是否存在
- **API 请求错误**：处理网络请求失败，解析服务器返回的错误信息
- **系统提示错误**：将错误级别降级为警告，避免中断用户操作
- **版本冲突错误**：自动从服务器获取最新信息并重试

## 插件注意事项

1. 插件目录必须包含 `plugin.xml` 文件，否则推送会失败
2. 推送前请确保已正确配置认证信息
3. 如果推送失败，请检查网络连接和服务器状态
4. 推送成功后，系统会自动更新 `unchangeableJson.json` 文件中的插件记录
5. 系统会自动处理版本冲突，无需手动干预
6. 插件推送使用固定的 `plugin.xml` 文件名，不再依赖插件名称

## 使用示例

### 开发场景示例

假设您正在开发一个名为 `MyPlugin` 的插件：

1. **开发完成后，推送单个插件**:
   ```bash
   fx-cli push -t plugin -p MyPlugin
   ```

2. **开发多个插件后，一次性推送所有插件**:
   ```bash
   fx-cli push -t plugin
   ```

3. **推送特定路径下的插件**:
   ```bash
   fx-cli push -t plugin ./plugins/MyPlugin
   ```

### 团队协作示例

1. **拉取最新代码**:
   ```bash
   fx-cli pull --type all
   ```

2. **进行开发工作**

3. **推送修改的插件**:
   ```bash
   fx-cli push -t plugin -p ModifiedPlugin
   ```

4. **推送所有修改的资源**:
   ```bash
   fx-cli push -t plugin
   fx-cli push -t component
   fx-cli push -t function
   fx-cli push -t class
   ```

## 常见问题与解决方案

### 1. 找不到 plugin.xml 文件

**错误信息**: `找不到 plugin.xml 文件`

**解决方案**: 确保插件目录中包含 `plugin.xml` 文件，这是插件的必要配置文件。

### 2. 推送失败

**错误信息**: `系统出现异常，请稍后重试或保存截图并反馈给系统管理员`

**解决方案**: 
- 检查网络连接是否正常
- 确认认证信息是否有效
- 稍后重试或联系系统管理员

### 3. 插件不存在

**错误信息**: `路径不存在: /path/to/plugin`

**解决方案**: 
- 确认插件路径是否正确
- 检查插件是否已创建
- 使用 `ls` 命令查看插件目录

### 4. 版本冲突

**错误信息**: `当前代码在线上有更高版本`

**解决方案**: 
- 系统会自动处理版本冲突，无需手动干预
- 如果自动处理失败，可以尝试重新执行推送命令
- 确保本地代码与服务器代码的兼容性

## 最佳实践

1. **定期推送**: 开发过程中定期推送插件，避免代码丢失
2. **推送前验证**: 推送前确保插件目录结构完整，包含必要的配置文件
3. **全量推送**: 在重要里程碑或发布前，使用全量推送确保所有插件都已更新
4. **团队协作**: 团队成员应定期拉取最新代码，避免冲突
5. **版本管理**: 利用系统的自动版本冲突处理功能，减少手动干预

## 高级用法

### 结合脚本使用

可以编写脚本批量推送多个插件：

```bash
#!/bin/bash
# 推送多个指定插件
plugins=("PluginA" "PluginB" "PluginC")

for plugin in "${plugins[@]}"; do
  echo "推送插件: $plugin"
  fx-cli push -t plugin -p "$plugin"
done
```

### 与 CI/CD 集成

可以将插件推送集成到 CI/CD 流程中：

```yaml
# 示例 GitHub Actions 工作流
name: Push Plugins

on:
  push:
    branches: [ main ]
    paths:
      - 'fx-app/main/PWC/plugins/**'

jobs:
  push-plugins:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '16'
    - name: Install fx-cli
      run: npm install -g fx-cli
    - name: Push all plugins
      run: fx-cli push -t plugin
```

## 总结

`fx-cli push -t plugin` 命令提供了灵活的插件推送方式，支持单个推送、全量推送和指定路径推送等多种模式。系统还实现了智能的版本冲突处理机制，能够自动处理版本同步问题，大大提高了开发效率。

在实际开发中，建议根据团队协作模式和项目需求选择合适的推送策略，并遵循最佳实践，确保开发流程的顺畅。