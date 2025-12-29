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

7. **推送所有插件**
   ```bash
   fx-cli push -t plugin
   ```

8. **推送指定路径的插件**
   ```bash
   fx-cli push -t plugin /path/to/plugin
   ```

9. **推送当前目录的插件**
   ```bash
   fx-cli push -t plugin .
   ```

10. **推送所有组件（全量推送）**
    ```bash
    fx-cli push -t component
    ```

11. **推送指定组件文件**
    ```bash
    fx-cli push -t component -f /path/to/component.xml
    ```

12. **批量推送所有资源**
    ```bash
    fx-cli push --all
    ```

##### 批量推送所有资源

使用 `push --all` 命令可以一次性推送所有类型的资源，包括组件、插件、函数和类。这是最便捷的全量推送方式，特别适合项目初始化后的首次推送或大规模更新场景。

**基本用法：**
```bash
fx-cli push --all
```

**功能特点：**

1. **全类型覆盖**：一次性推送以下所有类型资源：
   - 组件（Components）：扫描 `fx-app/main/PWC/components` 目录下的所有组件
   - 插件（Plugins）：扫描 `fx-app/main/PWC/plugins` 目录下的所有插件
   - 函数（Functions）：扫描 `fx-app/main/APL/functions` 目录下的所有函数
   - 类（Classes）：扫描 `fx-app/main/APL/classes` 目录下的所有类

2. **智能推送流程**：
   - 按照类→函数→组件→插件的顺序依次推送
   - 每种类型资源推送完成后显示详细统计信息
   - 最终显示总体推送结果汇总

3. **详细统计信息**：
   - 显示每种类型的成功数量和失败数量
   - 如有失败项，会列出具体失败的资源名称
   - 提供总体推送成功率和失败详情

4. **错误处理与容错**：
   - 单个资源推送失败不会影响其他资源的推送
   - 自动处理版本冲突和时间戳问题
   - 提供详细的错误信息帮助定位问题

**输出示例：**
```
开始执行全类型推送...
类: 成功 18，失败 0
函数: 成功 12，失败 0
组件: 成功 14，失败 1 (TestNewComponent3)
插件: 成功 2，失败 0
批量推送完成: 总成功 46，失败 1
```

**使用场景：**

1. **项目初始化后首次推送**：完成开发后，使用 `push --all` 一次性推送所有资源
2. **大规模更新**：当多个资源类型都有更新时，避免逐个类型推送
3. **环境同步**：将开发环境的所有资源同步到测试或生产环境
4. **版本发布**：发布新版本前确保所有资源都已推送到服务器

**注意事项：**

1. 确保已正确配置认证信息（执行 `fx-cli auth`）
2. 推送前建议先执行 `pull --all` 同步远程最新版本
3. 如有大量资源更新，推送过程可能需要较长时间
4. 推送过程中请勿中断，确保所有资源都能完整推送
5. 推送完成后会自动更新本地的 `unchangeableJson.json` 文件

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

##### 插件推送详细说明

###### 基本用法

1. **推送所有插件**
   ```bash
   fx-cli push -t plugin
   ```
   此命令会扫描 `fx-app/main/PWC/plugins` 目录下的所有子目录，并推送每个包含 `plugin.xml` 文件的插件。

2. **推送指定插件**
   ```bash
   fx-cli push -t plugin -p MyPlugin
   ```
   推送指定名称的插件。系统会在插件目录中查找名为 `MyPlugin` 的子目录。

3. **推送指定路径的插件**
   ```bash
   fx-cli push -t plugin /path/to/plugin
   ```
   推送指定路径的插件。

4. **推送当前目录的插件**
   ```bash
   fx-cli push -t plugin .
   ```
   推送当前目录作为插件。

###### 插件目录结构

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

###### 版本冲突处理

插件推送实现了智能的版本冲突处理机制：

1. **自动版本同步**：
   - 当遇到"当前代码在线上有更高版本"错误时，系统会自动从服务器获取最新的插件信息
   - 更新本地 `unchangeableJson.json` 文件中的 `updateTime`
   - 使用正确的时间戳重试推送，无需手动干预

2. **智能重试机制**：
   - 针对不同类型的错误，采用不同的重试策略
   - 对于系统异常，尝试将 `updateTime` 设置为 0
   - 对于版本冲突，从服务器获取最新信息
   - 对于重复名称错误，使用正确的时间戳

3. **插件键名智能判断**：
   - 根据 `unchangeableJson.json` 中插件是否已存在，智能选择使用原始插件名称或清理后的插件名称作为键名
   - 确保插件记录的一致性和可追溯性

###### 错误处理

系统实现了完善的错误处理机制：

1. **错误分类与处理**：
   - 系统提示类错误（如"提示信息"、"系统提示"）会被降级为警告，避免中断用户操作
   - 权限不足、参数错误、资源不存在等错误会被分类处理，提供相应的解决建议

2. **具体错误处理**：
   - **文件不存在错误**：检查插件目录和必要文件是否存在
   - **API 请求错误**：处理网络请求失败，解析服务器返回的错误信息
   - **系统提示错误**：将错误级别降级为警告，避免中断用户操作
   - **版本冲突错误**：自动从服务器获取最新信息并重试

###### 注意事项

1. 插件目录必须包含 `plugin.xml` 文件，否则推送会失败
2. 推送前请确保已正确配置认证信息
3. 如果推送失败，请检查网络连接和服务器状态
4. 推送成功后，系统会自动更新 `unchangeableJson.json` 文件中的插件记录
5. 系统会自动处理版本冲突，无需手动干预
6. 插件推送使用固定的 `plugin.xml` 文件名，不再依赖插件名称

##### 组件推送详细说明

###### 基本用法

1. **推送指定组件**
   ```bash
   fx-cli push -t component -p MyComponent
   ```

2. **推送指定路径的组件**
   ```bash
   fx-cli push -t component /path/to/component
   ```

3. **推送当前目录的组件**
   ```bash
   fx-cli push -t component .
   ```

4. **推送所有组件**
   ```bash
   fx-cli push -t component
   ```

###### 参数说明

- `-t, --type`: 指定资源类型，此处为 `component`
- `-p, --path`: 指定组件名称或路径（可选）
- `-f, --file`: 指定单个文件路径（可选，用于推送单个文件）

###### 版本冲突处理

系统实现了智能的版本冲突处理机制，能够自动处理以下情况：

1. **自动版本同步**：
   - 当遇到"当前代码在线上有更高版本"错误时，系统会自动从服务器获取最新的组件信息
   - 更新本地 `unchangeableJson.json` 文件中的 `updateTime`
   - 使用正确的时间戳重试推送，无需手动干预

2. **智能重试机制**：
   - 针对不同类型的错误，采用不同的重试策略
   - 对于系统异常，尝试将 `updateTime` 设置为 0
   - 对于版本冲突，从服务器获取最新信息
   - 对于重复名称错误，使用正确的时间戳

3. **组件键名智能判断**：
   - 根据 `unchangeableJson.json` 中组件是否已存在，智能选择使用原始组件名称或清理后的组件名称作为键名
   - 确保组件记录的一致性和可追溯性

###### 注意事项

1. 组件目录必须包含 `component.xml` 文件，否则推送会失败
2. 推送前请确保已正确配置认证信息
3. 如果推送失败，请检查网络连接和服务器状态
4. 推送成功后，系统会自动更新 `unchangeableJson.json` 文件中的组件记录
5. 系统会自动处理版本冲突，无需手动干预

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
