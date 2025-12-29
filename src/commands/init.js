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

本项目由 fx-cli 管理。

## 配置说明

编辑 \`.fx-cli/config.json\` 设置您的纷享销客平台认证信息：

\`\`\`json
{
  "auth": {
    "domain": "https://www.fxiaoke.com",
    "certificate": "YOUR_CERTIFICATE_HERE",
    "lastAuth": null
  }
}
\`\`\`

## 使用方法

### 认证
\`\`\`bash
# 设置认证信息
fx-cli auth
\`\`\`

### 创建资源
\`\`\`bash

# 查看支持的命名空间清单
fx-cli create --list-namespaces
# 或使用缩写
fx-cli create -lns

# 创建Vue组件
fx-cli create component MyVueComponent --api-name MyVueComponent__c --sub-type vue

# 创建AVA组件
fx-cli create component MyAvaComponent --api-name MyAvaComponent__c --sub-type ava

# 创建Vue插件
fx-cli create plugin MyVuePlugin --sub-type vue

# 创建AVA插件
fx-cli create plugin MyAvaPlugin --sub-type ava

# 创建指定API名称和命名空间的函数
fx-cli create function <functionname> --api-name <function_api_name__c> --name-space <namespace> --return-type <returntype>  --

# 创建指定API名称和命名空间的类
fx-cli create class <classname> --api-name <class_api_name__c> --name-space <namespace> --return-type <returntype>
\`\`\`

### 拉取资源
\`\`\`bash
# 拉取组件
fx-cli pull componentName --type component

# 拉取插件 - 注意：插件将使用API返回的name属性创建文件夹，而非命令行中的apiName
fx-cli pull pluginApiName --type plugin

# 拉取函数
fx-cli pull functionName --type function

# 拉取类
fx-cli pull className --type class

# 拉取指定类型的所有资源
fx-cli pull component --all
fx-cli pull plugin --all
fx-cli pull function --all
fx-cli pull class --all

# 批量拉取所有资源
fx-cli pull --all
\`\`\`

### 推送资源

#### 推送资源

1. **推送所有类文件（推荐用法）**
   \`\`\`bash
   fx-cli push -t class
   \`\`\`

2. **推送指定路径的类文件**
   \`\`\`bash
   fx-cli push -t class -p fx-app/main/APL/classes
   \`\`\`

3. **推送所有函数文件**
   \`\`\`bash
   fx-cli push -t function
   \`\`\`

4. **推送指定路径的函数文件**
   \`\`\`bash
   fx-cli push -t function -p fx-app/main/APL/functions
   \`\`\`

5. **推送所有组件（全量推送）**
   \`\`\`bash
   fx-cli push -t component
   \`\`\`

6. **推送指定组件**
   \`\`\`bash
   fx-cli push -t component -p MyComponent
   \`\`\`

7. **推送指定组件文件**
   \`\`\`bash
   fx-cli push -t component -f /path/to/component.xml
   \`\`\`

8. **推送所有插件**
   \`\`\`bash
   fx-cli push -t plugin
   \`\`\`

9. **推送指定插件**
   \`\`\`bash
   fx-cli push -t plugin -p MyPlugin
   \`\`\`

10. **批量推送所有资源**
    \`\`\`bash
    fx-cli push --all
    \`\`\`

#### 批量推送所有资源

##### push --all 命令

使用 \`push --all\` 命令可以一次性推送所有类型的资源，包括组件、插件、函数和类。这是最便捷的全量推送方式，特别适合项目初始化后的首次推送或大规模更新场景。

**基本用法：**
\`\`\`bash
fx-cli push --all
\`\`\`

**功能特点：**

1. **全类型覆盖**：一次性推送以下所有类型资源：
   - 组件（Components）：扫描 \`fx-app/main/PWC/components\` 目录下的所有组件
   - 插件（Plugins）：扫描 \`fx-app/main/PWC/plugins\` 目录下的所有插件
   - 函数（Functions）：扫描 \`fx-app/main/APL/functions\` 目录下的所有函数
   - 类（Classes）：扫描 \`fx-app/main/APL/classes\` 目录下的所有类

2. **智能推送流程**：
   - 按照组件→插件→类→函数的顺序依次推送
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
\`\`\`
组件: 成功 15，失败 0
插件: 成功 2，失败 0
类: 成功 18，失败 0
函数: 成功 12，失败 0

批量推送完成: 总成功 47，失败 0
\`\`\`

**失败情况示例：**
\`\`\`
组件: 成功 14，失败 1 (TestNewComponent3)
插件: 成功 2，失败 0
类: 成功 18，失败 0
函数: 成功 12，失败 0

批量推送完成: 总成功 46，失败 1
\`\`\`

**使用场景：**

1. **项目初始化后首次推送**：完成开发后，使用 \`push --all\` 一次性推送所有资源
2. **大规模更新**：当多个资源类型都有更新时，避免逐个类型推送
3. **环境同步**：将开发环境的所有资源同步到测试或生产环境
4. **版本发布**：发布新版本前确保所有资源都已推送到服务器

**注意事项：**

1. 确保已正确配置认证信息（执行 \`fx-cli auth\`）
2. 推送前建议先执行 \`pull --all\` 同步远程最新版本
3. 如有大量资源更新，推送过程可能需要较长时间
4. 推送过程中请勿中断，确保所有资源都能完整推送
5. 推送完成后会自动更新本地的 \`unchangeableJson.json\` 文件

#### 插件推送详细说明

##### 基本用法

1. **推送所有插件**
   \`\`\`bash
   fx-cli push -t plugin
   \`\`\`
   此命令会扫描 \`fx-app/main/PWC/plugins\` 目录下的所有子目录，并推送每个包含 \`plugin.xml\` 文件的插件。

2. **推送指定插件**
   \`\`\`bash
   fx-cli push -t plugin -p MyPlugin
   \`\`\`
   推送指定名称的插件。系统会在插件目录中查找名为 \`MyPlugin\` 的子目录。

3. **推送指定路径的插件**
   \`\`\`bash
   fx-cli push -t plugin /path/to/plugin
   \`\`\`
   推送指定路径的插件。

4. **推送当前目录的插件**
   \`\`\`bash
   fx-cli push -t plugin .
   \`\`\`
   推送当前目录作为插件。

##### 参数说明

- \`-t, --type\`: 指定资源类型，此处为 \`plugin\`
- \`-p, --path\`: 指定插件名称或路径（可选）
- \`-f, --file\`: 指定单个文件路径（可选，用于推送单个文件）

##### 插件推送流程

1. **读取插件配置**：从 \`plugin.xml\` 文件中读取插件配置信息
2. **文件上传**：上传插件目录中的所有文件到服务器
3. **静态资源处理**：如果存在 \`static\` 目录，也会上传其中的静态资源
4. **构建请求**：将所有文件信息和配置信息构建成API请求
5. **发送请求**：调用服务端API完成插件推送
6. **更新记录**：推送成功后更新本地记录文件

##### 插件目录结构

插件目录应包含以下结构：

\`\`\`
MyPlugin/
├── plugin.xml          # 插件配置文件（必需）
├── sourceFiles/        # 源代码目录（可选）
│   └── index.js        # 插件入口文件
├── fileTree/           # 文件树目录（可选，与sourceFiles二选一）
└── static/             # 静态资源目录（可选）
    └── README.md       # 静态资源文件
\`\`\`

##### 版本冲突处理

插件推送实现了智能的版本冲突处理机制：

1. **自动版本同步**：
   - 当遇到"当前代码在线上有更高版本"错误时，系统会自动从服务器获取最新的插件信息
   - 更新本地 \`unchangeableJson.json\` 文件中的 \`updateTime\`
   - 使用正确的时间戳重试推送，无需手动干预

2. **智能重试机制**：
   - 针对不同类型的错误，采用不同的重试策略
   - 对于系统异常，尝试将 \`updateTime\` 设置为 0
   - 对于版本冲突，从服务器获取最新信息
   - 对于重复名称错误，使用正确的时间戳

3. **插件键名智能判断**：
   - 根据 \`unchangeableJson.json\` 中插件是否已存在，智能选择使用原始插件名称或清理后的插件名称作为键名
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

1. 插件目录必须包含 \`plugin.xml\` 文件，否则推送会失败
2. 推送前请确保已正确配置认证信息
3. 如果推送失败，请检查网络连接和服务器状态
4. 推送成功后，系统会自动更新 \`unchangeableJson.json\` 文件中的插件记录
5. 系统会自动处理版本冲突，无需手动干预
6. 插件推送使用固定的 \`plugin.xml\` 文件名，不再依赖插件名称

#### 组件推送详细说明

##### 基本用法

1. **推送所有组件**
   \`\`\`bash
   fx-cli push -t component
   \`\`\`
   此命令会扫描 \`fx-app/main/PWC/components\` 目录下的所有子目录，并推送每个包含 \`component.xml\` 文件的组件。

2. **推送指定组件**
   \`\`\`bash
   fx-cli push -t component -p MyComponent
   \`\`\`
   推送指定名称的组件。系统会在组件目录中查找名为 \`MyComponent\` 的子目录。

3. **推送指定路径的组件**
   \`\`\`bash
   fx-cli push -t component /path/to/component
   \`\`\`
   推送指定路径的组件。

4. **推送当前目录的组件**
   \`\`\`bash
   fx-cli push -t component .
   \`\`\`
   推送当前目录作为组件。

##### 参数说明

- \`-t, --type\`: 指定资源类型，此处为 \`component\`
- \`-p, --path\`: 指定组件名称或路径（可选）
- \`-f, --file\`: 指定单个文件路径（可选，用于推送单个文件）

##### 组件推送流程

1. **读取组件配置**：从 \`component.xml\` 文件中读取组件配置信息
2. **文件上传**：上传组件目录中的所有文件到服务器
3. **静态资源处理**：如果存在 \`static\` 目录，也会上传其中的静态资源
4. **构建请求**：将所有文件信息和配置信息构建成API请求
5. **发送请求**：调用服务端API完成组件推送
6. **更新记录**：推送成功后更新本地记录文件

##### 版本冲突处理

系统实现了智能的版本冲突处理机制，能够自动处理以下情况：

1. **自动版本同步**：
   - 当遇到"当前代码在线上有更高版本"错误时，系统会自动从服务器获取最新的组件信息
   - 更新本地 \`unchangeableJson.json\` 文件中的 \`updateTime\`
   - 使用正确的时间戳重试推送，无需手动干预

2. **智能重试机制**：
   - 针对不同类型的错误，采用不同的重试策略
   - 对于系统异常，尝试将 \`updateTime\` 设置为 0
   - 对于版本冲突，从服务器获取最新信息
   - 对于重复名称错误，使用正确的时间戳

3. **组件键名智能判断**：
   - 根据 \`unchangeableJson.json\` 中组件是否已存在，智能选择使用原始组件名称或清理后的组件名称作为键名
   - 确保组件记录的一致性和可追溯性

##### 错误处理

系统实现了完善的错误处理机制：

1. **错误分类与处理**：
   - 系统提示类错误（如"提示信息"、"系统提示"）会被降级为警告，避免中断用户操作
   - 权限不足、参数错误、资源不存在等错误会被分类处理，提供相应的解决建议

2. **具体错误处理**：
   - **文件不存在错误**：检查组件目录和必要文件是否存在
   - **API 请求错误**：处理网络请求失败，解析服务器返回的错误信息
   - **系统提示错误**：将错误级别降级为警告，避免中断用户操作
   - **版本冲突错误**：自动从服务器获取最新信息并重试

##### 注意事项

1. 组件目录必须包含 \`component.xml\` 文件，否则推送会失败
2. 推送前请确保已正确配置认证信息
3. 如果推送失败，请检查网络连接和服务器状态
4. 推送成功后，系统会自动更新 \`unchangeableJson.json\` 文件中的组件记录
5. 系统会自动处理版本冲突，无需手动干预

#### 函数推送容错机制

函数推送包含三层容错机制：

1. **强制更新**：当遇到"函数已存在"错误时，直接使用函数信息进行更新
2. **灵活查询**：当强制更新失败时，尝试仅使用apiName查询函数
3. **直接更新**：当查询也失败时，使用本地元数据直接更新

这确保了在各种复杂情况下都能成功推送函数代码。

#### 默认目录映射

| 类型 | 默认目录 |
|-----|---------|
| \`class\` | \`fx-app/main/APL/classes\` |
| \`function\` | \`fx-app/main/APL/functions\` |
| \`component\` | \`fx-app/main/PWC\` |
| \`plugin\` | \`fx-app/main/PWC\` |

##### 推送命令特性

- **智能路径选择**：当未指定 \`-p\` 参数时，系统会根据 \`-t\` 类型自动选择对应的默认目录
  - \`class\` → \`fx-app/main/APL/classes\`
  - \`function\` → \`fx-app/main/APL/functions\`
  - \`component\` → \`fx-app/main/PWC\`
  - \`plugin\` → \`fx-app/main/PWC\`
- **批量推送**：支持推送整个目录下的所有相关文件
- **类型验证**：确保推送的文件类型与指定的类型匹配
- **组件全量推送**：支持一次性推送所有组件，无需逐个指定
- **灵活的参数组合**：支持多种参数组合方式，满足不同推送需求
- **容错机制**：推送失败时会提供详细的错误信息，帮助定位问题

## 项目结构

- \`fx-app/main/PWC/components/\` - 自定义组件
- \`fx-app/main/PWC/plugins/\` - 自定义插件 (插件文件夹使用API返回的name属性命名)
- \`fx-app/main/APL/functions/\` - APL函数
- \`fx-app/main/APL/classes/\` - APL类
- \`.fx-cli/config.json\` - 项目配置文件
- \`unchangeableJson.json\` - 不可变资源记录文件

## 注意事项

- 插件拉取时，文件夹名称由API返回的name属性决定，可能与命令行中指定的apiName不同
- 推送到服务器时，请使用实际的文件夹名称作为推送参数
- 组件推送时会自动处理版本冲突，无需手动干预
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