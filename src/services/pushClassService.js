/**
 * 推送类服务
 * 负责将类代码推送到远程服务
 */

const fs = require('fs-extra');
const path = require('path');
const { readFileContent } = require('../utils/fileUtils');
const api = require('./api');
const { getConfigManager } = require('../core/ConfigManager');
const configManager = getConfigManager();
// 导入logger实例
const { logger } = require('../core/Logger');

// 定义post函数，与pushService保持一致
const post = api.post;

/**
 * 推送类代码
 * @param {string} classPath - 类目录路径
 * @param {string} singleFilePath - 单个文件路径（可选，用于推送单个文件）
 * @returns {Promise<Object>} 推送结果
 */
const pushClass = async (classPath, singleFilePath = null) => {
  try {
    // 添加调试日志
    logger.info('开始处理类文件...');
    logger.debug('classPath:', classPath);
    logger.debug('singleFilePath:', singleFilePath);
    
    // 处理单个文件或整个目录
    let filesToPush = [];
    
    if (singleFilePath) {
      // 推送单个文件
      if (!await fs.pathExists(singleFilePath)) {
        throw new Error(`文件不存在: ${singleFilePath}`);
      }
      filesToPush.push(singleFilePath);
    } else {
      // 推送整个目录，遍历所有.groovy和.java文件
      if (!await fs.pathExists(classPath)) {
        throw new Error(`目录不存在: ${classPath}`);
      }
      
      // 递归读取目录
      const readDir = async (dirPath) => {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stats = await fs.stat(filePath);
          if (stats.isDirectory()) {
            await readDir(filePath);
          } else if (file.endsWith('.groovy') || file.endsWith('.java')) {
            filesToPush.push(filePath);
          }
        }
      };
      
      await readDir(classPath);
      
      if (filesToPush.length === 0) {
        throw new Error(`在目录 ${classPath} 中找不到任何 .groovy 或 .java 文件`);
      }
    }
    
    logger.info(`找到 ${filesToPush.length} 个类文件需要推送`);
    
    // 逐个推送文件
    const results = [];
    for (const filePath of filesToPush) {
      const className = path.basename(filePath, path.extname(filePath));
      
      // 1. 准备数据 - 与extension的pushClass.js完全一致的格式
      const classNameWithC = `${className}__c`;
      
      // 读取代码内容
      let codeContent = await readFileContent(filePath);
      
      // 关键修复：与extension的updateClassGroovy函数保持一致，将#demo#占位符替换为正确的类名
      const actualClassName = classNameWithC.includes('__c') ? classNameWithC.match(/(\S*)__c/)[1] : classNameWithC;
      if (codeContent.includes('#demo#')) {
        codeContent = codeContent.replace(/#demo#/g, actualClassName);
        logger.info(`已将类名占位符#demo#替换为${actualClassName}`);
      }
      
      // 2. 获取类信息 - 从unchangeableJson.json获取详细信息，与extension保持一致
      const fileType = 'classes'; // 复数形式，与extension完全一致
      let funcJson = {};
      
      try {
        // 从项目根目录的unchangeableJson.json获取类信息，与extension保持一致
        const projectRoot = configManager.getSync('project.rootDir') || process.cwd();
        const unchangeableJsonPath = path.join(projectRoot, 'unchangeableJson.json');
        if (await fs.pathExists(unchangeableJsonPath)) {
          const unchangeableJsonContent = await readFileContent(unchangeableJsonPath);
          const unchangeableJson = JSON.parse(unchangeableJsonContent);
          
          // 使用正确的键名格式：class:ClassName (单数形式)，与unchangeableJson.json中的实际格式一致
          const cleanClassName = classNameWithC.includes('__c') ? classNameWithC.match(/(\S*)__c/)[1] : classNameWithC;
          funcJson = unchangeableJson[`class:${cleanClassName}`] || {};
          logger.info(`从unchangeableJson.json获取类信息 [${className}]: ${JSON.stringify(funcJson, null, 2)}`);
        }
      } catch (error) {
        logger.warn(`读取unchangeableJson.json失败 [${className}]: ${error.message}，将使用默认值`);
      }
      
      // 与extension保持一致：确保funcJson始终包含必要的默认值
      funcJson = Object.assign({
        apiName: classNameWithC,
        // 使用与pushFunction相同的bindingObjectApiName
        bindingObjectApiName: 'FHH_EMDHFUNC_CustomFunction__c',
        name: classNameWithC.replace('__c', ''), // 与extension一致：name字段为去掉__c的类名
        type: 0, // 使用与pushFunction相同的type值
        nameSpace: '',
        returnType: '',
        description: '',
        lang: 0, // 0表示groovy，与extension一致：数字类型
        updateTime: 0
      }, funcJson);
      
      // 确保type正确：对于类，type应该是字符串"class"
      if (funcJson.type === 0) {
        funcJson.type = "class";
      } else if (typeof funcJson.type === 'number') {
        if (funcJson.type === 2) {
          funcJson.type = "class";
        }
      }
      
      // 3. 与extension完全一致：提取字段
      const { apiName, bindingObjectApiName, type, nameSpace, returnType, description, lang } = funcJson;
      
      // 4. 与extension完全一致：获取xml内容
      const metaXmlPath = `${filePath.replace(path.extname(filePath), '')}.xml`;
      let metaXml = '';
      if (await fs.pathExists(metaXmlPath)) {
        metaXml = await readFileContent(metaXmlPath);
      }
      
      logger.info(`准备推送类: ${className}`);
      logger.info(`类配置信息: ${JSON.stringify(funcJson, null, 2)}`);
      const metaXmlExists = await fs.pathExists(metaXmlPath);
      logger.info(`Meta XML路径: ${metaXmlPath}, 存在: ${metaXmlExists}`);
      
      // 5. 构建数据对象 - 与extension的pushClass.js完全一致的格式
      const commit = process.env.FX_COMMIT || 'fx-cli upload';
      const data = {
        type,
        lang: Number(lang),
        commit,
        apiName,
        nameSpace,
        description,
        name: className,
        bindingObjectApiName,
        metaXml,
        content: codeContent,
        updateTime: funcJson.updateTime || 0
      };
      
      logger.info(`准备上传的数据 [${className}]: ${JSON.stringify(data, null, 2)}`);
      
      // 6. 与extension完全一致：调用API获取函数信息
      logger.info(`调用API获取函数信息 [${className}]: ${apiName}, ${bindingObjectApiName}`);
      // 使用与extension完全一致的API端点：EMDHFUNC
      let functionInfoResponse;
      
      try {
        functionInfoResponse = await api.post('/FHH/EMDHFUNC/biz/find', {
          api_name: apiName,
          binding_object_api_name: bindingObjectApiName
        });
        
        logger.info(`获取函数信息响应 [${className}]: ${JSON.stringify(functionInfoResponse, null, 2)}`);
        
        // 8. 处理API响应错误
        if (functionInfoResponse.Result && functionInfoResponse.Result.StatusCode) {
          // API调用返回错误码
          logger.warning(`查询类信息失败 [${className}]: ${functionInfoResponse.Result.FailureMessage}`);
          // 如果错误信息表明是"未查询到该自定义函数"，则视为需要创建新类
          if (functionInfoResponse.Result.FailureMessage && 
              (functionInfoResponse.Result.FailureMessage.includes('未查询到该自定义函数') || 
               functionInfoResponse.Result.FailureMessage.includes('未查询到该自定义类'))) {
            logger.info(`类 ${apiName} 不存在，将创建新类`);
            // 设置空响应以继续创建流程
            functionInfoResponse = null;
          } else {
            logger.error(`获取类信息失败 [${className}]: ${functionInfoResponse.Result.FailureMessage}`);
            results.push({ success: false, message: `获取类信息失败 [${className}]: ${functionInfoResponse.Result.FailureMessage}`, name: className });
            continue;
          }
        } else if (functionInfoResponse.Value) {
          // 成功查询到类信息
          logger.info(`成功查询到类信息 [${className}]`);
        } else {
          // 未查询到类信息
          logger.info(`类 ${apiName} 不存在，将创建新类`);
          functionInfoResponse = null;
        }
      } catch (err) {
        // 特殊处理：如果错误信息包含"未查询到该自定义函数"或"未查询到该自定义类"，视为类不存在并继续执行创建流程
        if (err.message && (err.message.includes('未查询到该自定义函数') || err.message.includes('未查询到该自定义类'))) {
          logger.info(`类 ${apiName} 不存在，将创建新类`);
          // 设置空响应以继续创建流程
          functionInfoResponse = null;
        } else {
          // 其他错误情况
          logger.error(`获取类信息失败 [${className}]: ${err.message || '未知错误'}`);
          results.push({ success: false, message: `获取类信息失败 [${className}]: ${err.message || '未知错误'}`, name: className });
          continue;
        }
      }
      
      // 8. 根据查询结果决定是更新还是创建
      if (!functionInfoResponse || !functionInfoResponse.Value) {
        // 类不存在，调用pushNewClass创建新类
        logger.info(`类 ${className} 不存在，调用pushNewClass创建新类`);
        const result = await pushNewClass(filePath);
        results.push(result);
        continue;
      }
      
      // 9. 与extension完全一致：获取默认函数对象或初始化
      let defaultValue;
      if (functionInfoResponse && functionInfoResponse.Value) {
        defaultValue = functionInfoResponse.Value?.function;
      }
      
      const defaultFunction = defaultValue || {
        api_name: apiName,
        application: '',
        binding_object_api_name: bindingObjectApiName,
        body: codeContent,
        commit_log: '',
        data_source: '',
        function_name: className,
        is_active: false,
        lang: Number(lang),
        name_space: nameSpace,
        parameters: [],
        remark: description,
        return_type: returnType,
        status: 'not_used',
        type: "class", // 类的类型应该是字符串"class"，而不是数字或字符串"2"
        version: 1
      };
      
      logger.info(`默认函数对象 [${className}]: ${JSON.stringify(defaultFunction, null, 2)}`);
      
      // 9. 与extension完全一致：构建分析数据
      const analyzeData = Object.assign(defaultFunction, {
        body: codeContent
      });
      
      // 10. 与extension完全一致：调用API进行函数分析
      logger.info(`调用API进行函数分析 [${className}]`);
      const analyzeResponse = await api.post('/FHH/EMDHFUNC/runtime/analyze', { function: analyzeData });
      
      logger.info(`函数分析响应 [${className}]: ${JSON.stringify(analyzeResponse, null, 2)}`);
      
      // 11. 处理API响应错误
      if (analyzeResponse.Result && analyzeResponse.Result.FailureMessage) {
        logger.error(`函数分析失败 [${className}]: ${analyzeResponse.Result.FailureMessage}`);
        results.push({ success: false, message: `函数分析失败 [${className}]: ${analyzeResponse.Result.FailureMessage}`, name: className });
        continue;
      }
      
      // 12. 与extension完全一致：处理分析结果
      const { violations = [], success = true } = analyzeResponse.Value || {};
      const seriousError = violations.find((item) => item.priority >= 9);
      
      if (success === false && seriousError) {
        // 有严重错误，需要确认是否继续
        logger.error(`函数分析发现严重错误 [${className}]: ${seriousError?.message || '未知错误'}`);
        results.push({ success: false, message: `函数分析发现严重错误 [${className}]: ${seriousError?.message || '未知错误'}`, name: className });
        continue;
      } else if (success === false) {
        // 有警告但不阻止上传
        logger.warn(`函数分析发现警告 [${className}]，请检查代码质量`);
      }
      
      // 13. 与extension完全一致：调用API进行编译检查
      logger.info(`调用API进行编译检查 [${className}]`);
      const compileResponse = await api.post('/FHH/EMDHFUNC/runtime/compileCheck', { function: analyzeData });
      
      logger.info(`编译检查响应 [${className}]: ${JSON.stringify(compileResponse, null, 2)}`);
      
      // 14. 处理API响应错误
      if (compileResponse.Result?.FailureMessage) {
        logger.error(`编译检查失败 [${className}]: ${compileResponse.Result.FailureMessage}`);
        results.push({ success: false, message: `编译检查失败 [${className}]: ${compileResponse.Result.FailureMessage}`, name: className });
        continue;
      }
      
      // 15. 与extension完全一致：保留commit字段值（与pushFunction保持一致）
      
      // 16. 使用正确的API端点：EMDHFUNC
      logger.info(`调用API上传类代码 [${className}]，URL: /FHH/EMDHFUNC/biz/upload`);
      logger.debug(`上传数据 [${className}]: ${JSON.stringify(data, null, 2)}`);
      let uploadResponse;
      
      try {
        logger.info(`开始发送POST请求到: /FHH/EMDHFUNC/biz/upload`);
        uploadResponse = await api.post('/FHH/EMDHFUNC/biz/upload', data);
        logger.info(`成功收到API响应 [${className}]`);
        logger.debug(`上传类完整响应 [${className}]: ${JSON.stringify(uploadResponse, null, 2)}`);
        
        // 处理API响应错误 - 与extension保持一致的逻辑
        if (uploadResponse.Result) {
          logger.info(`API Result StatusCode: ${uploadResponse.Result.StatusCode}`);
          logger.info(`API Result FailureMessage: ${uploadResponse.Result.FailureMessage}`);
          
          if (uploadResponse.Result.StatusCode !== 0) {
            // 只有当StatusCode不为0时才视为错误
            logger.error(`上传类失败 [${className}]: ${uploadResponse.Result.FailureMessage || '未知错误'}`);
            results.push({ success: false, message: `上传类失败 [${className}]: ${uploadResponse.Result.FailureMessage || '未知错误'}`, name: className });
            continue;
          }
        }
        
        if (uploadResponse?.Error?.Message) {
          // 当StatusCode为0但有Error时，通常是系统级提示，不应阻止操作
          logger.warning(`上传类系统提示 [${className}]: ${uploadResponse?.Error?.Message}`);
        }
        
        // 检查Value字段
        if (uploadResponse.Value) {
          logger.info(`上传成功，返回值: ${JSON.stringify(uploadResponse.Value, null, 2)}`);
        }
      } catch (err) {
        logger.error(`API调用异常 [${className}]: ${err.message}`);
        logger.debug(`异常堆栈: ${err.stack}`);
        
        // 不应该将API错误视为创建成功，而是直接报错
        logger.error(`上传类失败 [${className}]: ${err.message || '未知错误'}`);
        results.push({ success: false, message: `上传类失败 [${className}]: ${err.message || '未知错误'}`, name: className });
        continue;
      }
      
      logger.info(`类 ${className} 推送成功!`);
      
      // 更新本地的unchangeableJson.json文件
      try {
        const projectRoot = configManager.getSync('project.rootDir') || process.cwd();
        const unchangeableJsonPath = path.join(projectRoot, 'unchangeableJson.json');
        
        if (await fs.pathExists(unchangeableJsonPath)) {
          // 读取当前的unchangeableJson文件
          const unchangeableJsonContent = await readFileContent(unchangeableJsonPath);
          const unchangeableJson = JSON.parse(unchangeableJsonContent);
          
          // 构建类的键名
          const cleanClassName = classNameWithC.includes('__c') ? classNameWithC.match(/(\S*)__c/)[1] : classNameWithC;
          const classKey = `class:${cleanClassName}`;
          
          // 获取最新的updateTime（如果API返回了的话）
          const latestUpdateTime = uploadResponse?.Value?.updateTime || Date.now();
          
          // 更新或创建类记录
          if (unchangeableJson[classKey]) {
            // 更新现有的类记录
            unchangeableJson[classKey].updateTime = latestUpdateTime;
            logger.info(`更新unchangeableJson.json中的类 ${cleanClassName} 的updateTime为 ${latestUpdateTime}`);
          } else {
            // 创建新的类记录
            unchangeableJson[classKey] = {
              apiName: apiName,
              bindingObjectApiName: bindingObjectApiName,
              type: "class",
              nameSpace: nameSpace,
              updateTime: latestUpdateTime,
              content: codeContent // 保存最新的代码内容
            };
            logger.info(`在unchangeableJson.json中创建新的类记录 ${cleanClassName}`);
          }
          
          // 保存更新后的unchangeableJson文件
          await fs.writeFile(unchangeableJsonPath, JSON.stringify(unchangeableJson, null, 2));
          logger.info(`成功更新unchangeableJson.json文件`);
        } else {
          logger.info(`unchangeableJson.json文件不存在，跳过更新`);
        }
      } catch (updateError) {
        logger.warning(`更新unchangeableJson.json失败: ${updateError.message}`);
        // 不影响主流程，继续执行
      }
      
      // 确保在uploadResponse为undefined时也能正确处理
      results.push({ 
        success: true, 
        message: `类 ${className} 推送成功`, 
        name: className, 
        id: (uploadResponse && uploadResponse.Value?.id) || apiName 
      });
    }
    
    // 汇总结果
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const failedClasses = results.filter(r => !r.success).map(r => r.name);
    
    if (failureCount === 0) {
      return { success: true, message: `所有 ${successCount} 个类推送成功`, results };
    } else if (successCount === 0) {
      return { success: false, message: `所有 ${failureCount} 个类推送失败：${failedClasses.join(', ')}`, results };
    } else {
      return { success: false, message: `${successCount} 个类推送成功, ${failureCount} 个类推送失败：${failedClasses.join(', ')}`, results };
    }
    
  } catch (error) {
    logger.error(`推送类失败: ${error.message}`);
    logger.debug(`推送类详细错误: ${error.stack}`);
    logger.debug(`错误对象类型: ${typeof error}`);
    logger.debug(`错误对象: ${JSON.stringify(error, null, 2)}`);
    return { success: false, message: `推送类失败: ${error.message}` };
  }
};

/**
 * 推送新类代码（在服务端不存在的类）
 * 此方法用于推送在服务端不存在的类，跳过检查类是否存在的步骤
 * @param {string} filePath - 类文件路径
 * @returns {Promise<Object>} 推送结果
 */
const pushNewClass = async (filePath) => {
  try {
    // 检查文件是否存在
    if (!await fs.pathExists(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    
    const className = path.basename(filePath, path.extname(filePath));
    logger.info(`开始推送新类: ${className}`);
    
    // 1. 准备数据 - 与extension的pushClass.js完全一致的格式
    const classNameWithC = `${className}__c`;
    
    // 读取代码内容
    let codeContent = await readFileContent(filePath);
    
    // 关键修复：与extension的updateClassGroovy函数保持一致，将#demo#占位符替换为正确的类名
    const actualClassName = classNameWithC.includes('__c') ? classNameWithC.match(/(\S*)__c/)[1] : classNameWithC;
    if (codeContent.includes('#demo#')) {
      codeContent = codeContent.replace(/#demo#/g, actualClassName);
      logger.info(`已将类名占位符#demo#替换为${actualClassName}`);
    }
    
    // 2. 从unchangeableJson.json获取类配置信息
    let funcJson = {};
    try {
      const projectRoot = configManager.getSync('project.rootDir') || process.cwd();
      const unchangeableJsonPath = path.join(projectRoot, 'unchangeableJson.json');
      
      if (await fs.pathExists(unchangeableJsonPath)) {
        const unchangeableJsonContent = await readFileContent(unchangeableJsonPath);
        const unchangeableJson = JSON.parse(unchangeableJsonContent);
        
        // 构建类的键名
        const classKey = `class:${className}`;
        
        if (unchangeableJson[classKey]) {
          funcJson = unchangeableJson[classKey];
          logger.info(`从unchangeableJson.json获取到类配置: ${JSON.stringify(funcJson, null, 2)}`);
        }
      }
    } catch (error) {
      logger.warning(`读取unchangeableJson.json失败: ${error.message}`);
    }
    
    // 3. 准备新类的配置，优先使用从unchangeableJson.json读取的配置，否则使用默认值
    const apiName = classNameWithC;
    const bindingObjectApiName = funcJson.bindingObjectApiName || 'FHH_EMDHFUNC_CustomFunction__c';
    const type = 'class';
    const nameSpace = funcJson.nameSpace || '';
    const returnType = funcJson.returnType || '';
    const description = funcJson.description || '';
    const lang = funcJson.lang || 0; // 0表示groovy
    
    // 4. 获取xml内容
    const metaXmlPath = `${filePath.replace(path.extname(filePath), '')}.xml`;
    let metaXml = '';
    if (await fs.pathExists(metaXmlPath)) {
      metaXml = await readFileContent(metaXmlPath);
    }
    
    // 5. 构建数据对象
    const commit = process.env.FX_COMMIT || 'fx-cli upload';
    const data = {
      type,
      lang: Number(lang),
      commit,
      apiName,
      nameSpace,
      description,
      name: className,
      bindingObjectApiName,
      metaXml,
      content: codeContent,
      updateTime: 0 // 新类的updateTime为0
    };
    
    logger.info(`准备上传新类的数据: ${JSON.stringify(data, null, 2)}`);
    
    // 6. 构建分析数据 - 模拟默认函数对象
    const defaultFunction = {
      api_name: apiName,
      application: '',
      binding_object_api_name: bindingObjectApiName,
      body: codeContent,
      commit_log: '',
      data_source: '',
      function_name: className,
      is_active: false,
      lang: Number(lang),
      name_space: nameSpace,
      parameters: [],
      remark: description,
      return_type: returnType,
      status: 'not_used',
      type: 'class',
      version: 1
    };
    
    // 7. 调用API进行函数分析
    logger.info(`调用API进行函数分析 [${className}]`);
    const analyzeResponse = await api.post('/FHH/EMDHFUNC/runtime/analyze', { function: defaultFunction });
    
    logger.info(`函数分析响应 [${className}]: ${JSON.stringify(analyzeResponse, null, 2)}`);
    
    // 7. 处理API响应错误
    if (analyzeResponse.Result && analyzeResponse.Result.FailureMessage) {
      logger.error(`函数分析失败 [${className}]: ${analyzeResponse.Result.FailureMessage}`);
      return { success: false, message: `函数分析失败 [${className}]: ${analyzeResponse.Result.FailureMessage}`, name: className };
    }
    
    // 9. 与extension完全一致：处理分析结果
    const { violations = [], success = true } = analyzeResponse.Value || {};
    const seriousError = violations.find((item) => item.priority >= 9);
    
    if (success === false && seriousError) {
      // 有严重错误，需要确认是否继续
      logger.error(`函数分析发现严重错误 [${className}]: ${seriousError?.message || '未知错误'}`);
      return { success: false, message: `函数分析发现严重错误 [${className}]: ${seriousError?.message || '未知错误'}`, name: className };
    } else if (success === false) {
      // 有警告但不阻止上传
      logger.warn(`函数分析发现警告 [${className}]，请检查代码质量`);
    }
    
    // 10. 调用API进行编译检查
    logger.info(`调用API进行编译检查 [${className}]`);
    const compileResponse = await api.post('/FHH/EMDHFUNC/runtime/compileCheck', { function: defaultFunction });
    
    logger.info(`编译检查响应 [${className}]: ${JSON.stringify(compileResponse, null, 2)}`);
    
    // 11. 处理API响应错误
    if (compileResponse.Result?.FailureMessage) {
      logger.error(`编译检查失败 [${className}]: ${compileResponse.Result.FailureMessage}`);
      return { success: false, message: `编译检查失败 [${className}]: ${compileResponse.Result.FailureMessage}`, name: className };
    }
    
    // 12. 调用API上传类代码
    logger.info(`调用API上传新类代码 [${className}]，URL: /FHH/EMDHFUNC/biz/upload`);
    let uploadResponse;
    
    try {
      logger.info(`开始发送POST请求到: /FHH/EMDHFUNC/biz/upload`);
      uploadResponse = await api.post('/FHH/EMDHFUNC/biz/upload', data);
      logger.info(`成功收到API响应 [${className}]`);
      logger.debug(`上传类完整响应 [${className}]: ${JSON.stringify(uploadResponse, null, 2)}`);
      
      // 处理API响应错误
      if (uploadResponse.Result && uploadResponse.Result.StatusCode !== 0) {
        logger.error(`上传类失败 [${className}]: ${uploadResponse.Result.FailureMessage || '未知错误'}`);
        return { success: false, message: `上传类失败 [${className}]: ${uploadResponse.Result.FailureMessage || '未知错误'}`, name: className };
      }
      
      if (uploadResponse?.Error?.Message) {
        // 当StatusCode为0但有Error时，通常是系统级提示，不应阻止操作
        logger.warning(`上传类系统提示 [${className}]: ${uploadResponse?.Error?.Message}`);
      }
    } catch (err) {
      logger.error(`API调用异常 [${className}]: ${err.message}`);
      logger.debug(`异常堆栈: ${err.stack}`);
      return { success: false, message: `上传类失败 [${className}]: ${err.message || '未知错误'}`, name: className };
    }
    
    logger.info(`新类 ${className} 推送成功!`);
    
    // 更新本地的unchangeableJson.json文件
    try {
      const projectRoot = configManager.getSync('project.rootDir') || process.cwd();
      const unchangeableJsonPath = path.join(projectRoot, 'unchangeableJson.json');
      
      if (await fs.pathExists(unchangeableJsonPath)) {
        // 读取当前的unchangeableJson文件
        const unchangeableJsonContent = await readFileContent(unchangeableJsonPath);
        const unchangeableJson = JSON.parse(unchangeableJsonContent);
        
        // 构建类的键名
        const cleanClassName = classNameWithC.includes('__c') ? classNameWithC.match(/(\S*)__c/)[1] : classNameWithC;
        const classKey = `class:${cleanClassName}`;
        
        // 获取最新的updateTime（如果API返回了的话）
        const latestUpdateTime = uploadResponse?.Value?.updateTime || Date.now();
        
        // 创建新的类记录，保留所有原有信息，只更新变化的字段
        unchangeableJson[classKey] = {
          updateTime: latestUpdateTime,
          name: funcJson.name || cleanClassName,
          apiName: apiName,
          content: funcJson.content || codeContent,
          bindingObjectApiName: bindingObjectApiName,
          type: "class",
          nameSpace: nameSpace,
          returnType: funcJson.returnType || returnType,
          tenantId: funcJson.tenantId || '67000207', // 从配置读取或使用默认值
          lang: funcJson.lang || lang
        };
        logger.info(`在unchangeableJson.json中创建新的类记录 ${cleanClassName}`);
        
        // 保存更新后的unchangeableJson文件
        await fs.writeFile(unchangeableJsonPath, JSON.stringify(unchangeableJson, null, 2));
        logger.info(`成功更新unchangeableJson.json文件`);
      } else {
        logger.info(`unchangeableJson.json文件不存在，跳过更新`);
      }
    } catch (updateError) {
      logger.warning(`更新unchangeableJson.json失败: ${updateError.message}`);
      // 不影响主流程，继续执行
    }
    
    return { 
      success: true, 
      message: `新类 ${className} 推送成功`, 
      name: className, 
      id: (uploadResponse && uploadResponse.Value?.id) || apiName 
    };
  } catch (error) {
    logger.error(`推送新类失败: ${error.message}`);
    logger.debug(`推送新类详细错误: ${error.stack}`);
    return { success: false, message: `推送新类失败: ${error.message}` };
  }
};

module.exports = {
  pushClass,
  pushNewClass
};
