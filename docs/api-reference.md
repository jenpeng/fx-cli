# fx-cli API 参考文档

本文档详细介绍了 fx-cli 工具提供的所有命令、选项和用法。fx-cli 是一个功能强大的纷享销客开发工具命令行界面，支持代码拉取、部署和 Jenkins 集成。

## 全局选项

以下选项可用于所有命令：

- `--help, -h`: 显示命令的帮助信息
- `--version, -v`: 显示 fx-cli 的版本信息
- `--verbose, -V`: 启用详细输出模式，显示更多日志信息
- `--debug, -d`: 启用调试模式，显示所有日志信息

## 命令分类

### 1. 认证相关命令 (`auth`)

用于管理用户认证、登录状态和配置模式。fx-cli 使用证书认证机制，支持全局配置和项目级配置，可实现多项目多服务端支持。

#### `fx-cli auth`

默认执行登录操作，支持交互式选择证书认证方式。

##### 用法

```bash
fx-cli auth [options]
```

##### 选项

- `-l, --logout`: 登出当前账号
- `-s, --status`: 查看认证状态和当前配置模式
- `-p, --project-config`: 创建并使用项目级配置
- `-g, --use-global`: 使用全局配置(默认模式)

##### 示例

```bash
# 交互式登录（证书认证）
fx-cli auth

# 查看认证状态和配置模式
fx-cli auth --status

# 登出当前账号
fx-cli auth --logout

# 在当前项目创建配置
cd your-project
fx-cli auth --project-config

# 切换到项目级配置
fx-cli auth --use-global=false

# 切换到全局配置
fx-cli auth --use-global
```

##### 功能说明

1. **证书认证**：使用数字证书进行身份验证，无需用户名密码
2. **配置模式**：
   - 全局配置：保存在用户主目录的 `.fx-cli` 文件夹
   - 项目配置：保存在项目根目录的 `.fx-cli` 文件夹
3. **多项目支持**：不同项目可以使用不同的服务端配置和认证信息
4. **自动切换**：在项目目录下自动优先使用项目配置，不存在则使用全局配置

### 2. Jenkins 相关命令 (`jenkins`)

用于与 Jenkins 服务器交互，管理和触发构建任务。

#### `fx-cli jenkins setup`

配置 Jenkins 服务器连接信息。

##### 用法

```bash
fx-cli jenkins setup [options]
```

##### 选项

- `--url, -u <Jenkins URL>`: Jenkins 服务器 URL
- `--username, -n <用户名>`: Jenkins 用户名
- `--token, -t <API Token>`: Jenkins API Token

##### 示例

```bash
# 交互式配置
fx-cli jenkins setup

# 使用命令行参数配置
fx-cli jenkins setup --url https://jenkins.example.com --username admin --token my_api_token
```

#### `fx-cli jenkins build`

触发指定 Jenkins 任务的构建。

##### 用法

```bash
fx-cli jenkins build <任务名称> [options]
```

##### 选项

- `--parameters, -p <参数>`: 指定构建参数，格式为 `key=value`，多个参数用逗号分隔
- `--wait`: 等待构建完成后再退出命令

##### 示例

```bash
# 触发构建
fx-cli jenkins build my-project-build

# 带参数的构建
fx-cli jenkins build my-project-build --parameters "BRANCH=develop,ENV=test"

# 等待构建完成
fx-cli jenkins build my-project-build --wait
```

#### `fx-cli jenkins status`

查询指定 Jenkins 任务的构建状态。

##### 用法

```bash
fx-cli jenkins status <任务名称> [options]
```

##### 选项

- `--build, -b <构建编号>`: 指定要查询的构建编号，默认为最新构建

##### 示例

```bash
# 查看最新构建状态
fx-cli jenkins status my-project-build

# 查看特定构建的状态
fx-cli jenkins status my-project-build --build 123
```

#### `fx-cli jenkins log`

查看指定 Jenkins 任务的构建日志。

##### 用法

```bash
fx-cli jenkins log <任务名称> [options]
```

##### 选项

- `--build, -b <构建编号>`: 指定要查看的构建编号，默认为最新构建
- `--follow, -f`: 实时跟踪日志输出，直到构建完成

##### 示例

```bash
# 查看最新构建日志
fx-cli jenkins log my-project-build

# 查看特定构建的日志
fx-cli jenkins log my-project-build --build 123

# 实时跟踪日志
fx-cli jenkins log my-project-build --follow
```

### 3. 配置相关命令 (`config`)

用于管理 fx-cli 的配置选项。

#### `fx-cli config`

显示当前配置。

##### 用法

```bash
fx-cli config
```

##### 示例

```bash
fx-cli config
```

#### `fx-cli config set`

设置配置项。

##### 用法

```bash
fx-cli config set <key> <value>
```

##### 示例

```bash
# 设置日志级别
fx-cli config set log.level info

# 设置 API 超时
fx-cli config set api.timeout 30000
```

#### `fx-cli config get`

获取配置项的值。

##### 用法

```bash
fx-cli config get <key>
```

##### 示例

```bash
# 获取日志级别
fx-cli config get log.level

# 获取完整的 Jenkins 配置
fx-cli config get jenkins
```

#### `fx-cli config delete`

删除配置项。

##### 用法

```bash
fx-cli config delete <key>
```

##### 示例

```bash
# 删除特定配置项
fx-cli config delete log.file
```

#### `fx-cli config reset`

重置所有配置到默认值。

##### 用法

```bash
fx-cli config reset [options]
```

##### 选项

- `--hard`: 彻底重置，包括删除所有自定义配置和凭证

##### 示例

```bash
# 重置基本配置
fx-cli config reset

# 彻底重置（包括凭证）
fx-cli config reset --hard
```

### 4. 代码相关命令 (`code`)

用于管理代码仓库和部署。

#### `fx-cli code pull`

从纷享销客平台拉取代码。

##### 用法

```bash
fx-cli code pull [options] [resourceName]
```

##### 选项

- `--project, -p <项目ID>`: 指定项目 ID
- `--branch, -b <分支名>`: 指定分支名称，默认为 master/main
- `--output, -o <输出目录>`: 指定输出目录，默认为当前目录
- `--force`: 强制覆盖现有文件
- `--type, -t <类型>`: 指定资源类型 (component/plugin/class/function/all)
- `--all`: 拉取所有资源

##### 示例

```bash
# 拉取默认项目
fx-cli code pull

# 拉取指定项目
fx-cli code pull --project PROJECT123

# 拉取指定分支
fx-cli code pull --project PROJECT123 --branch develop

# 拉取特定组件
fx-cli pull componentName --type component

# 拉取特定插件 - 注意：插件将使用API返回的name属性创建文件夹，而非命令行中的apiName
fx-cli pull pluginApiName --type plugin

# 拉取特定函数
fx-cli pull functionName --type function

# 拉取特定类
fx-cli pull className --type class

# 拉取指定类型的所有资源
fx-cli pull component --all
fx-cli pull plugin --all
fx-cli pull function --all
fx-cli pull class --all

# 拉取所有资源
fx-cli pull --type all
```

##### 注意事项

- 当拉取插件时，文件夹名称由API返回的name属性决定，可能与命令行中指定的apiName不同
- 推送到服务器时，请使用实际的文件夹名称作为推送参数

#### `fx-cli code push`

将本地代码推送到纷享销客平台。

##### 用法

```bash
fx-cli code push [options] [resourceName]
```

##### 选项

- `--type, -t <类型>`: 指定资源类型 (component/plugin/function/class)
- `--path, -p <路径>`: 资源路径或文件路径（可选，未指定时自动选择默认目录）
- `--project, -p <项目ID>`: 指定项目 ID
- `--branch, -b <分支名>`: 指定分支名称，默认为 master/main

##### 功能特性

- **智能路径选择**：当未指定 `-p` 参数时，系统会根据 `-t` 类型自动选择对应的默认目录
- **批量推送**：支持一次性推送整个目录下的所有资源文件
- **自动判断**：系统自动判断资源是否存在，决定是创建还是更新
- **类型验证**：确保推送的资源类型与指定的类型匹配
- **容错机制**：函数推送具备多层容错，处理"函数已存在但查询不到"等复杂场景

##### 默认目录映射

- `class`: `fx-app/main/APL/classes`
- `function`: `fx-app/main/APL/functions`
- `component`: `fx-app/main/PWC`
- `plugin`: `fx-app/main/PWC`

##### 示例

```bash
# 推送所有类文件（推荐用法）
fx-cli push -t class

# 推送指定路径的类文件
fx-cli push -t class -p fx-app/main/APL/classes

# 推送单个类文件
fx-cli push -t class -p MyLibraryClass.groovy

# 推送所有函数文件（推荐用法）
fx-cli push -t function

# 推送指定路径的函数文件
fx-cli push -t function -p fx-app/main/APL/functions

# 推送单个函数文件
fx-cli push -t function -p MyFunction.groovy

# 推送所有组件
fx-cli push -t component

# 推送指定路径的组件
fx-cli push -t component -p MyComponent

# 推送所有插件
fx-cli push -t plugin

# 推送指定路径的插件
fx-cli push -t plugin -p MyPlugin
```

##### 函数推送容错机制

函数推送包含三层容错机制，确保在各种复杂情况下都能成功推送：

1. **强制更新**：当遇到"函数已存在"错误时，直接使用函数信息进行更新
2. **灵活查询**：当强制更新失败时，尝试仅使用apiName查询函数
3. **直接更新**：当查询也失败时，使用本地元数据直接更新

这种多层容错机制特别适用于处理"函数已存在但查询不到"的冲突场景。

##### 注意事项

- 当推送单个文件时，系统会自动检查unchangeableJson.json文件中的记录
- 推送单个文件时，必须指定资源类型
- 对于插件，推送时请使用实际的文件夹名称作为推送参数
- 如果推送成功，会更新unchangeableJson.json中对应记录的updateTime字段

#### `fx-cli code deploy`

部署代码到纷享销客平台。

##### 用法

```bash
fx-cli code deploy [options]
```

##### 选项

- `--project, -p <项目ID>`: 指定项目 ID
- `--environment, -e <环境>`: 指定部署环境（dev/test/prod）
- `--message, -m <部署描述>`: 添加部署描述信息
- `--path, -d <代码结束>: 要部署的代码路径，默认为当前目录

##### 示例

```bash
# 部署到默认环境
fx-cli code deploy --project PROJECT123

# 部署到测试环境
fx-cli code deploy --project PROJECT123 --environment test

# 添加部署描述
fx-cli code deploy --project PROJECT123 --message "修复登录页面问题"
```

### 5. 推送相关命令

用于推送代码资源到远程服务器，支持组件、插件、函数和类的推送。

#### `fx-cli push`

推送指定的代码资源。

##### 用法

```bash
fx-cli push [name] [options]
```

##### 参数

- `name`: 资源名称（可选，当指定单个文件或目录时使用）

##### 选项

- `-t, --type <type>`: **必需**，指定资源类型（component/plugin/function/class）
- `-p, --path <path>`: 资源路径（可选，如果不指定则根据类型自动选择目录）
  - `component`: 默认使用 `fx-app/main/PWC` 目录
  - `plugin`: 默认使用 `fx-app/main/PWC` 目录  
  - `function`: 默认使用 `fx-app/main/APL/functions` 目录
  - `class`: 默认使用 `fx-app/main/APL/classes` 目录

##### 示例

```bash
# 推送所有类文件（自动扫描classes目录）
fx-cli push -t class

# 推送指定路径的类文件
fx-cli push -t class -p fx-app/main/APL/classes

# 推送所有函数文件
fx-cli push -t function

# 推送指定路径的组件
fx-cli push -t component -p my-component

# 推送指定路径的插件
fx-cli push -t plugin -p my-plugin
```

##### 功能说明

1. **智能路径选择**：当未指定路径时，系统会根据类型自动选择对应的默认目录
2. **批量推送**：支持推送整个目录下的所有相关文件
3. **类型验证**：确保推送的文件类型与指定的类型匹配
4. **自动更新**：推送成功后自动更新本地的配置文件

#### `fx-cli github-push`

从GitHub仓库提取代码并推送到服务端，支持Vue组件、JavaScript插件、Groovy/Java函数和类的分类推送。

##### 用法

```bash
fx-cli github-push [options]
```

##### 选项

- `--repo <repository-url>`: **必需**，GitHub仓库URL
- `--branch <branch-name>`: 指定分支名称，默认为main/master
- `--commit <commit-id>`: 指定提交ID
- `--path <directory-path>`: 指定仓库中的目录路径
- `--token <github-token>`: GitHub访问令牌
- `--local-unchangeable-json <file-path>`: 指定本地unchangeableJson.json文件路径
- `--no-auto-auth`: 禁用自动认证功能
- `--type <type>`: 限制推送的资源类型（component/plugin/function/class/all）

##### 示例

```bash
# 从GitHub仓库推送代码（自动认证）
fx-cli github-push --repo https://github.com/username/repository.git

# 从特定分支推送代码
fx-cli github-push --repo https://github.com/username/repository.git --branch develop

# 从特定提交推送代码
fx-cli github-push --repo https://github.com/username/repository.git --commit a1b2c3d4

# 推送仓库中特定目录的代码
fx-cli github-push --repo https://github.com/username/repository.git --path src/components

# 推送特定类型的资源
fx-cli github-push --repo https://github.com/username/repository.git --type component

# 使用本地unchangeableJson.json文件
fx-cli github-push --repo https://github.com/username/repository.git --local-unchangeable-json /path/to/local/unchangeableJson.json

# 禁用自动认证
fx-cli github-push --repo https://github.com/username/repository.git --no-auto-auth
```

##### 功能说明

1. **自动认证**：从GitHub仓库中的.fx-cli/config.json自动获取认证信息
2. **智能代码识别**：自动识别Vue组件、JavaScript插件、Groovy/Java函数和类
3. **unchangeableJson支持**：处理unchangeableJson.json文件，避免重复创建已存在的资源
4. **灵活的仓库选择**：支持按分支、提交ID、特定目录推送
5. **详细的进度显示**：实时显示推送进度和状态更新
6. **自动重试机制**：处理网络错误和服务端异常
7. **分类推送**：支持按资源类型过滤推送内容

##### 支持的资源类型

| 资源类型 | 文件扩展名 | 识别规则 |
|---------|-----------|--------|
| Vue组件 | .vue | 包含`<template>`、`<script>`和`<style>`标签 |
| JavaScript插件 | .js | ES6模块或CommonJS模块导出 |
| Groovy/Java函数 | .groovy, .java | 函数定义模式 |
| Groovy/Java类 | .groovy, .java | 类定义模式 |

##### 自动认证工作原理

1. 检查GitHub仓库中的`.fx-cli/config.json`文件
2. 验证认证信息是否有效
3. 如果有效且与当前配置不同，自动应用新的认证配置
4. 继续执行正常的推送流程

##### unchangeableJson.json支持

1. 自动检查本地或GitHub仓库中的`unchangeableJson.json`文件
2. 读取已推送资源的记录信息
3. 确保已存在的资源被更新而非重复创建
4. 在推送结果中标记资源是否为新创建

### 6. 日志相关命令 (`log`)

用于管理和查看 fx-cli 的日志。

#### `fx-cli log`

显示最近的日志信息。

##### 用法

```bash
fx-cli log [options]
```

##### 选项

- `--level, -l <级别>`: 按日志级别过滤（debug/info/warn/error）
- `--lines, -n <行数>`: 显示最近的指定行数
- `--follow, -f`: 实时跟踪日志输出

##### 示例

```bash
# 显示所有日志
fx-cli log

# 显示错误级别日志
fx-cli log --level error

# 显示最近 50 行日志
fx-cli log --lines 50
```

#### `fx-cli log clear`

清空日志文件。

##### 用法

```bash
fx-cli log clear
```

##### 示例

```bash
fx-cli log clear
```

## 环境变量

fx-cli 支持通过环境变量来配置某些选项：

| 环境变量 | 说明 | 对应配置项 |
|---------|------|-----------|
| FX_CLI_LOG_LEVEL | 日志级别 | log.level |
| FX_CLI_API_URL | API 基础 URL | api.baseUrl |
| FX_CLI_API_TIMEOUT | API 请求超时时间（毫秒） | api.timeout |
| FX_CLI_JENKINS_URL | Jenkins 服务器 URL | jenkins.url |
| FX_CLI_JENKINS_USERNAME | Jenkins 用户名 | jenkins.username |
| FX_CLI_JENKINS_TOKEN | Jenkins API Token | jenkins.token |

## 配置文件结构

fx-cli 的配置文件位于 `.fx-cli/config.json`，其结构如下：

```json
{
  "api": {
    "baseUrl": "https://api.example.com",
    "timeout": 30000
  },
  "jenkins": {
    "url": "https://jenkins.example.com",
    "username": "your_username",
    "token": "encrypted_token"
  },
  "log": {
    "level": "info",
    "file": ".fx-cli/fx-cli.log"
  },
  "auth": {
    "username": "encrypted_username",
    "token": "encrypted_token",
    "expiry": "2023-12-31T23:59:59Z"
  }
}
```

## 退出码

fx-cli 使用以下退出码表示执行结果：

- `0`: 命令成功执行
- `1`: 通用错误（如参数错误、配置错误等）
- `2`: 网络错误（如连接失败、超时等）
- `3`: 认证错误（如登录失败、权限不足等）
- `4`: 服务器错误（如 API 返回错误等）
- `5`: 资源错误（如文件不存在、目录无法访问等）

## 命令别名

为了提高使用效率，fx-cli 支持以下命令别名：

| 命令 | 别名 |
|-----|------|
| `auth` | `a` |
| `jenkins` | `j` |
| `config` | `c` |
| `code` | `co` |
| `log` | `l` |

例如，您可以使用 `fx-cli a login` 代替 `fx-cli auth login`。

## 批处理模式

对于自动化脚本和批处理任务，fx-cli 提供了批处理模式，可以通过以下方式启用：

1. 使用环境变量 `FX_CLI_BATCH_MODE=true`
2. 对于支持的命令，添加 `--non-interactive` 选项

在批处理模式下：

- 所有交互式提示将被禁用
- 错误信息会以机器可读的格式输出
- 失败时会返回相应的退出码

## 示例脚本

以下是一些常用的示例脚本，展示了 fx-cli 如何在实际场景中使用：

### 自动构建和部署流程

```bash
#!/bin/bash

# 设置变量
PROJECT_ID="PROJECT123"
JOB_NAME="my-project-build"
ENVIRONMENT="test"
DEPLOY_MESSAGE="每日自动部署 $(date +'%Y-%m-%d')"

# 检查登录状态
login_status=$(fx-cli auth --non-interactive)
if [[ $login_status == *"未登录"* ]]; then
  echo "请先登录"
  exit 1
fi

# 触发 Jenkins 构建
echo "触发 Jenkins 构建..."
build_output=$(fx-cli jenkins build $JOB_NAME --wait --parameters ENV=$ENVIRONMENT)
build_number=$(echo $build_output | grep -oP '构建编号: \K\d+')

# 检查构建状态
echo "检查构建状态..."
build_status=$(fx-cli jenkins status $JOB_NAME --build $build_number)
if [[ $build_status != *"SUCCESS"* ]]; then
  echo "构建失败: $build_status"
  exit 2
fi

# 部署代码
echo "部署代码到 $ENVIRONMENT 环境..."
fx-cli code deploy --project $PROJECT_ID --environment $ENVIRONMENT --message "$DEPLOY_MESSAGE"

echo "部署完成！"
```

### 代码更新监控脚本

```bash
#!/bin/bash

# 设置变量
PROJECT_ID="PROJECT123"
OUTPUT_DIR="/path/to/project"
CHECK_INTERVAL=3600  # 1 小时检查一次

while true; do
  echo "检查代码更新..."
  # 使用 force 选项覆盖现有文件
  fx-cli code pull --project $PROJECT_ID --output $OUTPUT_DIR --force
  
  # 检查是否有新的代码变更
  git -C $OUTPUT_DIR status
  
  echo "等待下一次检查..."
  sleep $CHECK_INTERVAL
done
```

## 版本兼容性

fx-cli 的 API 参考文档基于版本 1.0.0。随着版本更新，命令和选项可能会有变化。请使用 `--help` 选项查看您当前安装版本的最新文档。