/**
 * GitHub组件推送服务
 * 负责将从GitHub仓库获取的组件推送到远程服务
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
 * 从GitHub推送组件
 * @param {Object} component - 从GitHub API获取的组件对象
 * @param {boolean} dryRun - 是否为模拟运行
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名称
 * @param {string} branch - 分支名称
 * @param {string} targetDir - 目标目录
 * @returns {Promise<Object>} 推送结果
 */
const pushComponentFromGitHub = async (component, dryRun = false, owner = '', repo = '', branch = 'main', targetDir = '') => {
  try {
    const componentName = component.metadata.name || component.fileName;
    
    if (dryRun) {
      logger.info(`[DRY RUN] 推送组件: ${componentName}`);
      // 添加一个小延迟，让进度条有机会实时更新
      await new Promise(resolve => setTimeout(resolve, 100));
      return { name: componentName, success: true, message: '[DRY RUN] 组件推送成功' };
    }
    
    // 从GitHub API获取的组件数据中提取文件内容
    const componentPath = component.filePath;
    
    // 从metadata中获取XML内容
    let xmlContent = component.metadata.componentXml;
    
    if (!xmlContent) {
      throw new Error(`组件中找不到 component.xml 文件: ${componentName}`);
    }
    
    // 构建请求数据
    const askData = {
      sourceFiles: [],
      fileTree: [],
      images: []
    };
    
    // 处理sourceFiles目录
    if (component.metadata.sourceFiles && component.metadata.sourceFiles.length > 0) {
      for (const file of component.metadata.sourceFiles) {
        const uploadResult = await api.uploadFileFromContent(file.fileName, file.content);
        if (uploadResult && uploadResult.TempFileName) {
          askData.sourceFiles.push({
            fileSize: file.content.length,
            fileName: file.fileName,
            filePath: uploadResult.TempFileName
          });
        }
      }
    }
    
    // 处理fileTree目录
    if (component.metadata.fileTree && component.metadata.fileTree.length > 0) {
      for (const file of component.metadata.fileTree) {
        const uploadResult = await api.uploadFileFromContent(file.fileName, file.content);
        if (uploadResult && uploadResult.TempFileName) {
          const fileObj = {
            fileSize: file.content.length,
            fileName: file.fileName,
            filePath: uploadResult.TempFileName,
            path: file.filePath || ''
          };
          askData.fileTree.push(fileObj);
        }
      }
    }
    
    // 处理静态资源
    if (component.metadata.staticFiles && component.metadata.staticFiles.length > 0) {
      for (const file of component.metadata.staticFiles) {
        // 上传静态文件内容，与sourceFiles和fileTree处理方式一致
        const uploadResult = await api.uploadFileFromContent(file.fileName, file.content);
        if (uploadResult && uploadResult.TempFileName) {
          askData.images.push({
            fileSize: file.content.length,
            fileName: file.fileName,
            filePath: uploadResult.TempFileName
          });
        }
      }
    }
    
    // 构建组件ID
    let sanitizedComponentName = componentName;
    if (sanitizedComponentName.endsWith('__c')) {
      sanitizedComponentName = sanitizedComponentName.slice(0, -3);
    }
    sanitizedComponentName = sanitizedComponentName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^(?=\d)/, '_');
    let componentId = `${sanitizedComponentName}__c`;
    
    // 初始化updateTime为0
    let updateTime = 0;
    
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
        
        // 检查组件是否已存在于unchangeableJson.json中
        // unchangeableJson.json中的键名格式是"component:componentName"
        const possibleKeys = [
          `component:${componentName}`,
          `component:${sanitizedComponentName}`,
          `component:${componentId}`,
          `component:${sanitizedComponentName}__c`,
          `component:${componentName}__c`,
          componentName,
          sanitizedComponentName,
          componentId
        ];
        

        
        for (const key of possibleKeys) {
          if (unchangeableJson[key]) {
            componentId = unchangeableJson[key].apiName || componentId;
            updateTime = unchangeableJson[key].updateTime || 0;
            logger.info(`组件 ${componentName} 已存在于unchangeableJson.json中，键名: ${key}, apiName: ${componentId}, updateTime: ${updateTime}`);
            break;
          }
        }
        
        if (updateTime === 0) {
          logger.debug(`未在unchangeableJson.json中找到组件 ${componentName}`);
        }
      } catch (error) {
        logger.warn(`获取unchangeableJson.json失败: ${error.message}，使用默认值`);
      }
    }
    

    
    // 构建请求数据
    const data = {
      name: componentName,
      mateXml: xmlContent,
      apiName: componentId,
      sourceFiles: askData.sourceFiles || [],
      fileTree: askData.fileTree || [],
      images: askData.images || [],
      type: 'component',
      updateTime: updateTime
    };
    
    // 如果fileTree存在且有内容，删除sourceFiles字段（与extension保持一致的互斥逻辑）
    if (data.fileTree && data.fileTree.length > 0) {
      delete data.sourceFiles;
    } else {
      // 确保sourceFiles字段存在，避免"sourceFiles is not defined"错误
      if (!data.sourceFiles) {
        data.sourceFiles = [];
      }
    }
    
    // 调用API上传组件
    let uploadResult;
    let retryCount = 0;
    const maxRetries = 2;
    let originalError = null;
    
    while (retryCount <= maxRetries) {
      try {
        uploadResult = await api.uploadComponent(data);
        break; // 成功，退出循环
      } catch (error) {
        // 检查是否是"已存在相同的apiName"错误
        const errorMessage = error.message || error.response?.data?.Result?.FailureMessage || error.response?.data?.Error?.Message || '';
        
        if (errorMessage.includes('已存在相同的apiName') || errorMessage.includes('当前代码在线上有更高版本')) {
          // 静默处理API名称已存在或版本冲突错误，不打印日志，直接重试
          try {
            const existingComponent = await api.fetchComponents('component', componentId);
            
            if (existingComponent && existingComponent.length > 0) {
              const componentInfo = existingComponent[0];
              const existingUpdateTime = componentInfo.updateTime || componentInfo.update_time || 0;
              
              // 修改updateTime为从服务器获取的值
              data.updateTime = existingUpdateTime;
              
              // 再次调用API
              uploadResult = await api.uploadComponent(data);
              
              logger.info(`组件推送成功: ${componentName}`);
              return { name: componentName, success: true, ...uploadResult };
            } else {
              // 未找到组件信息，使用updateTime=0重试
              data.updateTime = 0;
              uploadResult = await api.uploadComponent(data);
              
              logger.info(`组件推送成功: ${componentName}`);
              return { name: componentName, success: true, ...uploadResult };
            }
          } catch (fetchError) {
            // 获取组件信息失败，使用updateTime=0重试
            data.updateTime = 0;
            uploadResult = await api.uploadComponent(data);
            
            logger.info(`组件推送成功: ${componentName}`);
            return { name: componentName, success: true, ...uploadResult };
          }
        } else if (errorMessage.includes('系统出现异常') && retryCount < maxRetries) {
          // 系统出现异常，尝试将updateTime设置为0并重试
          retryCount++;
          logger.warning(`检测到系统异常，尝试第${retryCount}次重试...`);
          logger.warning(`错误信息: ${errorMessage}`);
          
          // 修改updateTime为0
          data.updateTime = 0;
          originalError = error;
        } else {
          // 其他错误，直接抛出
          throw error;
        }
      }
    }
    
    // 如果最终失败，抛出原始错误
    if (!uploadResult && originalError) {
      throw originalError;
    }
    
    // 检查是否遇到"已存在相同的apiName"错误（针对非异常情况）
    if (uploadResult && uploadResult.Result && uploadResult.Result.StatusCode !== 0) {
      const errorMessage = uploadResult.Result.FailureMessage || uploadResult.Error?.Message || '';
      
      if (errorMessage.includes('已存在相同的apiName')) {
        logger.info(`检测到"已存在相同的apiName"错误`);
        
        // 先尝试从服务器获取组件信息并重试（无论是否force模式）
        logger.info(`尝试从服务器获取组件信息并重试`);
        
        try {
          const existingComponent = await api.fetchComponents('component', componentId);
          
          if (existingComponent && existingComponent.length > 0) {
            const componentInfo = existingComponent[0];
            const existingUpdateTime = componentInfo.updateTime || componentInfo.update_time || 0;
            
            logger.info(`找到已存在的组件，updateTime=${existingUpdateTime}，使用该值重试`);
            
            // 修改updateTime为从服务器获取的值
            data.updateTime = existingUpdateTime;
            
            // 再次调用API
            logger.info('使用正确的updateTime重试推送...');
            uploadResult = await api.uploadComponent(data);
            
            // 检查重试结果
            if (uploadResult && uploadResult.Result && uploadResult.Result.StatusCode !== 0) {
              const retryErrorMessage = uploadResult.Result.FailureMessage || uploadResult.Error?.Message || '未知错误';
              throw new Error(retryErrorMessage);
            }
          } else {
            logger.warning('未找到已存在的组件信息，使用updateTime=0重试');
            data.updateTime = 0;
            uploadResult = await api.uploadComponent(data);
            
            // 检查重试结果
            if (uploadResult && uploadResult.Result && uploadResult.Result.StatusCode !== 0) {
              const retryErrorMessage = uploadResult.Result.FailureMessage || uploadResult.Error?.Message || '未知错误';
              throw new Error(retryErrorMessage);
            }
          }
        } catch (fetchError) {
          logger.warning(`获取组件信息失败: ${fetchError.message}，使用updateTime=0重试`);
          data.updateTime = 0;
          uploadResult = await api.uploadComponent(data);
          
          // 检查重试结果
          if (uploadResult && uploadResult.Result && uploadResult.Result.StatusCode !== 0) {
            const retryErrorMessage = uploadResult.Result.FailureMessage || uploadResult.Error?.Message || '未知错误';
            throw new Error(retryErrorMessage);
          }
        }
      } else {
        // 其他错误，直接抛出
        const errorToThrow = uploadResult.Result.FailureMessage || uploadResult.Error?.Message || '未知错误';
        throw new Error(errorToThrow);
      }
    }
    
    logger.info(`组件推送成功: ${componentName}`);
    return { name: componentName, success: true, ...uploadResult };
  } catch (error) {
    const componentName = component.metadata.name || component.fileName;
    logger.error(`推送组件失败: ${componentName} - ${error.message}`);
    throw error;
  }
};

module.exports = {
  pushComponentFromGitHub
};
