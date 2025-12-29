# --new参数实现问题与解决方案

## 概述

本文档总结了在实现`--new`参数过程中遇到的问题、解决方案以及最终实现逻辑。`--new`参数用于强制创建新组件，避免与现有组件冲突。

## 问题背景

在实现`--new`参数时，我们遇到了一个关键问题：在更新`unchangeableJson.json`文件时，键名的构建逻辑不一致。这导致了以下问题：

1. **读取时**：使用不带`__c`后缀的组件名称作为键名
2. **写入时**：使用带`__c`后缀的`componentId`作为键名

这种不一致性会导致组件记录无法正确更新，甚至可能创建重复记录。

## 问题详细分析

### 1. 键名构建不一致

#### 读取阶段
```javascript
// 读取unchangeableJson.json时
let componentKey;
if (isNewComponent) {
  // 使用原始组件名称作为键名，格式为 component:sanitizedComponentName（不带__c后缀）
  componentKey = `component:${sanitizedComponentName}`;
} else {
  // 使用组件名称作为键名
  componentKey = `component:${componentName}`;
}
```

#### 写入阶段（修改前）
```javascript
// 更新unchangeableJson.json时（修改前）
let componentKey;
if (isNewComponent) {
  // 使用新的apiName作为键名，格式为 component:apiName（带__c后缀）
  componentKey = `component:${componentId}`;
  logger.info(`使用新的apiName作为组件键名: ${componentKey}`);
} else {
  // 使用组件名称作为键名
  componentKey = `component:${componentName}`;
}
```

这种不一致性导致：
- 读取时使用`component:myComponent`作为键名
- 写入时使用`component:myComponent__c`作为键名
- 结果：无法正确更新同一组件记录，可能导致创建重复记录

### 2. API请求与本地记录的冲突

在API请求中，我们需要使用带有`__c`后缀的`componentId`作为`apiName`，这是为了与extension保持一致。但在本地记录中，使用不带`__c`后缀的组件名称作为键名更加合理，因为：

1. 键名应该更加用户友好
2. 键名不应该包含系统添加的后缀
3. 键名应该与组件的实际名称保持一致

## 解决方案

### 1. 统一键名构建逻辑

修改写入阶段的键名构建逻辑，使其与读取阶段保持一致：

```javascript
// 更新unchangeableJson.json时（修改后）
let componentKey;
if (isNewComponent) {
  // 使用原始组件名称作为键名，格式为 component:sanitizedComponentName（不带__c后缀）
  componentKey = `component:${sanitizedComponentName}`;
  logger.info(`使用原始组件名称作为组件键名: ${componentKey}`);
} else {
  // 使用组件名称作为键名
  componentKey = `component:${componentName}`;
}
```

### 2. 分离API请求与本地记录

确保API请求和本地记录使用不同的标识符：

1. **API请求**：使用带有`__c`后缀的`componentId`作为`apiName`
2. **本地记录**：使用不带`__c`后缀的`sanitizedComponentName`作为键名

这样既保证了API请求的正确性，又确保了本地记录的一致性。

## 最终实现逻辑

### 1. 组件ID处理

```javascript
// 移除__c后缀（如果存在）以便统一处理
if (sanitizedComponentName.endsWith('__c')) {
  sanitizedComponentName = sanitizedComponentName.slice(0, -3);
}

// 清理组件名称，确保符合coding变量命名规则
sanitizedComponentName = sanitizedComponentName
  .replace(/[^a-zA-Z0-9_]/g, '_')
  .replace(/^(?=\d)/, '_');

// 确保组件ID带有__c后缀
let componentId = `${sanitizedComponentName}__c`;
```

### 2. --new参数处理

```javascript
// 如果指定了--new参数，强制创建新组件，忽略本地updateTime
if (isNewComponent) {
  logger.info(`指定了--new参数，强制创建新组件，忽略本地updateTime`);
  componentId = `${sanitizedComponentName}__c`; // 恢复__c后缀，确保apiName正确
  updateTime = 0; // 对于新组件，updateTime应该为0
  logger.info(`为--new参数使用原始apiName: ${componentId}, updateTime: ${updateTime}`);
}
```

### 3. 读取unchangeableJson.json

```javascript
// 构建组件的键名
let componentKey;
if (isNewComponent) {
  // 使用原始组件名称作为键名，格式为 component:sanitizedComponentName（不带__c后缀）
  componentKey = `component:${sanitizedComponentName}`;
  logger.info(`使用原始组件名称作为组件键名: ${componentKey}`);
} else {
  // 使用组件名称作为键名
  componentKey = `component:${componentName}`;
  logger.info(`使用组件名称作为组件键名: ${componentKey}`);
}
```

### 4. 更新unchangeableJson.json

```javascript
// 构建组件的键名
let componentKey;
if (isNewComponent) {
  // 使用原始组件名称作为键名，格式为 component:sanitizedComponentName（不带__c后缀）
  componentKey = `component:${sanitizedComponentName}`;
  logger.info(`使用原始组件名称作为组件键名: ${componentKey}`);
} else {
  // 使用组件名称作为键名
  componentKey = `component:${componentName}`;
  logger.info(`使用组件名称作为组件键名: ${componentKey}`);
}

// 更新或创建组件记录
if (unchangeableJson[componentKey]) {
  // 更新现有的组件记录
  unchangeableJson[componentKey].updateTime = latestUpdateTime;
  logger.info(`更新unchangeableJson.json中的组件 ${componentKey} 的updateTime为 ${latestUpdateTime}`);
} else {
  // 创建新的组件记录
  unchangeableJson[componentKey] = {
    apiName: componentId,  // 注意：这里使用带有__c后缀的componentId
    type: 'component',
    updateTime: latestUpdateTime,
    name: componentName
  };
  logger.info(`在unchangeableJson.json中创建新的组件记录 ${componentKey}`);
}
```

## 关键修改点

1. **统一键名构建逻辑**：确保读取和写入时使用相同的键名构建逻辑
2. **分离API请求与本地记录**：API请求使用`componentId`，本地记录使用`sanitizedComponentName`
3. **正确处理--new参数**：确保在--new参数模式下，组件ID和键名都正确处理

## 测试建议

1. **测试--new参数**：确保使用--new参数时能正确创建新组件
2. **测试组件更新**：确保不使用--new参数时能正确更新现有组件
3. **测试重复推送**：确保重复推送同一组件时不会创建重复记录
4. **测试特殊字符**：确保组件名称包含特殊字符时能正确处理

## 总结

通过统一键名构建逻辑和分离API请求与本地记录，我们成功解决了--new参数实现中的关键问题。现在，当用户使用--new参数推送组件时：

1. API请求中的apiName使用带有__c后缀的componentId（保持与extension一致）
2. unchangeableJson.json中的键名使用不带__c后缀的sanitizedComponentName（确保键名一致性）

这样既保证了API请求的正确性，又确保了本地记录的一致性，避免了重复记录的问题。