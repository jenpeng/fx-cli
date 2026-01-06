# 快速入门指南

本指南将帮助您快速上手使用 fx-cli 工具，完成基本的开发和部署流程。

## 安装 fx-cli

### 前提条件

在安装 fx-cli 之前，请确保您的系统已安装以下软件：

- **Node.js**: 版本 14.0.0 或更高
- **npm** 或 **yarn**: Node.js 包管理器

您可以通过以下命令检查 Node.js 和 npm 的版本：

```bash
node -v
npm -v
```

### 安装命令

使用 npm 全局安装 fx-cli：

```bash
npm install -g fx-cli
```

或者使用 yarn 全局安装：

```bash
yarn global add fx-cli
```

### 验证安装

安装完成后，您可以运行以下命令验证 fx-cli 是否已正确安装：

```bash
fx-cli --version
```

如果安装成功，将显示 fx-cli 的版本号。

## 第一步：登录认证

在使用 fx-cli 的大多数功能之前，您需要先进行登录认证。fx-cli 使用证书认证机制，不需要用户名和密码，只需提供有效的证书文件或证书内容。

### 执行登录命令

```bash
fx-cli auth
```

### 输入认证信息

运行上述命令后，系统会引导您：
1. **服务器域名**：您的纷享销客系统域名，例如 `example.fxiaoke.com`
2. 选择认证方式（证书文件或直接输入证书内容）
3. 根据选择提供证书文件路径或证书内容

输入完成后，系统会验证您的认证信息。如果验证成功，您将看到成功提示。

### 验证认证状态

您可以使用以下命令检查当前的认证状态：

```bash
fx-cli auth --status
```

### 登出当前账号

```bash
# 登出当前账号
fx-cli auth --logout
```

## 第二步：项目级配置管理 (支持多服务端)

fx-cli 支持两种配置模式：全局配置和项目级配置。这使得您可以在不同项目中使用不同的服务端认证信息。

### 创建项目级配置

在项目目录下执行以下命令，为当前项目创建独立的配置：

```bash
# 在项目根目录下执行
cd your-project-directory
fx-cli auth --project-config
```

创建成功后，配置文件会保存在项目目录的 `.fx-cli/config.json` 文件中。

### 切换配置模式

```bash
# 切换到项目级配置
fx-cli auth --use-global=false

# 切换到全局配置
fx-cli auth --use-global
```

### 配置模式说明

- **全局配置**：默认模式，配置文件位于用户主目录的 `.fx-cli/config.json` 文件中，适用于单一服务端环境
- **项目级配置**：配置文件位于项目目录的 `.fx-cli/config.json` 文件中，适用于多服务端环境

当您在项目目录下操作时，系统会优先使用项目级配置；如果不存在项目级配置，则使用全局配置。

## 第三步：配置 Jenkins（可选）

如果您需要使用 Jenkins 相关功能，需要先配置 Jenkins 服务器信息。这些配置会被保存在当前激活的配置模式（全局或项目级）中。

### 执行配置命令

```bash
fx-cli jenkins setup
```

### 输入 Jenkins 配置信息

命令执行后，系统会提示您输入以下信息：

1. **Jenkins URL**：Jenkins 服务器的 URL，例如 `https://jenkins.example.com`
2. **用户名**：您的 Jenkins 账号用户名
3. **API Token**：您的 Jenkins API 令牌（不是密码）

> **提示**：您可以在 Jenkins 用户配置页面生成 API 令牌

### 测试连接

配置完成后，系统会自动测试与 Jenkins 服务器的连接。如果连接成功，您将看到成功提示。

### 多环境示例

如果您需要在不同项目中使用不同的 Jenkins 和服务端配置，可以这样操作：

```bash
# 项目 A 使用服务端 A
cd project-a
fx-cli auth --project-config  # 创建项目配置
fx-cli auth  # 使用服务端 A 的证书登录
fx-cli config jenkins  # 配置项目 A 的 Jenkins

# 项目 B 使用服务端 B
cd ../project-b
fx-cli auth --project-config  # 创建项目配置
fx-cli auth  # 使用服务端 B 的证书登录
fx-cli config jenkins  # 配置项目 B 的 Jenkins
```

## 第三步：使用基本功能

### 查看帮助信息

您可以随时使用 `--help` 参数查看命令的详细用法：

```bash
fx-cli --help
```

对于特定命令，例如 Jenkins 命令，您也可以查看其专用帮助：

```bash
fx-cli jenkins --help
fx-cli jenkins build --help
```

### 触发 Jenkins 构建

以下是一个触发 Jenkins 任务构建的示例：

```bash
# 触发名为 "my-project-build" 的任务构建
fx-cli jenkins build my-project-build

# 触发构建并传递参数
fx-cli jenkins build my-project-build --parameters BRANCH=develop ENV=test

# 触发构建并等待完成
fx-cli jenkins build my-project-build --wait
```

### 查看构建状态

触发构建后，您可以查看构建状态：

```bash
# 查看最新构建状态
fx-cli jenkins status my-project-build

# 查看特定构建的状态
fx-cli jenkins status my-project-build --build 123
```

### 查看构建日志

您还可以查看构建日志：

```bash
# 查看最新构建日志
fx-cli jenkins log my-project-build

# 实时跟踪日志输出
fx-cli jenkins log my-project-build --follow
```

## 第四步：管理配置

您可以使用配置命令管理 fx-cli 的各项设置：

```bash
# 列出所有配置项
fx-cli config --list

# 设置配置项
fx-cli config --set logging.level debug

# 获取配置项
fx-cli config --get jenkins.url

# 删除配置项
fx-cli config --delete project.defaultPath
```

## 常见操作示例

### 代码管理操作

#### 拉取资源

1. **拉取特定组件**
   ```bash
   fx-cli pull componentName --type component
   ```

2. **拉取特定插件**
   ```bash
   # 注意：插件将使用API返回的name属性创建文件夹，而非命令行中的apiName
   fx-cli pull pluginApiName --type plugin
   ```

3. **拉取特定函数**
   ```bash
   fx-cli pull functionName --type function
   ```

4. **拉取特定类**
   ```bash
   fx-cli pull className --type class
   ```

5. **拉取指定类型的所有资源**
   ```bash
   # 拉取所有组件
   fx-cli pull component --all
   
   # 拉取所有插件
   fx-cli pull plugin --all
   
   # 拉取所有函数
   fx-cli pull function --all
   
   # 拉取所有类
   fx-cli pull class --all
   ```

6. **拉取所有资源**
   ```bash
   fx-cli pull --type all
   ```

#### 推送资源

1. **推送所有类文件（推荐用法）**
   ```bash
   fx-cli push -t class
   ```

2. **推送指定路径的类文件**
   ```bash
   fx-cli push -t class -p fx-app/main/APL/classes
   ```

3. **推送所有函数文件**
   ```bash
   fx-cli push -t function
   ```

4. **推送指定路径的函数文件**
   ```bash
   fx-cli push -t function -p fx-app/main/APL/functions
   ```

5. **推送指定路径的组件**
   ```bash
   fx-cli push -t component -p MyComponent
   ```

6. **推送指定路径的插件**
   ```bash
   fx-cli push -t plugin -p MyPlugin
   ```

7. **推送所有组件（全量推送）**
   ```bash
   fx-cli push -t component
   ```

8. **推送指定组件文件**
   ```bash
   fx-cli push -t component -f /path/to/component.xml
   ```

9. **从GitHub仓库推送代码**
   ```bash
   fx-cli github-push --repo https://github.com/username/repository.git
   ```

10. **从GitHub仓库推送特定类型资源**
    ```bash
    fx-cli github-push --repo https://github.com/username/repository.git --type component
    ```

##### 推送命令新特性

- **智能路径选择**：当未指定 `-p` 参数时，系统会根据 `-t` 类型自动选择对应的默认目录
  - `class` → `fx-app/main/APL/classes`
  - `function` → `fx-app/main/APL/functions`
  - `component` → `fx-app/main/PWC`
  - `plugin` → `fx-app/main/PWC`
- **批量推送**：支持推送整个目录下的所有相关文件
- **类型验证**：确保推送的文件类型与指定的类型匹配
- **组件全量推送**：支持一次性推送所有组件，无需逐个指定
- **灵活的参数组合**：支持多种参数组合方式，满足不同推送需求
- **GitHub集成**：支持直接从GitHub仓库提取代码并推送到服务端
- **自动认证**：从GitHub仓库中的`.fx-cli/config.json`自动获取认证信息
- **unchangeableJson支持**：避免重复创建已存在的资源

##### GitHub推送命令特性

- **多类型支持**：支持Vue组件、JavaScript插件、Groovy/Java函数和类
- **灵活的仓库选择**：支持按分支、提交ID、特定目录推送
- **详细的进度显示**：实时显示推送进度和状态更新
- **自动重试机制**：处理网络错误和服务端异常
- **分类推送**：支持按资源类型过滤推送内容

### 完整的开发部署流程

1. **登录认证**
   ```bash
   fx-cli auth
   ```

2. **拉取最新代码**
   ```bash
   fx-cli pull --type all
   ```

3. **触发开发环境构建**
   ```bash
   fx-cli jenkins build my-project --parameters BRANCH=feature/new-feature ENV=dev
   ```

4. **查看构建状态并等待完成**
   ```bash
   fx-cli jenkins status my-project --wait
   ```

5. **查看构建日志**
   ```bash
   fx-cli jenkins log my-project
   ```

6. **触发生产环境部署**
   ```bash
   fx-cli jenkins build my-project-deploy --parameters ENV=prod VERSION=1.2.3
   ```

## 注意事项

- **插件命名规则**：当拉取插件时，文件夹名称由API返回的name属性决定，可能与命令行中指定的apiName不同
- **推送注意事项**：推送到服务器时，请使用实际的文件夹名称作为推送参数

## 下一步

- 查看 [Jenkins 集成指南](jenkins-integration.md) 了解更多 Jenkins 相关功能
- 查看 [配置管理指南](configuration.md) 了解如何自定义配置
- 遇到问题？查看 [故障排除](troubleshooting.md) 文档

## 获取帮助

如果您在使用过程中遇到任何问题，可以通过以下方式获取帮助：

1. 查看命令的帮助信息：`fx-cli <command> --help`
2. 查看详细文档
3. 联系技术支持
