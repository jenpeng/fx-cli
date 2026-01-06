/**
 * GitHub函数推送服务
 * 负责将从GitHub仓库获取的函数推送到远程服务
 * 与普通推送完全独立，不依赖pushFunctionService.js
 */

const api = require('../api');
// 简化的日志记录器，只输出ERROR和WARN级别
const logger = {
  info: () => {}, // 禁用INFO级别日志
  debug: () => {}, // 禁用DEBUG级别日志
  warn: (message) => console.warn(`[警告] ${message}`),
  error: (message) => console.error(`[错误] ${message}`),
  warning: (message) => console.warn(`[警告] ${message}`) // 兼容warning方法
};
const path = require('path');
const fs = require('fs-extra');
const { getConfigManager } = require('../../core/ConfigManager');

const configManager = getConfigManager();

/**
 * 从GitHub获取unchangeableJson.json文件内容
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名称
 * @param {string} branch - 分支名称
 * @param {string} targetDir - 目标目录
 * @returns {Promise<Object>} unchangeableJson内容
 */
const getUnchangeableJsonFromGitHub = async (owner, repo, branch, targetDir = '') => {
  try {
    const githubService = require('./githubService');
    
    // 构建unchangeableJson.json的路径
    const unchangeableJsonPath = targetDir ? `${targetDir}/unchangeableJson.json` : 'unchangeableJson.json';
    
    logger.info(`尝试从GitHub获取unchangeableJson.json: ${unchangeableJsonPath}`);
    
    try {
      const content = await githubService.getFileContent(owner, repo, unchangeableJsonPath, branch);
      
      if (content && content.trim()) {
        const unchangeableJson = JSON.parse(content);
        logger.info(`成功获取unchangeableJson.json，包含 ${Object.keys(unchangeableJson).length} 个条目`);
        return unchangeableJson;
      } else {
        logger.warning('unchangeableJson.json文件为空');
        return {};
      }
    } catch (error) {
      if (error.message && error.message.includes('404')) {
        logger.warning(`unchangeableJson.json文件不存在于仓库中: ${unchangeableJsonPath}`);
        return {};
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.warning(`获取unchangeableJson.json失败: ${error.message}`);
    return {};
  }
};

/**
 * 获取函数信息（GitHub专用）
 * @param {string} functionName - 函数名称
 * @param {string} bindingObjectApiName - 绑定对象API名称
 * @returns {Promise<Object>} 函数信息
 */
const getFunctionInfo = async (functionName, bindingObjectApiName = 'NONE') => {
  try {
    // 如果传入的是函数ID，直接返回基本信息，不需要重新查询
    if (typeof functionName === 'string' && /^[0-9a-f]{24}$/.test(functionName)) {
      return {
        id: functionName,
        name: functionName,
        apiName: functionName,
        content: '',
        bindingObjectApiName: bindingObjectApiName,
        updateTime: Date.now()
      };
    }
    
    // 如果是函数名称，则进行查询
    const response = await api.getSingleFunction(functionName, 'function', bindingObjectApiName);
    
    logger.debug(`getFunctionInfo收到的response: ${JSON.stringify(response, null, 2)}`);
    
    if (response) {
      // 现在api.getSingleFunction直接返回targetItem
      let functionData = response;
      
      if (functionData && functionData.id) {
        return {
          id: functionData.id,
          name: functionData.function_name || functionData.name || functionName,
          apiName: functionData.api_name || functionName,
          content: functionData.body || functionData.content || functionData.funcContent || '',
          bindingObjectApiName: functionData.binding_object_api_name || bindingObjectApiName,
          updateTime: functionData.update_time || Date.now()
        };
      }
    }
    
    return null;
  } catch (error) {
    // 如果函数不存在（HTTP 404或业务逻辑错误），返回null
    if (error.response && error.response.status === 404) {
      return null;
    }
    // 检查错误消息是否包含"未找到"信息
    if (error.message && error.message.includes('未找到')) {
      logger.info(`函数 ${functionName} 不存在，将创建新函数`);
      return null;
    }
    throw error;
  }
};

/**
 * 创建函数（GitHub专用）
 * @param {Object} functionData - 函数数据
 * @returns {Promise<Object>} 创建结果
 */
const createFunction = async (functionData) => {
  try {
    // 构建分析数据 - 模拟默认函数对象
    const defaultFunction = {
      api_name: functionData.apiName || functionData.name,
      application: '',
      binding_object_api_name: functionData.bindingObjectApiName || 'NONE',
      body: functionData.content || '',
      commit_log: '',
      data_source: '',
      function_name: functionData.name,
      is_active: false,
      lang: functionData.lang || 0, // groovy
      name_space: functionData.nameSpace || '',
      parameters: functionData.parameters || [],
      remark: functionData.description || '',
      return_type: functionData.returnType || '',
      status: 'not_used',
      type: 'function',
      version: 1
    };
    
    logger.info(`createFunction - 调用API进行函数分析，nameSpace: ${defaultFunction.name_space}, returnType: ${defaultFunction.return_type}`);
    
    // 1. 调用API进行函数分析
    const analyzeResponse = await api.post('/FHH/EMDHFUNC/runtime/analyze', { function: defaultFunction });
    
    logger.info(`createFunction - 分析响应成功`);
    
    // 处理API响应错误
    if (analyzeResponse.Result && analyzeResponse.Result.FailureMessage) {
      throw new Error(`函数分析失败: ${analyzeResponse.Result.FailureMessage}`);
    }
    
    // 处理分析结果
    const { violations = [], success = true } = analyzeResponse.Value || {};
    const seriousError = violations.find((item) => item.priority >= 9);
    
    if (success === false && seriousError) {
      // 有严重错误，需要确认是否继续
      throw new Error(`函数分析发现严重错误: ${seriousError?.message || '未知错误'}`);
    } else if (success === false) {
      // 有警告但不阻止上传
      logger.warning(`函数分析发现警告，请检查代码质量`);
    }
    
    // 2. 调用API进行编译检查
    logger.info(`createFunction - 调用API进行编译检查，nameSpace: ${defaultFunction.name_space}, returnType: ${defaultFunction.return_type}`);
    const compileResponse = await api.post('/FHH/EMDHFUNC/runtime/compileCheck', { function: defaultFunction });
    
    logger.info(`createFunction - 编译检查响应成功`);
    
    // 处理API响应错误
    if (compileResponse.Result?.FailureMessage) {
      throw new Error(`编译检查失败: ${compileResponse.Result.FailureMessage}`);
    }
    
    // 3. 构建上传数据对象
    const uploadData = {
      type: 'function',
      lang: functionData.lang || 0, // groovy
      commit: functionData.commit || 'fx-cli github push function',
      apiName: functionData.apiName || functionData.name,
      nameSpace: functionData.nameSpace || '',
      description: functionData.description || '',
      name: functionData.name,
      bindingObjectApiName: functionData.bindingObjectApiName || 'NONE',
      returnType: functionData.returnType || '',
      metaXml: functionData.metaXml || '',
      content: functionData.content || '',
      updateTime: 0 // 新函数的updateTime为0
    };
    
    logger.info(`createFunction - 调用API上传函数代码`);
    
    // 4. 调用API上传函数代码
    const uploadResponse = await api.post('/FHH/EMDHFUNC/biz/upload', uploadData);
    
    logger.info(`createFunction - 上传响应成功`);
    
    // 处理API响应错误
    if (uploadResponse.Result && uploadResponse.Result.StatusCode !== 0) {
      throw new Error(`上传函数失败: ${uploadResponse.Result.FailureMessage || '未知错误'}`);
    }
    
    if (uploadResponse?.Error?.Message) {
      // 当StatusCode为0但有Error时，通常是系统级提示，不应阻止操作
      logger.warning(`上传函数系统提示: ${uploadResponse?.Error?.Message}`);
    }
    
    logger.info(`函数创建并上传成功: ${functionData.name}`);
    
    return {
      success: true,
      id: uploadResponse?.Value?.id || uploadData.apiName,
      data: uploadResponse,
      message: `函数创建成功: ${functionData.name}`
    };
    
  } catch (error) {
    logger.error(`创建函数失败: ${error.message}`);
    
    // 检查是否为"函数API名称已经存在"错误
    const errorMessage = error.message || '未知错误';
    if (errorMessage.includes('函数API名称已经存在')) {
      logger.warning(`检测到函数已存在，尝试更新函数...`);
      
      try {
        // 从服务器获取最新函数信息
        const functionInfo = await api.getSingleFunction(
          functionData.apiName || functionData.name,
          'function',
          functionData.bindingObjectApiName || 'NONE'
        );
        
        logger.debug(`functionInfo完整响应: ${JSON.stringify(functionInfo, null, 2)}`);
        
        // 兼容两种数据结构：直接返回targetItem或{ Value: {...} }
        let latestUpdateTime = null;
        let latestFunctionId = null;
        if (functionInfo && functionInfo.update_time) {
          // 直接返回targetItem的情况
          latestUpdateTime = functionInfo.update_time;
          latestFunctionId = functionInfo.id;
        } else if (functionInfo && functionInfo.Value && functionInfo.Value.update_time) {
          // 返回{ Value: {...} }的情况
          latestUpdateTime = functionInfo.Value.update_time;
          latestFunctionId = functionInfo.Value.id;
        }
        
        if (latestUpdateTime && latestFunctionId) {
          // 使用服务器返回的最新updateTime和函数ID
          logger.info(`获取到服务器最新updateTime: ${latestUpdateTime}, 函数ID: ${latestFunctionId}`);
          
          // 调用updateFunction方法更新函数
          const updateResult = await updateFunction(latestFunctionId, functionData, latestUpdateTime);
          
          logger.info(`函数更新成功: ${functionData.name}`);
          
          return {
            success: true,
            id: latestFunctionId,
            data: updateResult,
            message: `函数更新成功: ${functionData.name}`
          };
        } else {
          throw new Error(`无法从服务器获取函数信息`);
        }
      } catch (retryError) {
        logger.error(`更新已存在函数失败: ${retryError.message}`);
        throw retryError;
      }
    } else {
      // 不是"函数API名称已经存在"错误，直接抛出
      throw error;
    }
  }
};

/**
 * 更新函数（GitHub专用）
 * @param {string} functionId - 函数ID
 * @param {Object} functionData - 函数数据
 * @param {number} updateTime - 更新时间戳
 * @returns {Promise<Object>} 更新结果
 */
const updateFunction = async (functionId, functionData, updateTime = Date.now()) => {
  try {
    // 构建正确的上传数据格式
    const uploadData = {
      type: 'function',
      lang: 0, // groovy
      commit: 'fx-cli github update function',
      apiName: functionData.apiName || functionData.name,
      nameSpace: functionData.nameSpace || '',
      description: functionData.description || `更新函数 ${functionData.name}`,
      name: functionData.name,
      bindingObjectApiName: functionData.bindingObjectApiName || 'NONE',
      returnType: functionData.returnType || '',
      metaXml: functionData.metaXml || '',
      content: functionData.content,
      updateTime: updateTime
    };
    
    logger.info(`updateFunction - 调用API更新函数: ${functionData.name}`);
    
    // 使用与extension一致的上传接口
    let response;
    try {
      response = await api.post('/FHH/EMDHFUNC/biz/upload', uploadData);
    } catch (error) {
      // 捕获API异常，检查是否为版本冲突错误
      const errorMessage = error.message || '未知错误';
      
      // 静默处理API名称已存在或版本冲突错误，不打印日志，直接重试
      
      // GitHub专用版本冲突处理逻辑
      // 修改：当检测到"函数API名称已经存在"错误时，无论updateTime是否为0，都尝试获取最新updateTime并重试
      if (errorMessage.includes('当前代码在线上有更高版本') || 
          (errorMessage.includes('函数API名称已经存在') && uploadData.updateTime !== 0)) {
        try {
          // 从服务器获取最新函数信息
          const functionInfo = await api.getSingleFunction(
            functionData.apiName || functionData.name,
            'function',
            functionData.bindingObjectApiName || 'NONE'
          );
          
          // 兼容两种数据结构：直接返回targetItem或{ Value: {...} }
          let latestUpdateTime = null;
          if (functionInfo && functionInfo.update_time) {
            // 直接返回targetItem的情况
            latestUpdateTime = functionInfo.update_time;
          } else if (functionInfo && functionInfo.Value && functionInfo.Value.update_time) {
            // 返回{ Value: {...} }的情况
            latestUpdateTime = functionInfo.Value.update_time;
          }
          
          if (latestUpdateTime) {
            // 使用服务器返回的最新updateTime
            // 使用最新的updateTime重试推送
            uploadData.updateTime = latestUpdateTime;
            
            // 再次调用API推送函数
            response = await api.post('/FHH/EMDHFUNC/biz/upload', uploadData);
            
            // 处理重试响应错误
            if (response.Result && response.Result.StatusCode !== 0) {
              throw new Error(`更新函数失败: ${response.Result.FailureMessage || '未知错误'}`);
            }
          } else {
            throw new Error(`无法从服务器获取函数信息`);
          }
        } catch (retryError) {
          logger.error(`版本冲突处理失败: ${retryError.message}`);
          throw retryError;
        }
      } else if (errorMessage.includes('函数API名称已经存在') && uploadData.updateTime === 0) {
        // 当updateTime为0且检测到"函数API名称已经存在"错误时
        // 这通常意味着函数已存在，但我们不知道最新的updateTime
        // 尝试从服务器获取最新函数信息并更新
        try {
          // 从服务器获取最新函数信息
          const functionInfo = await api.getSingleFunction(
            functionData.apiName || functionData.name,
            'function',
            functionData.bindingObjectApiName || 'NONE'
          );
          
          // 兼容两种数据结构：直接返回targetItem或{ Value: {...} }
          let latestUpdateTime = null;
          let latestFunctionId = null;
          if (functionInfo && functionInfo.update_time) {
            // 直接返回targetItem的情况
            latestUpdateTime = functionInfo.update_time;
            latestFunctionId = functionInfo.id;
          } else if (functionInfo && functionInfo.Value && functionInfo.Value.update_time) {
            // 返回{ Value: {...} }的情况
            latestUpdateTime = functionInfo.Value.update_time;
            latestFunctionId = functionInfo.Value.id;
          }
          
          if (latestUpdateTime && latestFunctionId) {
            // 使用服务器返回的最新updateTime和函数ID
            // 使用最新的updateTime重试推送
            uploadData.updateTime = latestUpdateTime;
            
            // 再次调用API推送函数
            response = await api.post('/FHH/EMDHFUNC/biz/upload', uploadData);
            
            // 处理重试响应错误
            if (response.Result && response.Result.StatusCode !== 0) {
              throw new Error(`更新函数失败: ${response.Result.FailureMessage || '未知错误'}`);
            }
          } else {
            throw new Error(`无法从服务器获取函数信息`);
          }
        } catch (retryError) {
          logger.error(`获取最新函数信息失败: ${retryError.message}`);
          throw retryError;
        }
      } else {
        // 不是版本冲突错误，直接抛出
        throw error;
      }
    }
    
    // 处理响应错误
    if (response && response.Result && response.Result.StatusCode !== 0) {
      throw new Error(`更新函数失败: ${response.Result.FailureMessage || '未知错误'}`);
    }
    
    logger.info(`函数更新成功: ${functionData.name}`);
    
    return {
      success: true,
      id: response?.Value?.id || functionId,
      data: response,
      message: `函数更新成功: ${functionData.name}`
    };
    
  } catch (error) {
    logger.error(`更新函数失败: ${error.message}`);
    throw error;
  }
};

/**
 * 从内容推送函数（GitHub专用）
 * @param {string} filePath - 文件路径
 * @param {string} functionContent - 函数内容
 * @param {number} updateTime - 更新时间戳
 * @param {string} apiName - API名称
 * @param {string} nameSpace - 命名空间
 * @param {string} returnType - 返回类型
 * @param {string} bindingObjectApiName - 绑定对象API名称
 * @returns {Promise<Object>} 推送结果
 */
const pushFunctionFromContent = async (filePath, functionContent, updateTime = 0, apiName = '', nameSpace = '', returnType = '', bindingObjectApiName = '') => {
  try {
    // 提取文件名
    const fileName = path.basename(filePath);
    const functionName = fileName.replace(/\.(groovy|js)$/, '');
    
    // 解析函数内容，提取@apiName注解
    let finalApiName = apiName;
    if (!finalApiName) {
      const apiNameMatch = functionContent.match(/@apiName\s*=\s*['"]([^'"]+)['"]/);
      if (apiNameMatch) {
        finalApiName = apiNameMatch[1];
      }
    }
    
    // 解析函数内容，提取@nameSpace注解
    let finalNameSpace = nameSpace;
    if (!finalNameSpace) {
      const nameSpaceMatch = functionContent.match(/@nameSpace\s*=\s*['"]([^'"]+)['"]/);
      if (nameSpaceMatch) {
        finalNameSpace = nameSpaceMatch[1];
      }
    }
    
    // 解析函数内容，提取@returnType注解
    let finalReturnType = returnType;
    if (!finalReturnType) {
      const returnTypeMatch = functionContent.match(/@returnType\s*=\s*['"]([^'"]+)['"]/);
      if (returnTypeMatch) {
        finalReturnType = returnTypeMatch[1];
      }
    }
    
    // 解析函数内容，提取@bindingObjectApiName注解
    let finalBindingObjectApiName = bindingObjectApiName;
    if (!finalBindingObjectApiName) {
      const bindingObjectApiNameMatch = functionContent.match(/@bindingObjectApiName\s*=\s*['"]([^'"]+)['"]/);
      if (bindingObjectApiNameMatch) {
        finalBindingObjectApiName = bindingObjectApiNameMatch[1];
      }
    }
    
    // 构建函数数据
    const functionData = {
      name: functionName,
      apiName: finalApiName || functionName,
      nameSpace: finalNameSpace,
      returnType: finalReturnType,
      content: functionContent,
      bindingObjectApiName: finalBindingObjectApiName || 'NONE',
      lang: 0 // groovy
    };
    
    logger.info(`准备推送函数: ${functionName}, apiName: ${functionData.apiName}, nameSpace: ${functionData.nameSpace}, returnType: ${functionData.returnType}, bindingObjectApiName: ${functionData.bindingObjectApiName}`);
    
    // 检查函数是否已存在
    let existingFunction = null;
    if (finalApiName) {
      // 如果有apiName，优先使用apiName查询
      logger.info(`使用apiName检查函数是否已存在: ${finalApiName}, bindingObjectApiName: ${functionData.bindingObjectApiName}`);
      existingFunction = await getFunctionInfo(finalApiName, functionData.bindingObjectApiName);
    }
    
    // 如果使用apiName查询失败，尝试使用文件名查询
    if (!existingFunction) {
      logger.info(`使用文件名检查函数是否已存在: ${functionName}, bindingObjectApiName: ${functionData.bindingObjectApiName}`);
      existingFunction = await getFunctionInfo(functionName, functionData.bindingObjectApiName);
    }
    
    let result;
    if (existingFunction) {
      // 更新函数
      logger.info(`函数 ${functionName} 已存在，更新函数`);
      result = await updateFunction(existingFunction.id, functionData, updateTime);
    } else {
      // 创建函数
      logger.info(`函数 ${functionName} 不存在，创建新函数`);
      result = await createFunction(functionData);
    }
    
    logger.info(`函数 ${functionName} 推送成功`);
    return {
      success: true,
      name: fileName,
      result: result
    };
  } catch (error) {
    logger.error(`从内容推送函数失败: ${error.message}`);
    throw error;
  }
};

/**
 * 从GitHub推送函数
 * @param {Object} func - 从GitHub API获取的函数对象
 * @param {boolean} dryRun - 是否为模拟运行
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名称
 * @param {string} branch - 分支名称
 * @param {string} targetDir - 目标目录
 * @returns {Promise<Object>} 推送结果
 */
const pushFunctionFromGitHub = async (func, dryRun = false, owner = '', repo = '', branch = 'main', targetDir = '') => {
  try {
    const functionName = func.metadata.name || func.fileName;
    
    if (dryRun) {
      logger.info(`[DRY RUN] 推送函数: ${functionName}`);
      // 添加一个小延迟，让进度条有机会实时更新
      await new Promise(resolve => setTimeout(resolve, 100));
      return { name: functionName, success: true, message: '[DRY RUN] 函数推送成功' };
    }
    
    // 从GitHub API获取的函数数据中提取文件内容
    const functionContent = func.content;
    
    if (!functionContent) {
      throw new Error(`函数内容为空: ${functionName}`);
    }
    
    // 构建函数ID
    let sanitizedFunctionName = functionName;
    if (sanitizedFunctionName.endsWith('.groovy')) {
      sanitizedFunctionName = sanitizedFunctionName.slice(0, -7);
    }
    sanitizedFunctionName = sanitizedFunctionName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^(?=\d)/, '_');
    let functionId = sanitizedFunctionName;
    
    // 初始化updateTime为0
    let updateTime = 0;
    let nameSpace = '';
    let returnType = '';
    let bindingObjectApiName = '';
    
    // 如果提供了owner、repo和branch，尝试从GitHub获取unchangeableJson.json
    if (owner && repo && branch) {
      try {
        // 从GitHub获取unchangeableJson.json
        let unchangeableJson = {};
        try {
          unchangeableJson = await getUnchangeableJsonFromGitHub(owner, repo, branch, targetDir);
        } catch (error) {
          logger.warning(`获取unchangeableJson.json失败: ${error.message}，使用默认值`);
        }
        
        // 检查函数是否已存在于unchangeableJson.json中
        // unchangeableJson.json中的键名格式是"function:functionName"
        const possibleKeys = [
          `function:${functionName}`,
          `function:${sanitizedFunctionName}`,
          `function:${functionId}`,
          functionName,
          sanitizedFunctionName,
          functionId
        ];
        

        
        let functionConfig = null;
        for (const key of possibleKeys) {
          if (unchangeableJson[key]) {
            functionConfig = unchangeableJson[key];
            functionId = functionConfig.apiName || functionId;
            updateTime = functionConfig.updateTime || 0;
            logger.info(`函数 ${functionName} 已存在于unchangeableJson.json中，键名: ${key}, apiName: ${functionId}, updateTime: ${updateTime}`);
            break;
          }
        }
        
        if (updateTime === 0) {
          logger.debug(`未在unchangeableJson.json中找到函数 ${functionName}`);
        }
        
        // 提取nameSpace、returnType和bindingObjectApiName
        if (functionConfig) {
          nameSpace = functionConfig.nameSpace || '';
          returnType = functionConfig.returnType || '';
          bindingObjectApiName = functionConfig.bindingObjectApiName || '';
          if (nameSpace) {
            logger.info(`从unchangeableJson.json中获取到nameSpace: ${nameSpace}`);
          }
          if (returnType) {
            logger.info(`从unchangeableJson.json中获取到returnType: ${returnType}`);
          }
          if (bindingObjectApiName) {
            logger.info(`从unchangeableJson.json中获取到bindingObjectApiName: ${bindingObjectApiName}`);
          }
        }
      } catch (error) {
        logger.warning(`获取unchangeableJson.json失败: ${error.message}，使用默认值`);
      }
    }
    

    
    logger.info(`准备推送函数: ${functionName}, apiName: ${functionId}, updateTime: ${updateTime}`);
    
    // 构建文件路径（用于提取文件名）
    const filePath = path.join('/', `${sanitizedFunctionName}.groovy`);
    
    // 调用GitHub专用的pushFunctionFromContent方法推送函数
    const result = await pushFunctionFromContent(filePath, functionContent, updateTime, functionId, nameSpace, returnType, bindingObjectApiName);
    
    if (result && result.success) {
      logger.info(`✅ 函数推送成功: ${functionName}`);
      return { name: functionName, success: true, message: '函数推送成功' };
    } else {
      throw new Error(result?.message || '函数推送失败');
    }
  } catch (error) {
    logger.error(`❌ 推送函数失败: ${func.metadata.name || func.fileName}, 错误: ${error.message}`);
    return { 
      name: func.metadata.name || func.fileName, 
      success: false, 
      error: error.message 
    };
  }
};

module.exports = {
  pushFunctionFromGitHub
};