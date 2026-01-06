/**
 * Project Init Command
 * Initialize a new FX project with config template
 */

const path = require('path');
const fs = require('fs-extra');
const { logger } = require('../core/Logger');
const { ConfigManager } = require('../core/ConfigManager');

async function initProject(projectPath = '.', options = {})
{
    try {
        // 使用当前目录或指定项目名，支持绝对路径
        projectPath = path.isAbsolute(projectPath) ? projectPath : path.join(process.cwd(), projectPath);
        const isCurrentDir = projectPath === process.cwd();

        // 检查目录是否存在
        if (!isCurrentDir && fs.existsSync(projectPath)) {
            throw new Error(`目录已存在: ${projectPath}`);
        } else if (isCurrentDir) {
            // 如果是当前目录，检查是否已经有项目文件
            const hasConfig = fs.existsSync(path.join(projectPath, 'config.json'));
            const hasFxApp = fs.existsSync(path.join(projectPath, 'fx-app'));
            if (hasConfig || hasFxApp) {
                throw new Error('当前目录已经包含项目文件，请在空目录中初始化');
            }
        }

        // 创建项目目录
        if (!isCurrentDir) {
            fs.mkdirSync(projectPath, { recursive: true });
            logger.info(`已创建项目目录: ${projectPath}`);
        } else {
            logger.info('在当前目录初始化项目');
        }

        // 初始化配置管理器
        const configManager = new ConfigManager({ projectRoot: projectPath, useProjectConfig: true });
        
        // 创建.fx-cli目录下的config.json配置文件
        const configDir = path.join(projectPath, '.fx-cli');
        fs.mkdirSync(configDir, { recursive: true });
        const configPath = path.join(configDir, 'config.json');
        const configData = {
            auth: {
                domain: 'YOUR_DOMAIN_HERE',
                certificate: 'YOUR_CERTIFICATE_HERE',
                lastAuth: null
            },
            project: {
                rootDir: projectPath,
                defaultType: 'component',
                defaultOutputDir: './fx-app/main'
            },
            jenkins: {
                url: '',
                username: '',
                token: '',
                jobPrefix: 'fx-'
            },
            logging: {
                level: 'info',
                enableConsole: true,
                enableFile: false
            },
            cache: {
                enabled: true,
                maxAge: 86400000
            }
        };
        
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
        logger.info(`已创建项目配置: ${configPath}`);
        logger.info('请手动编辑 .fx-cli/config.json 文件，设置您的实际域名和证书信息');

        // 按照最佳实践创建嵌套目录结构
        const dirs = [
            'fx-app/main/PWC/components',  // 自定义组件
            'fx-app/main/PWC/plugins',     // 自定义插件
            'fx-app/main/APL/functions',   // 自定义函数
            'fx-app/main/APL/classes'      // 自定义类
        ];
        
        dirs.forEach(dir => {
            const dirPath = path.join(projectPath, dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        });
        logger.info('已创建项目结构: fx-app/main/PWC/(components,plugins), fx-app/main/APL/(functions,classes)');

        // 创建.gitignore
        const gitignorePath = path.join(projectPath, '.gitignore');
        if (!fs.existsSync(gitignorePath)) {
            const gitignoreContent = `# FX CLI\n.fx-cli/\n\n# Node modules\nnode_modules/\n\n# Logs\n*.log\n\n# OS files\n.DS_Store\n`;
            fs.writeFileSync(gitignorePath, gitignoreContent);
            logger.info('已创建 .gitignore');
        }

        // 创建README
        const readmePath = path.join(projectPath, 'README.md');
        if (!fs.existsSync(readmePath)) {
            const readmeContent = `# 纷享销客开发项目

本项目由 fx-cli 管理，用于创建、拉取、推送和管理纷享销客平台的各种资源。

## 配置说明

编辑 \`.fx-cli/config.json\` 设置您的纷享销客平台认证信息：

\`\`\`json
{
  "auth": {
    "domain": "https://www.fxiaoke.com",
    "certificate": "YOUR_CERTIFICATE_HERE",
    "lastAuth": null
  },
  "project": {
    "rootDir": "/path/to/your/project",
    "defaultType": "component",
    "defaultOutputDir": "./fx-app/main"
  }
}
\`\`\`

## 命令概述

fx-cli 提供以下核心命令：

| 命令 | 描述 |
|-----|-----|
| \`fx-cli init\` | 初始化新的纷享销客开发项目 |
| \`fx-cli auth\` | 管理用户认证信息 |
| \`fx-cli create\` | 创建新的资源（组件、插件、函数、类） |
| \`fx-cli pull\` | 从服务器拉取资源到本地 |
| \`fx-cli push\` | 将本地资源推送到服务器 |

## 详细命令用法

### 1. init - 初始化项目

初始化一个新的纷享销客开发项目，创建必要的目录结构和配置文件。

#### 语法
\`\`\`bash
fx-cli init [project-path] [options]
\`\`\`

#### 参数
- \`project-path\` (可选): 项目目录路径，默认为当前目录

#### 示例
\`\`\`bash
# 在当前目录初始化项目
fx-cli init

# 在指定目录初始化项目
fx-cli init my-fx-project
\`\`\`

#### 功能说明
- 创建项目目录结构
- 生成配置文件 \`.fx-cli/config.json\`
- 创建 \`.gitignore\` 文件
- 初始化 \`unchangeableJson.json\` 文件
- 设置推荐的目录结构：
  - \`fx-app/main/PWC/components/\` - 自定义组件
  - \`fx-app/main/PWC/plugins/\` - 自定义插件
  - \`fx-app/main/APL/functions/\` - APL函数
  - \`fx-app/main/APL/classes/\` - APL类

### 2. auth - 认证管理

管理用户认证信息，包括登录、登出和状态查询。

#### 语法
\`\`\`bash
fx-cli auth [options]
\`\`\`

#### 选项
- \`-l, --logout\`: 登出当前用户
- \`-s, --status\`: 查看当前认证状态
- \`-p, --project-config\`: 创建项目级配置
- \`--use-global\`: 使用全局配置

#### 示例
\`\`\`bash
# 登录并设置认证信息
fx-cli auth

# 查看当前认证状态
fx-cli auth --status

# 登出当前用户
fx-cli auth --logout

# 创建项目级配置
fx-cli auth --project-config
\`\`\`

#### 功能说明
- 支持环境变量认证：
  - \`FX_DOMAIN\`: 服务器域名
  - \`FX_CERTIFICATE\`: 证书内容
  - \`FX_CERTIFICATE_PATH\`: 证书文件路径
- 支持项目级和全局级配置切换
- 自动保存认证信息到配置文件

### 3. create - 创建资源

创建新的资源，包括组件、插件、函数和类。

#### 语法
\`\`\`bash
fx-cli create <type> <name> [options]
\`\`\`

#### 参数
- \`type\`: 资源类型，可选值：\`component\`, \`plugin\`, \`function\`, \`class\`
- \`name\`: 资源名称

#### 选项
- \`--api-name\`: API名称（必填，需以__c结尾）
- \`--sub-type\`: 子类型（对于component和plugin，可选值：\`vue\`, \`ava\`）
- \`--name-space\`: 命名空间（对于function和class必填）
- \`--return-type\`: 返回类型（对于function必填）
- \`--binding-object-api-name\`: 绑定对象API名称（对于function必填）
- \`--lang\`: 编程语言（默认为groovy）
- \`--list-namespaces, -lns\`: 查看支持的命名空间清单

#### 示例
\`\`\`bash
# 查看支持的命名空间
fx-cli create --list-namespaces

# 创建Vue组件
fx-cli create component MyComponent --api-name MyComponent__c --sub-type vue

# 创建AVA插件
fx-cli create plugin MyPlugin --api-name MyPlugin__c --sub-type ava

# 创建函数
fx-cli create function CalculateTotal --api-name CalculateTotal__c --name-space BI --return-type Decimal --binding-object-api-name Account__c

# 创建类
fx-cli create class DataProcessor --api-name DataProcessor__c --name-space CONSUME --return-type void
\`\`\`

#### 功能说明
- 自动生成资源模板文件
- 验证API名称格式（必须以__c结尾）
- 验证命名空间和返回类型的有效性
- 更新 \`unchangeableJson.json\` 记录

### 4. pull - 拉取资源

从服务器拉取资源到本地。

#### 语法
\`\`\`bash
fx-cli pull [name] [options]
\`\`\`

#### 参数
- \`name\` (可选): 资源名称

#### 选项
- \`-t, --type\`: 资源类型，可选值：\`component\`, \`plugin\`, \`function\`, \`class\`
- \`-o, --output\`: 输出目录
- \`--all\`: 拉取所有资源

#### 示例
\`\`\`bash
# 拉取单个组件
fx-cli pull MyComponent --type component

# 拉取所有组件
fx-cli pull --type component --all

# 拉取所有类型的资源
fx-cli pull --all

# 拉取指定函数
fx-cli pull CalculateTotal__c --type function
\`\`\`

#### 功能说明
- 支持拉取单个资源或所有资源
- 支持按类型拉取资源
- 显示拉取进度和结果统计
- 自动创建本地目录结构
- 更新 \`unchangeableJson.json\` 记录

### 5. push - 推送资源

将本地资源推送到服务器。

#### 语法
\`\`\`bash
fx-cli push [name] [options]
\`\`\`

#### 参数
- \`name\` (可选): 资源名称或路径

#### 选项
- \`-t, --type\`: 资源类型，可选值：\`component\`, \`plugin\`, \`function\`, \`class\` (必填)
- \`-p, --path\`: 资源路径或名称
- \`-f, --file\`: 单个文件路径
- \`--all\`: 推送所有资源

#### 示例
\`\`\`bash
# 推送所有类
fx-cli push -t class

# 推送指定组件
fx-cli push -t component -p MyComponent

# 推送单个函数文件
fx-cli push -t function -f CalculateTotal.groovy

# 推送所有资源
fx-cli push --all
\`\`\`

#### 功能说明
- 支持推送单个资源或所有资源
- 支持按类型推送资源
- 智能检测文件类型
- 显示推送进度和结果统计
- 自动处理版本冲突
- 更新 \`unchangeableJson.json\` 记录

### 6. github-push - 从GitHub仓库推送资源

从GitHub仓库直接推送资源到服务器，支持所有资源类型。

#### 语法
\`\`\`bash
fx-cli github-push [options]
\`\`\`

#### 选项
- \`-r, --repo\`: GitHub 仓库 URL (必填)
- \`-b, --branch\`: 分支名称 (默认: main)
- \`-c, --commit\`: 特定的提交 ID (默认: HEAD)
- \`-d, --dir\`: 仓库中的目标目录 (默认: 根目录)
- \`-t, --types\`: 要推送的类型，逗号分隔 (默认: component,plugin,function,class)
- \`--dry-run\`: 试运行模式，不实际推送 (默认: false)
- \`--overwrite\`: 覆盖已存在的资源 (默认: false)
- \`--no-auto-auth\`: 禁用自动认证功能 (默认: false)

#### 支持的资源类型
- \`component\` - 自定义组件
- \`plugin\` - 自定义插件
- \`function\` - APL 函数
- \`class\` - APL 类

#### 示例
\`\`\`bash
# 推送主分支的所有资源
fx-cli github-push -r https://github.com/yourusername/your-repo.git

# 推送 develop 分支的组件和插件
fx-cli github-push -r https://github.com/yourusername/your-repo.git -b develop -t component,plugin

# 推送指定目录下的所有资源
fx-cli github-push -r https://github.com/yourusername/your-repo.git -d fx-app/main

# 试运行，不实际推送
fx-cli github-push -r https://github.com/yourusername/your-repo.git --dry-run
\`\`\`

#### 功能说明
- 从 GitHub 直接部署资源，无需克隆仓库
- 支持指定分支和提交 ID
- 支持按资源类型过滤
- 支持试运行模式，预览推送结果
- 支持覆盖已存在的资源
- 自动处理认证信息
- 显示推送进度和结果统计

#### 使用场景
1. **从 GitHub 直接部署**：无需克隆仓库，直接从 GitHub 推送资源
2. **多环境部署**：从不同分支推送资源到不同环境
3. **CI/CD 集成**：在持续集成流程中使用，自动部署代码
4. **跨团队协作**：直接推送其他团队的 GitHub 仓库资源
5. **快速原型部署**：快速部署 GitHub 上的原型代码到测试环境

## 项目结构

项目初始化后，会创建以下目录结构：

\`\`\`
my-fx-project/
├── .fx-cli/                  # 配置目录
│   └── config.json           # 项目配置文件
├── fx-app/                   # 应用主目录
│   └── main/                 # 主应用目录
│       ├── APL/              # APL代码目录
│       │   ├── classes/      # APL类文件
│       │   └── functions/    # APL函数文件
│       └── PWC/              # 页面组件目录
│           ├── components/   # 自定义组件
│           └── plugins/      # 自定义插件
├── .gitignore                # Git忽略文件
├── README.md                 # 项目说明文档
└── unchangeableJson.json     # 资源记录文件
\`\`\`

## 命名空间说明

### 支持的命名空间

使用 \`fx-cli create --list-namespaces\` 可以查看所有支持的命名空间及其允许的返回类型。

主要命名空间分组：

| 分组 | 描述 |
|-----|-----|
| BI | 商业智能相关 |
| CONSUME | 消费相关 |
| ERPDSS | ERP系统相关 |
| INDUSTRY | 行业解决方案 |
| OBJECT | 对象相关 |
| ORDER | 订单相关 |
| PLATFORM | 平台相关 |
| SERVICE | 服务相关 |
| SFA | 销售自动化 |
| SYNC_DATA | 数据同步 |

## 认证管理

### 环境变量认证

可以通过环境变量设置认证信息，避免每次手动输入：

\`\`\`bash
# 设置环境变量
export FX_DOMAIN=https://www.fxiaoke.com
export FX_CERTIFICATE=your_certificate_content

# 或使用证书文件路径
export FX_CERTIFICATE_PATH=/path/to/your/certificate.json

# 然后执行命令
fx-cli auth
\`\`\`

### 配置级别

fx-cli 支持两种配置级别：

1. **全局配置**：适用于所有项目，存储在用户主目录
2. **项目配置**：仅适用于当前项目，存储在项目目录的 \`.fx-cli\` 文件夹中

使用 \`fx-cli auth --project-config\` 创建项目级配置，或使用 \`fx-cli auth --use-global\` 切换回全局配置。

## 最佳实践

1. **项目初始化**：
   \`\`\`bash
   # 初始化项目
   fx-cli init my-project
   cd my-project
   
   # 设置认证
   fx-cli auth
   
   # 拉取现有资源
   fx-cli pull --all
   \`\`\`

2. **开发流程**：
   \`\`\`bash
   # 创建新资源
   fx-cli create component MyComponent --api-name MyComponent__c --sub-type vue
   
   # 编辑资源文件
   # ... 开发代码 ...
   
   # 推送资源
   fx-cli push -t component -p MyComponent
   \`\`\`

3. **环境同步**：
   \`\`\`bash
   # 拉取最新资源
   fx-cli pull --all
   
   # 推送所有资源
   fx-cli push --all
   \`\`\`

## 常见问题与解决方案

### 1. 认证失败
**问题**：执行命令时提示 "请先登录: fx-cli auth"
**解决方案**：
- 确保已正确配置认证信息
- 检查环境变量是否设置正确
- 执行 \`fx-cli auth\` 重新登录

### 2. 资源推送失败
**问题**：推送资源时失败
**解决方案**：
- 检查网络连接是否正常
- 确保资源目录结构正确
- 检查资源文件是否完整（特别是XML文件）
- 查看详细错误信息，根据提示进行修复

### 3. 版本冲突
**问题**：推送时提示版本冲突
**解决方案**：
- 先执行 \`fx-cli pull\` 同步最新版本
- 解决本地冲突后重新推送

### 4. 命名空间错误
**问题**：创建资源时提示命名空间无效
**解决方案**：
- 执行 \`fx-cli create --list-namespaces\` 查看支持的命名空间
- 确保命名空间与资源类型匹配
- 确保返回类型在命名空间允许范围内

## 注意事项

1. 插件拉取时，文件夹名称由API返回的name属性决定，可能与命令行中指定的apiName不同
2. 推送到服务器时，请使用实际的文件夹名称作为推送参数
3. 组件和插件目录必须包含对应的XML文件（component.xml或plugin.xml）
4. 推送前建议先执行 \`pull\` 同步远程最新版本
5. 推送完成后会自动更新本地的 \`unchangeableJson.json\` 文件

## 命令速查表

| 操作 | 命令 |
|-----|-----|
| 初始化项目 | \`fx-cli init\` |
| 登录 | \`fx-cli auth\` |
| 查看认证状态 | \`fx-cli auth --status\` |
| 创建Vue组件 | \`fx-cli create component <name> --api-name <apiName> --sub-type vue\` |
| 创建函数 | \`fx-cli create function <name> --api-name <apiName> --name-space <namespace> --return-type <returnType> --binding-object-api-name <bindingObject>\` |
| 拉取所有资源 | \`fx-cli pull --all\` |
| 推送所有资源 | \`fx-cli push --all\` |
| 推送指定组件 | \`fx-cli push -t component -p <component-name>\` |
| 推送指定函数 | \`fx-cli push -t function -f <function-file>\` |
| 从GitHub推送所有资源 | \`fx-cli github-push -r <repo-url>\` |
| 从GitHub推送指定类型资源 | \`fx-cli github-push -r <repo-url> -t component,plugin\` |
`;
            fs.writeFileSync(readmePath, readmeContent);
            logger.info('已创建 README.md');
        }

        // 创建unchangeableJson.json文件
        const unchangeableJsonPath = path.join(projectPath, 'unchangeableJson.json');
        if (!fs.existsSync(unchangeableJsonPath)) {
            const unchangeableJsonContent = {};
            fs.writeFileSync(unchangeableJsonPath, JSON.stringify(unchangeableJsonContent, null, 2));
            logger.info('已创建 unchangeableJson.json');
        }

        // 初始化完成提示
        logger.info('\n项目初始化完成!');
        logger.info('\n后续步骤:');
        
        if (!isCurrentDir) {
            logger.info(`1. 切换到项目目录: cd ${path.basename(projectPath)}`);
            logger.info('2. 编辑 .fx-cli/config.json 文件，设置您的实际域名和证书信息');
            logger.info('3. 执行 fx-cli auth 进行认证');
            logger.info('4. 执行 fx-cli pull --all 拉取资源');
        } else {
            logger.info('1. 您已在项目目录中');
            logger.info('2. 编辑 .fx-cli/config.json 文件，设置您的实际域名和证书信息');
            logger.info('3. 执行 fx-cli auth 进行认证');
            logger.info('4. 执行 fx-cli pull --all 拉取资源');
        }

    } catch (error) {
        logger.error('项目初始化失败:', error.message || error);
        // 移除未定义的ci引用，使用标准错误处理
    }
}

module.exports = {
    execute: initProject
};