# 新建函数功能实现文档

## 概述

本文档详细描述了fx-cli中新建函数功能的完整实现逻辑，包括从文件注释解析、API调用、编译检查到配置文件更新的整个流程。

## 实现背景

在原始实现中，`pushFunctionService.js` 的 `createFunction` 方法与 `pushClassService.js` 的 `pushNewClass` 方法存在以下差异：

1. **流程差异**：`pushNewClass` 有完整的分析检查流程，而 `createFunction` 缺少
2. **apiName格式差异**：`pushClassService` 使用 `${className}__c` 格式，而 `pushFunctionService` 缺少 `__c` 后缀
3. **参数传递差异**：`namespace` 和 `returnType` 参数未正确传递到服务端

## 核心修复内容

### 1. 重构createFunction方法为三步流程

#### 原始实现问题
```javascript
// 原始实现：直接调用API，缺少分析和编译检查
const createResult = await this.createFunction(createFunctionData);
```

#### 修复后实现
```javascript
// 步骤1：调用API进行编译检查
const compileCheckResult = await this.apiRequest('post', '/FHH/EMDHFUNC/biz/compileCheck', {
  type: 'function',
  lang: 0,
  commit: 'fx-cli create function',
  apiName: defaultFunction.api_name,
  nameSpace: defaultFunction.name_space,
  description: defaultFunction.description,
  name: defaultFunction.function_name,
  bindingObjectApiName: defaultFunction.binding_object_api_name,
  returnType: defaultFunction.return_type,
  metaXml: '',
  content: functionContent,
  updateTime: 0
});

// 步骤2：调用API上传函数代码
const uploadResult = await this.apiRequest('post', '/FHH/EMDHFUNC/biz/upload', {
  type: 'function',
  lang: 0,
  commit: 'fx-cli create function',
  apiName: defaultFunction.api_name,
  nameSpace: defaultFunction.name_space,
  description: defaultFunction.description,
  name: defaultFunction.function_name,
  bindingObjectApiName: defaultFunction.binding_object_api_name,
  returnType: defaultFunction.return_type,
  metaXml: '',
  content: functionContent,
  updateTime: 0
});

// 步骤3：调用API创建函数记录
const createResult = await this.apiRequest('post', '/FHH/EMDHFUNC/biz/create', {
  apiName: defaultFunction.api_name,
  name: defaultFunction.function_name,
  description: defaultFunction.description,
  type: 'function',
  bindingObjectApiName: defaultFunction.binding_object_api_name,
  nameSpace: defaultFunction.name_space,
  returnType: defaultFunction.return_type,
  lang: 0,
  metaXml: '',
  content: functionContent,
  commit: 'fx-cli create function'
});
```

### 2. 修复apiName格式规范

#### 问题分析
- `pushClassService` 使用 `${className}__c` 格式
- `pushFunctionService` 原本使用 `fileName` 格式

#### 修复方案
```javascript
// 默认apiName格式统一为 fileName__c
let apiName = `${fileName}__c`; // 默认使用文件名+__c后缀，符合API规范
```

### 3. 完善namespace和returnType参数传递

#### 从文件注释解析
```javascript
// 解析nameSpace和returnType
const nameSpaceMatch = functionContent.match(/@nameSpace\s+(\w+)/);
if (nameSpaceMatch) {
  nameSpace = nameSpaceMatch[1];
  console.log(`[DEBUG] 从函数文件中解析到nameSpace: ${nameSpace}`);
  this.log('info', `从函数文件中解析到nameSpace: ${nameSpace}`, this.colors.blue);
}

const returnTypeMatch = functionContent.match(/@returnType\s+(\w+)/);
if (returnTypeMatch) {
  returnType = returnTypeMatch[1];
  console.log(`[DEBUG] 从函数文件中解析到returnType: ${returnType}`);
  this.log('info', `从函数文件中解析到returnType: ${returnType}`, this.colors.blue);
}
```

#### 优先级逻辑
1. 优先从文件注释中解析 `@nameSpace` 和 `@returnType`
2. 如果注释中未解析到，则从 `unchangeableJson.json` 中读取
3. 如果都没有，使用默认空值

```javascript
// 只有当从文件注释中未解析到值时，才从unchangeableJson.json中获取nameSpace和returnType
if (!nameSpace && unchangeableJson[functionKey].nameSpace) {
  nameSpace = unchangeableJson[functionKey].nameSpace;
  this.log('info', `从unchangeableJson.json中获取到nameSpace: ${nameSpace}`, this.colors.blue);
}
if (!returnType && unchangeableJson[functionKey].returnType) {
  returnType = unchangeableJson[functionKey].returnType;
  this.log('info', `从unchangeableJson.json中获取到returnType: ${returnType}`, this.colors.blue);
}
```

#### 在分析和编译步骤中确保参数传递
```javascript
// 分析函数
functionInfo.nameSpace = nameSpace;
functionInfo.returnType = returnType;
console.log(`[DEBUG] 准备分析函数，functionInfo.nameSpace: ${functionInfo.nameSpace}, functionInfo.returnType: ${functionInfo.returnType}`);
await this.analyzeFunction(functionInfo);

// 编译函数
functionInfo.nameSpace = nameSpace;
functionInfo.returnType = returnType;
console.log(`[DEBUG] 准备编译函数，functionInfo.nameSpace: ${functionInfo.nameSpace}, functionInfo.returnType: ${functionInfo.returnType}`);
await this.compileFunction(functionInfo);
```

## 完整的新建函数流程

### 1. 文件解析阶段
```javascript
// 读取函数文件内容
const functionContent = await fs.readFile(functionFilePath, 'utf8');

// 解析文件注释中的配置信息
let bindingObjectApiName = certificateData.bindingObjectApiName || 'NONE';
let apiName = `${fileName}__c`; // 默认格式
let nameSpace = '';
let returnType = '';

// 从注释中解析bindingObjectApiName、apiName、nameSpace、returnType
const bindingObjectMatch = functionContent.match(/@bindingObjectApiName\s+(\w+)/);
const apiNameMatch = functionContent.match(/@apiName\s+(\w+)/);
const nameSpaceMatch = functionContent.match(/@nameSpace\s+(\w+)/);
const returnTypeMatch = functionContent.match(/@returnType\s+(\w+)/);
```

### 2. 配置读取阶段
```javascript
// 从unchangeableJson.json中读取现有配置（作为补充）
const unchangeableJson = JSON.parse(unchangeableContent);
const functionKey = `function:${fileName}`;

if (unchangeableJson[functionKey]) {
  // 只有当注释中未解析到时才使用JSON中的值
  if (!bindingObjectApiName && unchangeableJson[functionKey].bindingObjectApiName) {
    bindingObjectApiName = unchangeableJson[functionKey].bindingObjectApiName;
  }
  if (!apiName && unchangeableJson[functionKey].apiName) {
    apiName = unchangeableJson[functionKey].apiName;
  }
  if (!nameSpace && unchangeableJson[functionKey].nameSpace) {
    nameSpace = unchangeableJson[functionKey].nameSpace;
  }
  if (!returnType && unchangeableJson[functionKey].returnType) {
    returnType = unchangeableJson[functionKey].returnType;
  }
}
```

### 3. 函数创建阶段
```javascript
// 使用--new选项时跳过存在性检查
if (isNewFunction) {
  // 创建函数记录
  const createFunctionData = {
    name: fileName,
    apiName: apiName,
    description: `函数 ${fileName}`,
    type: 'function',
    bindingObjectApiName: bindingObjectApiName,
    nameSpace: nameSpace,
    returnType: returnType,
    lang: 0,
    metaXml: '',
    content: functionContent,
    commit: 'fx-cli create function'
  };
  
  // 执行三步创建流程
  await this.createFunction(createFunctionData);
}
```

### 4. 代码上传和分析编译阶段
```javascript
// 上传函数代码
const uploadData = {
  files: [{
    fileName: `${fileName}.groovy`,
    content: functionContent
  }]
};
await this.uploadFunctionCode(functionId, uploadData, functionInfo);

// 分析函数
functionInfo.content = functionContent;
functionInfo.nameSpace = nameSpace;
functionInfo.returnType = returnType;
await this.analyzeFunction(functionInfo);

// 编译函数
functionInfo.nameSpace = nameSpace;
functionInfo.returnType = returnType;
await this.compileFunction(functionInfo);
```

### 5. 配置文件更新阶段
```javascript
// 更新unchangeableJson.json文件
await this.updateUnchangeableJson(functionDir, fileName, functionId, isNewFunctionCreated, 
                                 bindingObjectApiName, apiName, nameSpace, returnType, functionContent);
```

## 支持的文件注释格式

函数文件支持以下注释来定义配置信息：

```groovy
/**
 * @nameSpace button
 * @returnType UIAction
 * @bindingObjectApiName AccountObj
 * @apiName CustomApiName__c
 */
def MyFunction() {
    log.info('Function executed!');
    return "success";
}
```

### 注释说明
- `@nameSpace`: 函数的命名空间（如：button、library等）
- `@returnType`: 返回类型（如：UIAction、void等）
- `@bindingObjectApiName`: 绑定对象的API名称
- `@apiName`: 自定义API名称（可选，默认使用文件名__c）

## 测试验证

### 测试用例1：基本功能测试
```bash
# 创建带有注释的函数文件
cat > TestFunction.groovy << 'EOF'
/**
 * @nameSpace button
 * @returnType UIAction
 * @bindingObjectApiName AccountObj
 */
def TestFunction() {
    log.info('TestFunction executed!');
    return "success";
}
EOF

# 推送新函数
node ../fx-cli/bin/fx-cli.js push -t function TestFunction --new
```

### 预期结果
1. 从文件注释中正确解析 `nameSpace: "button"` 和 `returnType: "UIAction"`
2. apiName使用 `"TestFunction__c"` 格式
3. 编译检查、上传、创建三个步骤都成功执行
4. unchangeableJson.json文件正确更新，包含所有配置信息

### 测试用例2：参数传递验证
日志中应显示：
```
[DEBUG] 从函数文件中解析到nameSpace: button
[DEBUG] 从函数文件中解析到returnType: UIAction
[DEBUG] createFunction - 调用API进行编译检查，nameSpace: button, returnType: UIAction
[DEBUG] 准备分析函数，functionInfo.nameSpace: button, functionInfo.returnType: UIAction
[DEBUG] 准备编译函数，functionInfo.nameSpace: button, functionInfo.returnType: UIAction
```

## 关键改进点总结

1. **流程统一**：createFunction方法现在与pushNewClass方法保持一致的三步流程
2. **格式规范**：apiName统一使用 `${fileName}__c` 格式，符合API规范
3. **参数完整**：namespace和returnType参数在所有步骤中正确传递
4. **注释解析**：支持从文件注释中解析配置信息，提高开发体验
5. **优先级管理**：文件注释优先于JSON配置，灵活性更高
6. **调试支持**：添加详细的调试日志，便于问题排查

## 相关文件

- `/fx-cli/src/services/pushFunctionService.js` - 主要实现文件
- `/fx-cli/src/services/pushClassService.js` - 参考实现文件
- `/test-1/unchangeableJson.json` - 配置文件示例

## 注意事项

1. 使用 `--new` 选项时会跳过函数存在性检查，直接创建新函数
2. 文件注释中的配置优先级高于unchangeableJson.json中的配置
3. apiName默认会自动添加 `__c` 后缀，无需手动添加
4. 所有API调用都包含完整的错误处理和状态检查