# Jenkins 集成指南

本指南详细介绍了 fx-cli 工具中的 Jenkins 集成功能，帮助您高效地管理和触发 Jenkins 构建任务。

## 前提条件

在使用 Jenkins 集成功能之前，请确保：

1. 您已安装 fx-cli 工具（版本 1.0.0 或更高）
2. 您已成功登录认证（使用 `fx-cli auth` 命令）
3. 您可以访问目标 Jenkins 服务器

## 配置 Jenkins 连接

在首次使用 Jenkins 相关功能前，您需要配置 Jenkins 服务器连接信息。

### 基本配置方法

运行以下命令启动配置向导：

```bash
fx-cli jenkins setup
```

按照提示输入以下信息：

1. **Jenkins URL**：Jenkins 服务器的完整 URL，例如 `https://jenkins.example.com`
2. **用户名**：您的 Jenkins 账号用户名
3. **API Token**：您的 Jenkins API 令牌

> **如何获取 Jenkins API Token？**
> 1. 登录 Jenkins 网站
> 2. 点击右上角的用户名，进入用户配置页面
> 3. 点击 "设置" 或 "Configure"
> 4. 找到 "API Token" 部分
> 5. 点击 "添加新 Token" 或 "Generate Token"
> 6. 输入描述并点击 "生成"
> 7. 复制生成的 Token（请妥善保存，它只会显示一次）

配置完成后，系统会自动测试与 Jenkins 服务器的连接。如果连接成功，您将看到成功提示。

### 使用命令行参数配置

您也可以直接通过命令行参数进行配置：

```bash
fx-cli jenkins setup --url https://jenkins.example.com --username admin --token your_api_token
```

## Jenkins 命令参考

### 触发构建 (`jenkins build`)

用于触发指定 Jenkins 任务的构建。

#### 基本用法

```bash
fx-cli jenkins build <任务名称>
```

#### 示例

```bash
# 触发名为 "my-project-build" 的任务构建
fx-cli jenkins build my-project-build

# 触发带参数的构建
fx-cli jenkins build my-project-build --parameters BRANCH=develop ENV=test

# 多个参数可以用逗号分隔
fx-cli jenkins build my-project-build --parameters "BRANCH=develop,ENV=test,VERSION=1.0.0"

# 等待构建完成
fx-cli jenkins build my-project-build --wait
```

#### 选项

- `--parameters, -p <参数>`: 指定构建参数，格式为 `key=value`，多个参数用逗号分隔
- `--wait`: 等待构建完成后再退出命令

### 查看构建状态 (`jenkins status`)

用于查询指定 Jenkins 任务的构建状态。

#### 基本用法

```bash
fx-cli jenkins status <任务名称>
```

#### 示例

```bash
# 查看最新构建状态
fx-cli jenkins status my-project-build

# 查看特定构建的状态
fx-cli jenkins status my-project-build --build 123
```

#### 选项

- `--build, -b <构建编号>`: 指定要查询的构建编号，默认为最新构建

#### 状态输出说明

- **SUCCESS**: 构建成功
- **FAILURE**: 构建失败
- **UNSTABLE**: 构建不稳定（测试失败但构建本身成功）
- **ABORTED**: 构建被中止
- **IN_PROGRESS**: 构建正在进行中

### 查看构建日志 (`jenkins log`)

用于查看指定 Jenkins 任务的构建日志。

#### 基本用法

```bash
fx-cli jenkins log <任务名称>
```

#### 示例

```bash
# 查看最新构建日志
fx-cli jenkins log my-project-build

# 查看特定构建的日志
fx-cli jenkins log my-project-build --build 123

# 实时跟踪日志输出（类似 tail -f）
fx-cli jenkins log my-project-build --follow
```

#### 选项

- `--build, -b <构建编号>`: 指定要查看的构建编号，默认为最新构建
- `--follow, -f`: 实时跟踪日志输出，直到构建完成

## 高级用法

### 组合使用 Jenkins 命令

您可以将多个 Jenkins 命令组合使用，创建完整的工作流程：

```bash
#!/bin/bash

# 设置任务名称
JOB_NAME="my-project-build"
BRANCH="feature/new-feature"

# 触发构建并获取构建编号
build_output=$(fx-cli jenkins build $JOB_NAME --parameters BRANCH=$BRANCH)
build_number=$(echo $build_output | grep -oP '构建编号: \K\d+')

echo "开始构建任务: $JOB_NAME (构建编号: $build_number)"

# 等待构建完成并实时查看日志
fx-cli jenkins log $JOB_NAME --build $build_number --follow

# 检查构建状态
status=$(fx-cli jenkins status $JOB_NAME --build $build_number)
if [[ $status == *"SUCCESS"* ]]; then
  echo "构建成功！准备部署..."
  # 这里可以添加部署命令
else
  echo "构建失败，请查看日志了解详情"
  exit 1
fi
```

### 配置文件中的 Jenkins 设置

Jenkins 配置保存在 fx-cli 的配置文件中（`~/.fx-cli/config.json`）。您也可以直接编辑配置文件来修改 Jenkins 设置：

```json
{
  "jenkins": {
    "url": "https://jenkins.example.com",
    "username": "your_username",
    "token": "encrypted_token"  // 注意：这里存储的是加密后的 token
  }
}
```

> **注意**：出于安全考虑，token 会以加密形式存储，请勿手动修改此值。请使用 `fx-cli jenkins setup` 命令来更新 Jenkins 配置。

## 故障排除

### 连接失败

如果遇到连接 Jenkins 服务器失败的情况，请检查：

1. Jenkins URL 是否正确
2. 用户名和 API Token 是否正确
3. 网络连接是否正常
4. Jenkins 服务器是否允许 API 访问
5. 防火墙设置是否允许访问 Jenkins 服务器

### 构建触发失败

如果无法成功触发构建，请检查：

1. 任务名称是否正确
2. 用户是否有权限触发该任务
3. 构建参数格式是否正确
4. Jenkins 服务器是否正常运行

### 日志获取失败

如果无法获取构建日志，请检查：

1. 构建编号是否正确
2. 用户是否有权限查看该构建
3. 构建是否已完成或正在运行

## 最佳实践

1. **使用 API Token 而非密码**：API Token 更安全，可以随时撤销而不影响您的账号密码
2. **定期更新 API Token**：出于安全考虑，建议定期更新 Jenkins API Token
3. **使用参数化构建**：充分利用 Jenkins 的参数化构建功能，通过 `--parameters` 选项传递参数
4. **设置合理的超时**：对于长时间运行的构建，考虑在脚本中设置超时机制
5. **保存构建历史**：记录构建编号和结果，便于后续追踪和问题排查

## 常见问题

**Q: 如何获取所有可用的 Jenkins 任务列表？**

A: 目前 fx-cli 暂未提供列出所有任务的命令，您需要在 Jenkins 网页界面查看可用任务。

**Q: 如何取消正在进行的构建？**

A: 目前 fx-cli 暂未提供取消构建的命令，您需要在 Jenkins 网页界面手动取消构建。

**Q: 构建参数有什么限制？**

A: 构建参数的格式必须为 `key=value`，多个参数用逗号分隔。参数值中不应包含逗号或等号，否则可能导致解析错误。

**Q: Jenkins URL 需要包含端口号吗？**

A: 如果 Jenkins 服务器使用非标准端口（80 或 443），请在 URL 中包含端口号，例如 `http://jenkins.example.com:8080`。
