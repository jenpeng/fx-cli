/**
 * 代码拉取服务
 * 负责从远程服务拉取组件、插件、函数和类的代码
 */

const fs = require('fs-extra');
const path = require('path');
const api = require('./api');
const { writeFileContent, json2Dir } = require('../utils/fileUtils');
const { getConfigManager } = require('../core/ConfigManager');
const configManager = getConfigManager();

/**
 * 更新unchangeableJson.json文件，记录拉取的资源信息
 * @param {string} type - 资源类型：component/plugin/function/class
 * @param {Object} resourceInfo - 资源信息
 * @returns {Promise<void>}
 */
const updateUnchangeableJson = async (type, resourceInfo) => {
  try {
    // 获取项目根目录
    const projectRoot = process.cwd();
    const unchangeableJsonPath = path.join(projectRoot, 'unchangeableJson.json');
    
    // 读取现有文件或创建新文件
    let unchangeableJsonContent;
    if (await fs.pathExists(unchangeableJsonPath)) {
      const fileContent = await fs.readFile(unchangeableJsonPath, 'utf8');
      unchangeableJsonContent = JSON.parse(fileContent);
    } else {
      unchangeableJsonContent = {}; // 使用空对象作为初始结构
    }
    
    // 确保resourceInfo.apiName存在，如果不存在，尝试使用其他字段作为替代
    let apiName = resourceInfo.apiName;
    if (!apiName) {
      // 尝试使用funcName、name或其他可能的字段
      apiName = resourceInfo.funcName || resourceInfo.name;
      if (!apiName) {
        console.error(`更新unchangeableJson.json失败: 资源缺少必要的apiName或name字段`);
        return;
      }
      // 如果apiName不包含__c后缀，添加它
      if (!apiName.endsWith('__c')) {
        apiName += '__c';
      }
    }
    
    // 构建资源键名，格式为 "type:apiName"（去掉__c后缀作为键）
    const keyName = apiName.replace(/__c$/, '');
    const resourceKey = `${type}:${keyName}`;
    
    // 创建资源记录，保留资源的所有原始字段
    const resourceRecord = {
      updateTime: Date.now(), // 更新时间戳
      name: resourceInfo.name || resourceInfo.funcName || '',
      apiName: apiName,
      content: resourceInfo.content || '',
      bindingObjectApiName: resourceInfo.bindingObjectApiName || "NONE",
      type: type,
      nameSpace: resourceInfo.nameSpace || resourceInfo.namespace || "",
      returnType: resourceInfo.returnType || "",
      tenantId: resourceInfo.tenantId || "",
      lang: resourceInfo.lang || 0
    };
    
    // 更新或添加资源
    unchangeableJsonContent[resourceKey] = resourceRecord;
    
    // 写入更新后的内容
    await fs.writeFile(unchangeableJsonPath, JSON.stringify(unchangeableJsonContent, null, 2));
    console.log(`已更新unchangeableJson.json，记录${type} [${resourceInfo.name || resourceInfo.apiName || resourceInfo.funcName}]`);
  } catch (error) {
    console.error(`更新unchangeableJson.json失败: ${error.message}`);
    // 不抛出错误，避免影响主流程
  }
};

// 辅助函数：将调试信息写入日志文件
const writeDebugLog = async (data, filename) => {
  const logDir = path.join(process.cwd(), 'debug-logs');
  await fs.ensureDir(logDir);
  const logPath = path.join(logDir, `${filename}-${Date.now()}.json`);
  await fs.writeFile(logPath, JSON.stringify(data, null, 2));
  console.log(`调试信息已写入: ${logPath}`);
};

/**
 * 拉取单个组件/插件
 * @param {Object} component - 组件/插件信息
 * @param {string} outputDir - 输出目录（从pullAllResources传递的目录）
 * @param {string} type - 类型：component或plugin
 * @returns {Promise<Object>} 拉取结果
 */
const pullSingleComponent = async (component, outputDir, type = 'component') => {
  try {
    console.log(`正在处理组件: ${component.name} (${component.apiName})`);
    
    // 使用从pullAllResources传递的outputDir作为保存目录
    const componentDir = outputDir;
    
    console.log(`组件保存目录: ${componentDir}`);
    
    // 确保目录存在
    await fs.ensureDir(componentDir);
    
    // 参照extension实现，确定文件模式和目录
    let mode = 'sourceFiles';
    if (Array.isArray(component.fileTree) && component.fileTree.length > 0) {
      mode = 'fileTree';
    }
    
    // 创建sourceFiles子目录，确保文件保存在正确的结构中
    const srcPath = path.join(componentDir, 'sourceFiles');
    await fs.ensureDir(srcPath);
    
    // 下载源文件
    const promiseIterable = [];
    const files = component[mode] || [];
    
    console.log(`找到${files.length}个源文件`);
    for (const file of files) {
      promiseIterable.push(downloadFileToDir(file, srcPath));
    }
    
    // 下载静态资源到static目录
    if (Array.isArray(component.images) && component.images.length > 0) {
      const staticPath = path.join(componentDir, 'static');
      await fs.ensureDir(staticPath);
      
      console.log(`找到${component.images.length}个静态资源`);
      for (const image of component.images) {
        promiseIterable.push(downloadFileToDir(image, staticPath));
      }
    }
    
    // 等待所有文件下载完成
    await Promise.all(promiseIterable);
    
    // 删除默认入口文件（参照extension实现）
    if (type === 'plugin') {
      const entryPath = path.join(srcPath, 'entry.js');
      if (await fs.pathExists(entryPath)) {
        console.log(`删除默认入口文件: ${entryPath}`);
        await fs.unlink(entryPath);
      }
    } else {
      const entryPath = path.join(srcPath, 'entry.vue');
      if (await fs.pathExists(entryPath)) {
        console.log(`删除默认入口文件: ${entryPath}`);
        await fs.unlink(entryPath);
      }
    }
    
    // 如果有metaXml，保存为component.xml或plugin.xml文件
    if (component.mateXml) {
      const xmlPath = path.join(componentDir, `${type === 'component' ? 'component' : 'plugin'}.xml`);
      await fs.writeFile(xmlPath, component.mateXml);
      console.log(`保存${path.basename(xmlPath)}文件`);
    }
    
    // 更新unchangeableJson.json记录
    await updateUnchangeableJson(type, component);
    
    console.log(`✓ 组件 ${component.name} 拉取成功`);
    return {
      success: true,
      message: `成功拉取组件: ${component.name}`,
      path: componentDir
    };
  } catch (error) {
    console.error(`拉取组件失败: ${error.message}`);
    throw error;
  }
};

// 参照extension的downloadFileToDir实现
const downloadFileToDir = async (file, dirPath) => {
  try {
    console.log(`下载文件: ${file.fileName}`);
    
    // 构建请求参数
    const requestData = { nPath: file.filePath };
    
    // 直接从配置管理器获取认证信息
    const certificateData = await configManager.getAuthInfo() || {};
    
    // 调用API下载文件，添加/FHH前缀以匹配extension实现
    // 关键修复：使用正确的EMDH路径
  const response = await api.post('/FHH/EMDHCompBuild/VscodeExtension/downloadFile', requestData, certificateData);    
    // 检查响应
    if (!response || !response.Value || !response.Value.base64String) {
      throw new Error(`无法获取文件 ${file.fileName} 的内容`);
    }
    
    // 处理文件路径
    let filePath;
    if (file.path) {
      // 文件树模式，需要创建子目录
      const fileDir = path.join(dirPath, file.path);
      await fs.ensureDir(fileDir);
      filePath = path.join(fileDir, file.fileName);
    } else {
      // 直接保存到目标目录
      filePath = path.join(dirPath, file.fileName);
    }
    
    // 解码base64内容并保存
    const content = Buffer.from(response.Value.base64String, 'base64');
    await fs.writeFile(filePath, content);
    
    console.log(`文件已保存: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`下载文件失败: ${file.fileName} - ${error.message}`);
    throw error;
  }
};

/**
 * 拉取所有组件
 * @param {string} outputDir - 输出目录
 * @param {string} type - 类型：component或plugin
 * @returns {Promise<Array>} 拉取结果列表
 */
const pullAllComponents = async (outputDir, type = 'component') => {
  try {
    console.log(`正在拉取所有${type === 'component' ? '组件' : '插件'}...`);
    console.log(`组件保存根目录: ${outputDir}`);
    
    // 参照extension实现，使用空apiName参数获取所有组件
    const components = await api.fetchComponents(type, '');
    
    console.log(`获取到${components.length}个${type === 'component' ? '组件' : '插件'}`);
    
    const results = [];
    
    if (!Array.isArray(components) || components.length === 0) {
      console.log(`没有找到${type === 'component' ? '组件' : '插件'}，跳过拉取`);
      return results;
    }
    
      // 直接使用传入的outputDir作为目标基础目录
    // 路径构建逻辑已经在pull.js中处理完成
    const targetBaseDir = outputDir;
    
    await fs.ensureDir(targetBaseDir);
    
    // 参照extension的pullAllCmps函数，逐个拉取组件
    for (const component of components) {
      try {
        // 确保组件有必要的字段
        if (!component.apiName || !component.name) {
          throw new Error(`组件信息不完整: ${JSON.stringify(component)}`);
        }
        
        console.log(`正在拉取: ${component.name} (${component.apiName})`);
        
        // 为每个组件在对应目录下创建单独的目录
        const targetComponentDir = path.join(targetBaseDir, component.name);
        console.log(`组件保存目录: ${targetComponentDir}`);
        
        // 直接使用从API获取的完整组件数据，正确传递outputDir参数
        const result = await pullSingleComponent(component, targetComponentDir, type);
        results.push(result);
      } catch (error) {
        console.error(`拉取${component.name}失败: ${error.message}`);
        results.push({
          success: false,
          name: component.name || '未知组件',
          error: error.message
        });
      }
    }
    
    return results;
  } catch (error) {
    console.error(`拉取所有${type === 'component' ? '组件' : '插件'}失败: ${error.message}`);
    throw error;
  }
};

/**
 * 拉取单个函数
 * @param {Object} functionInfo - 函数信息
 * @param {string} outputDir - 输出目录
 * @returns {Promise<Object>} 拉取结果
 */
const pullSingleFunction = async (functionInfo, outputDir) => {
  try {
    // 不再调用API，直接使用传入的functionInfo中的数据
    // 这样可以避免因API调用失败而无法保存函数文件
    console.log(`正在保存函数代码: ${functionInfo.name}`);
    
    if (!functionInfo.content) {
      throw new Error(`无法获取函数代码内容: ${functionInfo.name}`);
    }

    // 确保输出目录存在（不创建子文件夹）
    await fs.ensureDir(outputDir);

    // 保存函数代码 - 使用apiName去掉__c后缀作为文件名
    // 直接保存到outputDir，不再创建子文件夹，不生成meta.json
    const functionFileName = functionInfo.apiName ? functionInfo.apiName.replace(/__c$/, '') : functionInfo.name;
    const filePath = path.join(outputDir, `${functionFileName}.groovy`);
    await writeFileContent(filePath, functionInfo.content || '');
    
    // 更新unchangeableJson.json记录
    await updateUnchangeableJson('function', functionInfo);
    
    console.log(`函数 ${functionInfo.name} 保存成功到: ${filePath}`);
    return {
      success: true,
      name: functionInfo.name,
      path: filePath
    };

  } catch (error) {
    throw new Error(`拉取函数失败 [${functionInfo.name}]: ${error.message}`);
  }
};

/**
 * 拉取所有函数
 * @param {string} outputDir - 输出目录
 * @returns {Promise<Array>} 拉取结果列表
 */
const pullAllFunctions = async (outputDir) => {
  try {
    // 确保输出目录存在
    await fs.ensureDir(outputDir);
    
    // 获取认证信息
    const certificateData = await configManager.getAuthInfo() || {};
    
    // 获取函数列表 - 使用syncFunction来批量获取函数列表
    console.log('正在获取函数列表...');
    const pageData = {
      pageNumber: 1,
      pageSize: 2000,
      type: 'function' // 使用字符串'function'而不是数字1
    };
    const response = await api.syncFunction(pageData, certificateData);
    
    // 处理响应，只检查StatusCode
    if (response && response.Result && response.Result.StatusCode !== 0) {
      throw new Error(`获取函数列表失败: ${response.Result.FailureMessage || '未知错误'}`);
    }
    
    // 将响应数据写入调试日志文件
    await writeDebugLog(response, 'functions-response');
    
    // 从Value.list或Value.items或直接从Value获取数据，兼容多种格式
    let functions = [];
    if (response && response.Value) {
      if (Array.isArray(response.Value)) {
        functions = response.Value;
      } else if (Array.isArray(response.Value.list)) {
        functions = response.Value.list;
      } else if (Array.isArray(response.Value.items)) {
        functions = response.Value.items;
      }
    }
    console.log(`获取到${functions.length}个函数`);
    
    const results = [];
    
    if (!Array.isArray(functions) || functions.length === 0) {
      console.log('没有找到函数，跳过拉取');
      return results;
    }

    // 逐个拉取函数
    for (const func of functions) {
      try {
        // 确保函数有必要的字段
        if (!func.name) {
          throw new Error(`函数信息不完整: ${JSON.stringify(func)}`);
        }
        
        console.log(`正在拉取: ${func.name}`);
        const result = await pullSingleFunction(func, outputDir);
        results.push(result);
        console.log(`✓ 成功拉取: ${func.name}`);
      } catch (error) {
        console.error(error.message);
        results.push({
          success: false,
          name: func.funcName || '未知函数',
          error: error.message
        });
      }
    }

    return results;
  } catch (error) {
    throw new Error(`拉取所有函数失败: ${error.message}`);
  }
};

/**
 * 根据文件树创建文件
 * @param {Object} fileTree - 文件树对象
 * @param {string} baseDir - 基础目录
 * @returns {Promise<void>}
 */
const createFilesFromTree = async (fileTree, baseDir) => {
  for (const [fileName, content] of Object.entries(fileTree)) {
    const filePath = path.join(baseDir, fileName);
    
    if (typeof content === 'object') {
      // 如果是目录，递归处理
      const dirPath = filePath;
      await fs.ensureDir(dirPath);
      await createFilesFromTree(content, dirPath);
    } else {
      // 如果是文件，写入内容
      await fs.ensureDir(path.dirname(filePath));
      await writeFileContent(filePath, content);
    }
  }
};

/**
 * 根据名称拉取指定的组件/插件/函数
 * @param {string} name - 名称
 * @param {string} outputDir - 输出目录
 * @param {string} type - 类型
 * @returns {Promise<Object>} 拉取结果
 */
const pullByName = async (name, outputDir, type) => {
  try {
    if (type === 'component' || type === 'plugin') {
      // 参照extension实现，使用downloadCode接口获取组件/插件详细信息
      console.log(`===== 开始拉取${type === 'component' ? '组件' : '插件'} [${name}] =====`);
      
      try {
        // 获取认证信息
        console.log('正在获取认证信息...');
        const certificateData = await configManager.getAuthInfo();
        
        if (!certificateData || !certificateData.domain || !certificateData.certificate) {
          throw new Error('认证信息不完整，请检查配置');
        }
        
        // 构建请求参数，与extension保持一致
        // 参照extension实现，组件和插件的API名称需要添加__c后缀
        const apiName = name.endsWith('__c') ? name : `${name}__c`;
        const requestParams = {
          type: type,
          apiName: apiName
        };
        
        console.log('构建请求参数:', JSON.stringify(requestParams));
        
        // 调用downloadCode接口获取组件/插件数据
        // 注意：不要在URL前添加/FHH前缀，因为post函数内部会自动添加
        console.log(`正在调用API获取${type === 'component' ? '组件' : '插件'}数据...`);
        const response = await api.post('/EMDHCompBuild/VscodeExtension/downloadCode', requestParams, certificateData);
        
        // 保存调试日志
        await writeDebugLog(response, `${type}-response-${Date.now()}.json`);
        
        // 处理响应结果
        console.log('收到API响应，开始解析...');
        if (!response) {
          throw new Error('API返回空响应');
        }
        
        if (response.Result && response.Result.StatusCode !== 0) {
          throw new Error(`API调用失败: ${response.Result.FailureMessage || '未知错误'}`);
        }
        
        if (!response.Value) {
          throw new Error('API响应缺少Value字段');
        }
        
        if (!response.Value.components || !Array.isArray(response.Value.components)) {
          throw new Error('API响应缺少有效的components数组');
        }
        
        if (response.Value.components.length === 0) {
          throw new Error(`未找到${type} [${name}]`);
        }
        
        // 获取组件/插件数据
        const componentData = response.Value.components[0];
        console.log(`找到匹配项: ${componentData.name || '未知名称'}`);
        
        // 确保组件/插件数据格式正确，添加必要的字段
        console.log('检查组件/插件数据格式...');
        // 检查是否有fileTree、files或sourceFiles字段
        if (!componentData.fileTree && !componentData.files && !componentData.sourceFiles) {
          throw new Error('组件/插件数据格式错误，缺少文件树信息(fileTree/files/sourceFiles)');
        }
        
        // 如果没有fileTree字段，尝试使用files字段
        if (!componentData.fileTree && componentData.files) {
          console.log('使用files字段替代fileTree...');
          componentData.fileTree = componentData.files;
        }
        
        // 如果没有fileTree字段，尝试使用sourceFiles字段
        if (!componentData.fileTree && componentData.sourceFiles) {
          console.log('使用sourceFiles字段替代fileTree...');
          componentData.fileTree = componentData.sourceFiles;
        }
        
        console.log(`成功获取${type === 'component' ? '组件' : '插件'}数据，开始保存...`);
        
        // 为插件使用其真实的name属性创建保存目录
        const finalOutputDir = path.join(outputDir, componentData.name);
        // 调用pullSingleComponent函数保存组件/插件
        const result = await pullSingleComponent(componentData, finalOutputDir, type);
        // 返回修改后的结果，包含正确的name
        console.log(`===== ${type === 'component' ? '组件' : '插件'} [${name}] 拉取成功 =====`);
        return { ...result, name: componentData.name };
      } catch (error) {
        console.error(`拉取${type === 'component' ? '组件' : '插件'}失败:`, error.message);
        throw new Error(`拉取${type === 'component' ? '组件' : '插件'} [${name}] 失败: ${error.message}`);
      }
    } else if (type === 'function' || type === 'class') {
      // 获取认证信息
      const certificateData = await configManager.getAuthInfo() || {};
      
      // 参照extension实现，使用api.js中已存在的syncFunction函数
      // 构建请求参数，适配现有的syncFunction实现
      // 不添加__c后缀作为过滤条件，先获取所有项然后在本地过滤
      // 这样可以避免因apiName格式不匹配导致找不到实际存在的函数/类
      const data = {
        bindingObjectApiName: 'NONE', // 适配现有实现的默认值
        pageNumber: 1,
        pageSize: 1000, // 增大分页大小，确保能获取到足够多的结果
        type: type // 使用字符串'function'或'class'
      };
      
      console.log(`正在获取${type === 'function' ? '函数' : '类'} [${name}] 的详细信息...`);
      console.log('调用参数:', JSON.stringify(data));
      
      // 调用现有的syncFunction函数
      const response = await api.syncFunction(data, certificateData);
      
      // 处理响应结果
      if (response && response.Result && response.Result.StatusCode !== 0) {
        throw new Error(`获取${type === 'function' ? '函数' : '类'}失败: ${response.Result.FailureMessage || '未知错误'}`);
      }
      
      // 从Value.list获取数据
      let items = [];
      if (response && response.Value && Array.isArray(response.Value.list)) {
        items = response.Value.list;
        console.log(`成功获取到${items.length}条数据`);
      }
      
      if (items.length === 0) {
        throw new Error(`未找到${type === 'function' ? '函数' : '类'} [${name}]`);
      }
      
      // 查找精确匹配的项（根据apiName或name或名称的一部分）
      const exactMatch = items.find(item => {
        // 尝试多种匹配方式
        const matchByApiName = item.apiName && (item.apiName === name || item.apiName === name + '__c' || item.apiName.replace(/__c$/, '') === name);
        const matchByFuncName = item.funcName && (item.funcName === name || item.funcName.includes(name));
        const matchByName = item.name && (item.name === name || item.name.includes(name));
        return matchByApiName || matchByFuncName || matchByName;
      });
      
      // 如果找到精确匹配，使用它；否则使用第一项
      const targetItem = exactMatch || items[0];
      console.log(`找到匹配项: ${targetItem.apiName || targetItem.funcName || targetItem.name}`);
      
      console.log(`成功获取${type === 'function' ? '函数' : '类'}数据，准备保存...`);
      
      // 调用相应的保存函数
      return type === 'function' 
        ? await pullSingleFunction(targetItem, outputDir)
        : await pullSingleClass(targetItem, outputDir);
    } else {
      throw new Error(`不支持的类型: ${type}`);
    }
  } catch (error) {
    console.error(`拉取${type}失败:`, error.message);
    throw error;
  }
};

/**
 * 拉取单个类
 * @param {Object} classInfo - 类信息
 * @param {string} outputDir - 输出目录
 * @returns {Promise<Object>} 拉取结果
 */
const pullSingleClass = async (classInfo, outputDir) => {
  try {
    // 获取认证信息
    const certificateData = await configManager.getAuthInfo() || {};
    
    // 不再调用API，直接使用传入的classInfo中的数据
    // 这样可以避免因API调用失败而无法保存类文件
    console.log(`正在保存类代码: ${classInfo.name}`);
    
    if (!classInfo.content) {
      throw new Error(`无法获取类代码内容: ${classInfo.name}`);
    }

    // 确保输出目录存在（不创建子文件夹）
    await fs.ensureDir(outputDir);

    // 保存类代码 - 使用apiName去掉__c后缀作为文件名
    // 直接保存到outputDir，不再创建子文件夹，不生成meta.json
    const classFileName = classInfo.apiName ? classInfo.apiName.replace(/__c$/, '') : classInfo.name;
    const filePath = path.join(outputDir, `${classFileName}.groovy`);
    await writeFileContent(filePath, classInfo.content || '');
    
    // 更新unchangeableJson.json记录
    await updateUnchangeableJson('class', classInfo);
    
    console.log(`类 ${classInfo.name} 保存成功到: ${filePath}`);
    return {
      success: true,
      name: classInfo.name,
      path: filePath
    };
  } catch (error) {
    throw new Error(`拉取类失败 [${classInfo.name}]: ${error.message}`);
  }
};

/**
 * 拉取所有类
 * @param {string} outputDir - 输出目录
 * @returns {Promise<Array>} 拉取结果列表
 */
const pullAllClasses = async (outputDir) => {
  try {
    // 确保输出目录存在
    await fs.ensureDir(outputDir);
    
    // 获取认证信息
    const certificateData = await configManager.getAuthInfo() || {};
    
    // 获取类列表 - 使用syncFunction来批量获取类列表
    console.log('正在获取类列表...');
    const pageData = {
      pageNumber: 1,
      pageSize: 2000,
      type: 'class' // 使用字符串'class'而不是数字2
    };
    const response = await api.syncFunction(pageData, certificateData);
    
    // 处理响应，只检查StatusCode
    if (response && response.Result && response.Result.StatusCode !== 0) {
      throw new Error(`获取类列表失败: ${response.Result.FailureMessage || '未知错误'}`);
    }
    
    // 将响应数据写入调试日志文件
    await writeDebugLog(response, 'classes-response');
    
    // 从Value.list或Value.items或直接从Value获取数据，兼容多种格式
    let classes = [];
    if (response && response.Value) {
      if (Array.isArray(response.Value)) {
        classes = response.Value;
      } else if (Array.isArray(response.Value.list)) {
        classes = response.Value.list;
      } else if (Array.isArray(response.Value.items)) {
        classes = response.Value.items;
      }
    }
    console.log(`获取到${classes.length}个类`);
    
    const results = [];
    
    if (!Array.isArray(classes) || classes.length === 0) {
      console.log('没有找到类，跳过拉取');
      return results;
    }

    // 逐个拉取类
    for (const cls of classes) {
      try {
        // 确保类有必要的字段
        if (!cls.name) {
          throw new Error(`类信息不完整: ${JSON.stringify(cls)}`);
        }
        
        console.log(`正在拉取: ${cls.name}`);
        const result = await pullSingleClass(cls, outputDir);
        results.push(result);
        console.log(`✓ 成功拉取: ${cls.name}`);
      } catch (error) {
        console.error(error.message);
        results.push({
          success: false,
          name: cls.funcName || '未知类',
          error: error.message
        });
      }
    }

    return results;
  } catch (error) {
    throw new Error(`拉取所有类失败: ${error.message}`);
  }
};

/**
 * 拉取所有类型的资源（components、plugins、functions、classes）
 * @param {string} outputDir - 输出目录
 * @returns {Promise<Object>} 包含所有类型拉取结果的对象
 */
const pullAllResources = async (outputDir) => {
  const results = {};
  
  // 创建目录结构 - main目录应该放在fx-app目录下，与vscode extension保持一致
  const projectRoot = process.cwd();
  const fxAppDir = path.join(projectRoot, 'fx-app');
  const pwcDir = path.join(fxAppDir, 'main', 'PWC');
  const aplDir = path.join(fxAppDir, 'main', 'APL');
  
  console.log(`项目根目录: ${projectRoot}`);
  console.log(`fx-app目录: ${fxAppDir}`);
  
  // 拉取组件
  try {
    console.log('开始拉取所有组件...');
    console.log(`组件保存目录: ${path.join(pwcDir, 'components')}`);
    results.components = await pullAllComponents(path.join(pwcDir, 'components'), 'component');
  } catch (error) {
    console.error(`组件拉取失败: ${error.message}`);
    results.components = [];
  }
  
  // 拉取插件
  try {
    console.log('开始拉取所有插件...');
    console.log(`插件保存目录: ${path.join(pwcDir, 'plugins')}`);
    results.plugins = await pullAllComponents(path.join(pwcDir, 'plugins'), 'plugin');
  } catch (error) {
    console.error(`插件拉取失败: ${error.message}`);
    results.plugins = [];
  }
  
  // 拉取函数
  try {
    console.log('开始拉取所有函数...');
    console.log(`函数保存目录: ${path.join(aplDir, 'functions')}`);
    results.functions = await pullAllFunctions(path.join(aplDir, 'functions'));
  } catch (error) {
    console.error(`函数拉取失败: ${error.message}`);
    results.functions = [];
  }
  
  // 拉取类
  try {
    console.log('开始拉取所有类...');
    console.log(`类保存目录: ${path.join(aplDir, 'classes')}`);
    results.classes = await pullAllClasses(path.join(aplDir, 'classes'));
  } catch (error) {
    console.error(`类拉取失败: ${error.message}`);
    results.classes = [];
  }
  
  return results;
};

module.exports = {
  pullSingleComponent,
  pullAllComponents,
  pullSingleFunction,
  pullAllFunctions,
  pullSingleClass,
  pullAllClasses,
  pullAllResources,
  pullByName
};