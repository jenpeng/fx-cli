# fx-cli

纷享销客开发工具CLI，支持代码拉取、部署和Jenkins集成，为开发者提供便捷的开发和部署体验。

## 功能特性

- 组件和插件管理：支持下载、更新和构建组件及插件
- 项目构建和打包：提供完整的构建流程支持
- 配置管理：灵活的配置文件和认证信息管理
- 完善的日志和错误处理机制

## 安装

### 前提条件

- Node.js >= 14.0.0
- npm 或 yarn

#### 1. 克隆或下载项目

```bash
# 克隆仓库
git clone https://github.com/jenpeng/fx-cli.git
cd fx-cli

# 或者下载并解压项目文件
cd fx-cli
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 全局链接（推荐方式）

使用 npm link 命令将项目链接到全局环境：

```bash
npm link
```

这会在全局环境中创建一个符号链接，指向你的本地项目，这样你就可以在任何地方使用 `fx-cli` 命令了。

#### 4. 直接运行（不推荐全局使用）

如果你不想全局链接，也可以直接运行：

```bash
# 在项目根目录下执行
node bin/fx-cli.js --help

# 或者使用 npm 脚本
npm start -- --help
```

#### 验证安装

安装完成后，可以验证是否成功：

```bash
# 查看版本
fx-cli --version

# 查看帮助
fx-cli --help
```

#### 开发模式

如果你计划修改源码，使用 `npm link` 的方式特别适合，因为：

1. **实时更新**：修改源码后，无需重新安装，直接生效
2. **方便调试**：可以直接在源码中添加调试代码
3. **版本控制**：可以轻松切换不同版本的代码

#### 注意事项

1. **Node.js 版本**：确保你的 Node.js 版本 >= 14.0.0
2. **权限问题**：在某些系统上，可能需要管理员权限才能全局安装
3. **路径问题**：确保 `bin/fx-cli.js` 有执行权限

#### 取消链接

如果你想取消全局链接，可以执行：

```bash
npm unlink -g fx-cli
```

这种方式特别适合开发者或需要频繁修改源码的场景，可以避免每次修改后都需要重新打包和安装的繁琐过程。

## 快速开始

### 1. 登录认证

在使用大部分命令前，需要先进行登录认证：

```bash
fx-cli auth
```

根据提示输入服务器域名、用户名和密码进行认证。

### 2. 配置Jenkins（可选）

如果需要使用Jenkins相关功能，需要先配置Jenkins服务器信息：

```bash
fx-cli jenkins setup
```

### 3. 基本使用

查看所有可用命令：

```bash
fx-cli --help
```

## 命令参考

### 认证管理

#### `fx-cli auth`

管理用户认证信息。

**选项：**
- `--status`: 查看当前认证状态
- `--logout`: 退出当前登录

### 资源管理

#### `fx-cli create [type] [name]`

创建新的资源文件。

**参数：**
- `type`: 资源类型，支持 `component`、`plugin`、`function`、`class`（可选）
- `name`: 资源名称（可选）

**选项：**
- `-p, --path <path>`: 指定创建路径
- `-t, --sub-type <type>`: 子类型（仅用于 component/plugin，支持 vue/ava）
- `-a, --api-name <apiName>`: API名称
- `-l, --lang <lang>`: 语言（仅用于 function/class，支持 groovy/java）
- `-n, --name-space <nameSpace>`: 命名空间
- `-r, --return-type <returnType>`: 返回类型（仅用于 function，默认为 void）
- `-b, --binding-object-api-name <apiName>`: 绑定的业务对象API名称（仅用于 function）
- `-lns, --list-namespaces`: 查看支持的命名空间清单

**示例：**
```bash
# 查看支持的命名空间清单
fx-cli create --list-namespaces
# 或使用缩写
fx-cli create -lns

# 创建Vue组件
fx-cli create component MyVueComponent --sub-type vue
# 创建函数
fx-cli create function MyFunction --api-name My_Function__c --name-space com.example

# 创建指定API名称的类
fx-cli create class MyClass --api-name My_Class__c --name-space com.example
```

#### `fx-cli pull [name]`

拉取资源文件。

**参数：**
- `name`: 资源名称（可选，不提供则根据其他参数拉取）

**选项：**
- `--type <type>`: 资源类型，支持 `component`、`plugin`、`function`、`class`、`all`
- `--all`: 拉取所有指定类型的资源

**示例：**
```bash
# 拉取单个组件
fx-cli pull componentName --type component

# 拉取所有插件
fx-cli pull plugin --all

# 拉取所有函数
fx-cli pull function --all

# 拉取所有类
fx-cli pull class --all

# 拉取所有资源
fx-cli pull --all
```

#### `fx-cli push [name]`

推送资源文件，支持推送类、函数、组件和插件资源。

**参数：**
- `name`: 资源名称（可选）

**选项：**
- `--type, -t <type>`: 资源类型，支持 `component`、`plugin`、`function`、`class`（必填）
- `--path, -p <path>`: 资源路径或文件路径（可选，未指定时自动选择默认目录）
- `--all`: 推送所有类型的资源（组件、插件、函数、类）

**功能特性：**
- **智能路径选择**：当未指定 `-p` 参数时，系统会根据 `-t` 类型自动选择对应的默认目录
- **批量推送**：支持一次性推送整个目录下的所有资源文件
- **自动判断**：系统自动判断资源是否存在，决定是创建还是更新
- **类型验证**：确保推送的资源类型与指定的类型匹配
- **容错机制**：函数推送具备多层容错，处理"函数已存在但查询不到"等复杂场景
- **版本冲突处理**：组件推送支持自动版本同步和智能重试机制

**示例：**
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

# 推送所有类型的资源（组件、插件、函数、类）
fx-cli push --all
```

#### `fx-cli push --all`

推送所有类型的资源（组件、插件、函数、类），这是一个便捷命令，可以一次性推送项目中的所有资源。

**功能特点：**
- **全类型覆盖**：一次性推送组件、插件、函数和类四种类型的资源
- **智能推送流程**：按照类→函数→组件→插件的顺序推送，确保依赖关系正确
- **详细结果统计**：显示每种资源类型的成功和失败数量，以及失败的具体名称
- **错误容错**：单个资源推送失败不会影响其他资源的推送
- **版本冲突处理**：自动处理各种版本冲突，无需手动干预

**使用方法：**
```bash
# 推送所有类型的资源
fx-cli push --all
```

**输出示例：**
```
开始执行全类型推送...
类: 成功 18，失败 0
函数: 成功 12，失败 0
组件: 成功 14，失败 1 (TestNewComponent3)
插件: 成功 2，失败 0
批量推送完成：总成功 46，失败 1
```

**失败情况示例：**
```
开始执行全类型推送...
类: 成功 17，失败 1 (MyClass.groovy)
函数: 成功 11，失败 1 (MyFunction.groovy)
组件: 成功 13，失败 2 (TestComponent1, TestComponent2)
插件: 成功 2，失败 0
批量推送完成：总成功 43，失败 4
```

**使用场景：**
- 项目首次部署：一次性推送所有资源到服务器
- 全面更新：当需要更新项目中所有资源时
- 持续集成：在CI/CD流程中，确保所有资源都是最新版本
- 环境同步：将开发环境的所有资源同步到测试或生产环境

**注意事项：**
- 推送前请确保已正确配置认证信息
- 推送过程可能需要较长时间，取决于资源数量
- 如果推送失败，请检查具体错误信息并处理失败项
- 推送过程中请勿中断，否则可能导致部分资源未推送

**插件推送特性：**

插件推送功能已经从pushService.js中拆分出来，现在由专门的pushPluginService.js处理，提供以下特性：

- **独立服务**：插件推送使用独立的pushPluginService服务，与组件推送分离，提高代码可维护性
- **版本冲突处理**：自动处理插件版本冲突，从服务器获取最新信息并重试推送
- **智能重试机制**：针对不同类型的错误，采用不同的重试策略
- **插件键名智能判断**：根据插件是否已存在，智能选择使用原始插件名称或清理后的插件名称作为键名
- **unchangeableJson.json更新**：自动更新本地unchangeableJson.json文件中的插件记录
- **固定XML文件名**：插件推送使用固定的`plugin.xml`文件名，不再依赖插件名称

**插件推送详细说明：**

##### 基本用法

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

##### 插件目录结构

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

##### 版本冲突处理

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

##### 错误处理

系统实现了完善的错误处理机制：

1. **错误分类与处理**：
   - 系统提示类错误（如"提示信息"、"系统提示"）会被降级为警告，避免中断用户操作
   - 权限不足、参数错误、资源不存在等错误会被分类处理，提供相应的解决建议

2. **具体错误处理**：
   - **文件不存在错误**：检查插件目录和必要文件是否存在
   - **API 请求错误**：处理网络请求失败，解析服务器返回的错误信息
   - **系统提示错误**：将错误级别降级为警告，避免中断用户操作
   - **版本冲突错误**：自动从服务器获取最新信息并重试

##### 注意事项

1. 插件目录必须包含 `plugin.xml` 文件，否则推送会失败
2. 推送前请确保已正确配置认证信息
3. 如果推送失败，请检查网络连接和服务器状态
4. 推送成功后，系统会自动更新 `unchangeableJson.json` 文件中的插件记录
5. 系统会自动处理版本冲突，无需手动干预
6. 插件推送使用固定的 `plugin.xml` 文件名，不再依赖插件名称

**函数推送容错机制：**

函数推送包含三层容错机制，确保在各种复杂情况下都能成功推送：

1. **强制更新**：当遇到"函数已存在"错误时，直接使用函数信息进行更新
2. **灵活查询**：当强制更新失败时，尝试仅使用apiName查询函数
3. **直接更新**：当查询也失败时，使用本地元数据直接更新

这种多层容错机制特别适用于处理"函数已存在但查询不到"的冲突场景。

**组件推送版本冲突处理：**

组件推送实现了智能的版本冲突处理机制，能够自动处理以下情况：

1. **自动版本同步**：当遇到"当前代码在线上有更高版本"错误时，系统会自动从服务器获取最新的组件信息，更新本地时间戳，并重试推送
2. **智能重试机制**：针对不同类型的错误，系统采用不同的重试策略
3. **组件键名智能判断**：系统会根据组件是否已存在，智能选择使用原始组件名称或清理后的组件名称作为键名

**默认目录映射：**
- `class`: `fx-app/main/APL/classes`
- `function`: `fx-app/main/APL/functions`
- `component`: `fx-app/main/PWC`
- `plugin`: `fx-app/main/PWC`

### 配置管理

#### `fx-cli config`

管理CLI配置。

**选项：**
- `--list`: 列出所有配置项
- `--set <key> <value>`: 设置配置项
- `--get <key>`: 获取配置项
- `--delete <key>`: 删除配置项

## 配置文件

配置文件位于用户目录下的 `.fx-cli/config.json`，凭证信息存储在 `.fx-cli/credentials.json`。

### 配置文件结构

```json
{
  "auth": {
    "domain": "https://example.fxiaoke.com",
    "token": "encrypted_token"
  },
  "project": {
    "defaultPath": "/path/to/projects"
  },
  "jenkins": {
    "url": "https://jenkins.example.com",
    "username": "user",
    "token": "encrypted_token"
  },
  "logging": {
    "level": "info",
    "enabled": true,
    "path": "/path/to/logs"
  }
}
```

## 日志管理

### 日志级别

支持的日志级别：
- `debug`: 调试信息
- `info`: 一般信息（默认）
- `warning`: 警告信息
- `error`: 错误信息
- `fatal`: 致命错误

### 配置日志

可以通过配置文件或命令行参数设置日志级别：

```bash
fx-cli config --set logging.level debug
fx-cli config --set logging.enabled true
fx-cli config --set logging.path /custom/log/path
```

默认日志文件位于：`~/.fx-cli/logs/fx-cli-<date>.log`

## 常见问题

### 认证失败

- 确保输入的用户名和密码正确
- 检查服务器域名是否正确
- 网络连接是否正常

## 开发

### 目录结构

```
fx-cli/
├── bin/             # 可执行文件
├── src/             # 源代码
│   ├── commands/    # 命令实现
│   ├── core/        # 核心功能
│   ├── services/    # 服务模块
│   └── utils/       # 工具函数
├── package.json     # 项目配置
└── README.md        # 使用文档
```

### 开发命令

```bash
# 启动开发模式
npm start

# 运行测试
npm test

# 代码检查
npm run lint
```

## 许可证

[MIT](LICENSE)