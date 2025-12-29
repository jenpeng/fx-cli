# Push Function 实现文档

## 概述

Push Function 是 FX-CLI 工具中的核心功能之一，用于将本地 Groovy 函数文件推送到远程服务器。该功能支持单个函数推送和批量推送，并具备完整的错误处理和容错机制。

## 核心架构

### 主要组件

1. **PushFunctionService** - 函数推送服务类，负责整个推送流程
2. **API Service** - 底层API调用服务，处理与服务器的通信
3. **ConfigManager** - 配置管理器，处理证书和认证信息
4. **文件系统操作** - 处理本地文件读取和元数据更新

### 关键文件

- `fx-cli/src/services/pushFunctionService.js` - 主要实现文件
- `fx-cli/src/services/api.js` - API调用封装
- `test-1/unchangeableJson.json` - 函数元数据存储

## 完整实现流程

### 1. 初始化阶段

```javascript
// 获取证书数据
const certificateData = await getCertificateData();

// 确定目标文件路径
let targetFilePath = singleFilePath || // 单个文件路径
  path.join(functionDir, groovyFiles[0]); // 目录下第一个.groovy文件
```

**证书获取策略：**
- 优先从项目根目录的 `certificate.json` 读取
- 备选方案：从 ConfigManager 读取认证信息
- 必须包含 `domain` 和 `certificate` 字段

### 2. 函数信息解析

#### 2.1 文件内容解析
```javascript
const functionContent = await this.readFileContent(targetFilePath);
const fileName = path.basename(targetFilePath, '.groovy');
```

#### 2.2 元数据提取
从函数文件注释中解析以下信息：
```groovy
@bindingObjectApiName AccountObj
@apiName MyButtonAction__c
@nameSpace com.example
@returnType String
```

**默认值策略：**
- `bindingObjectApiName`: 从证书获取，默认 'NONE'
- `apiName`: 文件名 + '__c' 后缀
- `nameSpace`: 从 unchangeableJson.json 获取，默认空字符串
- `returnType`: 从 unchangeableJson.json 获取，默认空字符串

#### 2.3 从 unchangeableJson.json 补充信息
```javascript
const unchangeableJsonPath = path.join(functionDir, '..', '..', '..', '..', 'unchangeableJson.json');
const storedFunctionInfo = unchangeableData[`function:${fileName}`];
```

### 3. 函数存在性检查

```javascript
let functionInfo = await this.getFunctionInfo(apiName, bindingObjectApiName);
```

**查询逻辑：**
- 如果 `functionName` 是24位十六进制字符串，直接返回基本信息
- 否则调用 `api.getSingleFunction()` 进行查询
- 查询失败时返回 `null`，表示函数不存在

### 4. 函数创建/更新逻辑

#### 4.1 新函数创建
```javascript
if (!functionInfo) {
  const createFunctionData = {
    type: 'function',
    apiName: apiName,
    name: fileName,
    bindingObjectApiName: bindingObjectApiName,
    // ... 其他字段
  };
  
  const createResult = await this.createFunction(createFunctionData);
  functionId = createResult.data?.id || createResult.id;
}
```

#### 4.2 已存在函数更新
```javascript
const uploadData = {
  files: [{
    fileName: `${fileName}.groovy`,
    content: functionContent
  }]
};

const uploadResult = await this.uploadFunctionCode(functionId, uploadData, functionInfo);
```

### 5. 容错机制（多层容错）

#### 5.1 第一层：强制更新
当创建函数时遇到"函数API名称已经存在"错误：

```javascript
// 构造函数信息直接上传
functionInfo = {
  apiName: apiName,
  name: fileName,
  bindingObjectApiName: bindingObjectApiName,
  // ...
};

const uploadResult = await this.uploadFunctionCode(null, uploadData, functionInfo);
```

#### 5.2 第二层：灵活查询
当强制更新失败且错误信息包含"未查询到该自定义函数"：

```javascript
// 尝试只使用apiName查询，不指定bindingObjectApiName
const flexibleFunctionInfo = await api.getSingleFunction(functionInfo.apiName, 'function', 'NONE');

if (flexibleFunctionInfo && flexibleFunctionInfo.Value) {
  const functionId = flexibleFunctionInfo.Value.id;
  const updatedFunctionInfo = {
    ...functionInfo,
    bindingObjectApiName: flexibleFunctionInfo.Value.bindingObjectApiName
  };
  
  // 使用查询到的函数ID重新上传
  const forceUploadResult = await this.uploadFunctionCode(functionId, uploadData, updatedFunctionInfo);
}
```

#### 5.3 第三层：直接更新
当灵活查询也失败时：

```javascript
// 从unchangeableJson.json读取存储的函数信息
const unchangeableContent = await fs.promises.readFile(unchangeableJsonPath, 'utf8');
const unchangeableData = JSON.parse(unchangeableContent);
const storedFunctionInfo = unchangeableData[`function:${functionInfo.name}`];

if (storedFunctionInfo) {
  const directUpdateFunctionInfo = {
    ...functionInfo,
    bindingObjectApiName: storedFunctionInfo.bindingObjectApiName,
    nameSpace: storedFunctionInfo.nameSpace,
    returnType: storedFunctionInfo.returnType,
    apiName: storedFunctionInfo.apiName
  };
  
  // 直接上传，不传functionId，让服务器根据apiName匹配
  const directUploadResult = await this.uploadFunctionCode(null, directUploadData, directUpdateFunctionInfo);
}
```

### 6. 后处理流程

#### 6.1 函数分析
```javascript
const analyzeData = {
  api_name: functionInfo.apiName,
  binding_object_api_name: functionInfo.bindingObjectApiName,
  body: functionInfo.content,
  name_space: functionInfo.nameSpace,
  return_type: functionInfo.returnType,
  // ...
};

const response = await api.post('/FHH/EMDHFUNC/runtime/analyze', { function: analyzeData });
```

#### 6.2 函数编译
```javascript
const compileData = {
  // 与analyzeData结构相同
};

const response = await api.post('/FHH/EMDHFUNC/runtime/compileCheck', { function: compileData });
```

#### 6.3 元数据更新
```javascript
await this.updateUnchangeableJson(
  functionDir, fileName, functionId, isNewFunctionCreated,
  bindingObjectApiName, apiName, nameSpace, returnType, functionContent
);
```

**更新内容：**
```javascript
unchangeableJson[`function:${functionName}`] = {
  updateTime: Date.now(),
  name: functionName,
  apiName: apiName,
  content: content,
  bindingObjectApiName: bindingObjectApiName,
  type: 'function',
  nameSpace: nameSpace,
  returnType: returnType,
  tenantId: '67000207',
  lang: 0
};
```

## API 接口说明

### 1. 上传函数代码
- **接口**: `POST /FHH/EMDHFUNC/biz/upload`
- **用途**: 上传函数源代码
- **关键参数**:
  - `type`: 'function'
  - `lang`: 0 (Groovy)
  - `apiName`: 函数API名称
  - `bindingObjectApiName`: 绑定对象API名称
  - `content`: 函数源代码内容

### 2. 分析函数
- **接口**: `POST /FHH/EMDHFUNC/runtime/analyze`
- **用途**: 分析函数代码结构
- **关键参数**: 包含函数完整信息的function对象

### 3. 编译检查
- **接口**: `POST /FHH/EMDHFUNC/runtime/compileCheck`
- **用途**: 编译函数并检查语法错误
- **关键参数**: 与分析接口相同的function对象

### 4. 查询函数
- **接口**: `api.getSingleFunction()`
- **用途**: 查询单个函数信息
- **参数**: functionName, type, bindingObjectApiName

## 错误处理策略

### 1. 分级错误处理
- **ERROR**: 阻断流程的严重错误
- **WARN**: 不影响主流程的警告
- **INFO**: 正常流程信息
- **DEBUG**: 详细调试信息

### 2. 容错原则
- 分析/编译失败不阻断主流程
- 多层容错机制确保推送成功
- 详细的错误日志便于问题排查

### 3. 常见错误场景
1. **函数已存在但查询不到** → 使用多层容错机制
2. **证书信息缺失** → 优先certificate.json，备选ConfigManager
3. **元数据不完整** → 从多个源补充信息
4. **网络异常** → 详细错误信息输出

## 批量推送实现

```javascript
async pushAllFunctions(functionsDir) {
  const files = await fs.readdir(functionsDir);
  const groovyFiles = files.filter(file => file.endsWith('.groovy'));
  
  const results = [];
  for (const file of groovyFiles) {
    const functionDir = path.join(functionsDir, file);
    const result = await this.pushFunction(functionDir);
    results.push(result);
  }
  
  return {
    total: groovyFiles.length,
    success: successCount,
    failed: failedCount,
    results: results
  };
}
```

## 性能优化

### 1. 并发控制
- 串行处理避免API限流
- 错误隔离不影响其他函数

### 2. 缓存策略
- 证书信息缓存
- 函数信息缓存

### 3. 日志优化
- 分级日志输出
- 彩色日志提升可读性

## 配置和扩展

### 1. 环境变量
- `LOG_LEVEL`: 控制日志输出级别
- `FX_COMMIT`: 提交信息

### 2. 扩展点
- 支持自定义错误处理逻辑
- 支持插件化元数据提取
- 支持多种文件格式

## 最佳实践

### 1. 函数文件规范
```groovy
@bindingObjectApiName AccountObj
@apiName MyButtonAction__c
@nameSpace com.example
@returnType String
def myFunction() {
    // 函数实现
}
```

### 2. 目录结构
```
fx-app/main/APL/functions/
├── Function1.groovy
├── Function2.groovy
└── ...
```

### 3. 配置文件
- `certificate.json`: 证书信息
- `unchangeableJson.json`: 函数元数据
- `.fx-cli/config.json`: CLI配置

## 总结

Push Function 实现了一个完整、健壮的函数推送系统，具备以下特点：

1. **完整性**: 覆盖函数推送的完整生命周期
2. **健壮性**: 多层容错机制处理各种异常情况
3. **可扩展性**: 模块化设计便于功能扩展
4. **可维护性**: 清晰的代码结构和详细的日志
5. **用户友好**: 彩色日志和详细的错误信息

该实现成功解决了函数已存在但查询不到的复杂场景，确保在各种情况下都能成功推送函数代码。