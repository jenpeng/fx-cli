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

### 4. 创建资源命令 (`create`)

用于创建各种类型的资源，包括组件、插件、函数和类。支持指定命名空间、返回类型等参数。

#### `fx-cli create`

创建指定类型的资源。

##### 用法

```bash
fx-cli create <type> <name> [options]
```

##### 参数

- `<type>`: 资源类型，支持以下值：
  - `component`: 创建组件
  - `plugin`: 创建插件
  - `function`: 创建函数
  - `class`: 创建类
- `<name>`: 资源名称

##### 选项

- `--api-name, -a <API名称>`: 指定资源的API名称（必须以`__c`结尾）
- `--name-space, -n <命名空间>`: 指定资源的命名空间
- `--return-type, -r <返回类型>`: 指定函数或类的返回类型
- `--sub-type, -s <子类型>`: 指定组件或插件的子类型（vue/ava）
- `--path, -p <路径>`: 指定资源创建的路径
- `--list-namespaces, -lns`: 显示支持的命名空间和返回类型列表

##### 示例

###### 查看支持的命名空间

```bash
# 查看支持的命名空间清单
fx-cli create --list-namespaces
# 或使用缩写
fx-cli create -lns
```

###### 创建组件

```bash
# 创建Vue组件
fx-cli create component MyVueComponent --api-name MyVueComponent__c --sub-type vue

# 创建AVA组件
fx-cli create component MyAvaComponent --api-name MyAvaComponent__c --sub-type ava

# 在指定路径创建组件
fx-cli create component MyComponent --path ./custom/components
```

###### 创建插件

```bash
# 创建Vue插件
fx-cli create plugin MyVuePlugin --sub-type vue

# 创建AVA插件
fx-cli create plugin MyAvaPlugin --sub-type ava

# 在指定路径创建插件
fx-cli create plugin MyPlugin --path ./custom/plugins
```

###### 创建函数

```bash
# 基本语法
fx-cli create function <functionname> --api-name <function_api_name__c> --name-space <namespace> --return-type <returntype>

# 具体示例
fx-cli create function CalculateTotal --api-name CalculateTotal__c --name-space BI --return-type Decimal
fx-cli create function ProcessData --api-name ProcessData__c --name-space CONSUME --return-type String
fx-cli create function GenerateReport --api-name GenerateReport__c --name-space ERPDSS --return-type Map
fx-cli create function ValidateInput --api-name ValidateInput__c --name-space CRM --return-type Boolean
fx-cli create function FormatDate --api-name FormatDate__c --name-space WORKFLOW --return-type String

# 在指定路径创建函数
fx-cli create function MyFunction --path ./custom/functions --api-name MyFunction__c --name-space BI --return-type Map
```

###### 创建类

```bash
# 基本语法
fx-cli create class <classname> --api-name <class_api_name__c> --name-space <namespace> --return-type <returntype>

# 具体示例
fx-cli create class MyTestClass --api-name MyTestClass__c --name-space BI --return-type Map
fx-cli create class DataProcessor --api-name DataProcessor__c --name-space CONSUME --return-type List
fx-cli create class ReportGenerator --api-name ReportGenerator__c --name-space ERPDSS --return-type Boolean
fx-cli create class CustomerManager --api-name CustomerManager__c --name-space CRM --return-type Object
fx-cli create class WorkflowHandler --api-name WorkflowHandler__c --name-space WORKFLOW --return-type String

# 在指定路径创建类
fx-cli create class MyClass --path ./custom/classes --api-name MyClass__c --name-space BI --return-type Map
```

##### 命名空间说明

fx-cli支持以下命名空间分组：

| 分组 | 命名空间 | 支持的资源类型 | 允许的返回类型 |
|-----|---------|---------------|---------------|
| BI | BI, BICommon, BICustom, BIQuery | class, function | Map, List, Boolean, String, Integer, Decimal |
| CONSUME | CONSUME, CONSUMECommon, CONSUMECustom | class, function | Map, List, Boolean, String, Integer, Decimal |
| ERPDSS | ERPDSS, ERPDSSCommon, ERPDSSCustom | class, function | Map, List, Boolean, String, Integer, Decimal |
| CRM | CRM, CRMCommon, CRMCustom | class, function | Map, List, Boolean, String, Integer, Decimal |
| WORKFLOW | WORKFLOW, WORKFLOWCommon, WORKFLOWCustom | class, function | Map, List, Boolean, String, Integer, Decimal |

##### 默认目录映射

| 类型 | 默认目录 |
|-----|---------|
| `class` | `fx-app/main/APL/classes` |
| `function` | `fx-app/main/APL/functions` |
| `component` | `fx-app/main/PWC/components` |
| `plugin` | `fx-app/main/PWC/plugins` |

##### 注意事项

1. API名称必须以`__c`结尾
2. 创建函数和类时必须指定命名空间和返回类型
3. 命名空间必须在支持的范围内
4. 如果未指定路径，资源将创建在默认目录中

### 5. 代码管理命令 (`code`)

用于拉取和部署代码。

#### `fx-cli code pull`

从服务器拉取代码到本地。

##### 用法

```bash
fx-cli code pull [options]
```

##### 选项

- `--all, -a`: 拉取所有类型的资源
- `--type, -t <类型>`: 指定要拉取的资源类型（component/plugin/function/class）
- `--path, -p <路径>`: 指定拉取资源的路径
- `--project, -j <项目ID>`: 指定项目ID
- `--output, -o <输出目录>`: 指定输出目录
- `--force, -f`: 强制覆盖现有文件

##### 示例

```bash
# 拉取所有资源
fx-cli code pull --all

# 拉取指定类型的资源
fx-cli code pull --type component

# 拉取指定路径的资源
fx-cli code pull --path /path/to/resource

# 拉取到指定目录
fx-cli code pull --output /path/to/output

# 强制覆盖现有文件
fx-cli code pull --force
```

#### `fx-cli code push`

将本地代码推送到服务器。

##### 用法

```bash
fx-cli code push [options]
```

##### 选项

- `--type, -t <类型>`: 指定要推送的资源类型（component/plugin/function/class）
- `--path, -p <路径>`: 指定推送资源的路径
- `--all, -a`: 推送所有类型的资源

##### 示例

```bash
# 推送指定类型的资源
fx-cli code push --type component

# 推送指定路径的资源
fx-cli code push --path /path/to/resource

# 推送所有资源
fx-cli code push --all
```

### 6. 推送命令 (`push`)

将资源推送到服务器。

#### `fx-cli push`

推送指定类型的资源到服务器。

##### 用法

```bash
fx-cli push [options]
```

##### 选项

- `--type, -t <类型>`: 指定资源类型（component/plugin/function/class）
- `--path, -p <路径>`: 指定资源路径
- `--file, -f <文件>`: 指定单个文件路径
- `--all, -a`: 推送所有资源

##### 示例

```bash
# 推送所有组件
fx-cli push --type component

# 推送指定组件
fx-cli push --type component --path MyComponent

# 推送所有资源
fx-cli push --all
```

### 7. 初始化命令 (`init`)

初始化项目结构。

#### `fx-cli init`

在当前目录或指定目录初始化项目结构。

##### 用法

```bash
fx-cli init [directory]
```

##### 参数

- `directory`: 可选，指定初始化项目的目录路径，默认为当前目录

##### 示例

```bash
# 在当前目录初始化
fx-cli init

# 在指定目录初始化
fx-cli init /path/to/project
```

### 6. 日志相关命令 (`log`)