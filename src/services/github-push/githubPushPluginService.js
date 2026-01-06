/**
 * GitHub插件推送服务
 * 负责将从GitHub仓库获取的插件推送到远程服务
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
 * 从GitHub推送插件
 * @param {Object} plugin - 从GitHub API获取的插件对象
 * @param {boolean} dryRun - 是否为模拟运行
 * @param {string} owner - 仓库所有者
 * @param {string} repo - 仓库名称
 * @param {string} branch - 分支名称
 * @param {string} targetDir - 目标目录
 * @param {boolean} force - 是否强制推送（忽略版本检查）
 * @returns {Promise<Object>} 推送结果
 */
const pushPluginFromGitHub = async (plugin, dryRun = false, owner = '', repo = '', branch = 'main', targetDir = '', force = false) => {
  try {
    const pluginName = plugin.metadata.name || plugin.fileName;
    
    if (dryRun) {
      logger.info(`[DRY RUN] 推送插件: ${pluginName}`);
      // 添加一个小延迟，让进度条有机会实时更新
      await new Promise(resolve => setTimeout(resolve, 100));
      return { name: pluginName, success: true, message: '[DRY RUN] 插件推送成功' };
    }
    
    // 从GitHub API获取的插件数据中提取文件内容
    const pluginXml = plugin.metadata.pluginXml;
    
    if (!pluginXml) {
      throw new Error(`插件XML文件为空: ${pluginName}`);
    }
    
    // 构建请求数据
    const askData = {
      sourceFiles: [],
      fileTree: [],
      images: []
    };
    
    // 处理sourceFiles目录
    if (plugin.metadata.sourceFiles && plugin.metadata.sourceFiles.length > 0) {
      for (const file of plugin.metadata.sourceFiles) {
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
    if (plugin.metadata.fileTree && plugin.metadata.fileTree.length > 0) {
      for (const file of plugin.metadata.fileTree) {
        const uploadResult = await api.uploadFileFromContent(file.fileName, file.content);
        if (uploadResult && uploadResult.TempFileName) {
          askData.fileTree.push({
            fileSize: file.content.length,
            fileName: file.fileName,
            filePath: uploadResult.TempFileName,
            path: file.path || ''
          });
        }
      }
    }
    
    // 处理静态资源
    if (plugin.metadata.staticFiles && plugin.metadata.staticFiles.length > 0) {
      for (const file of plugin.metadata.staticFiles) {
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
    
    // 构建插件ID
    let sanitizedPluginName = pluginName;
    sanitizedPluginName = sanitizedPluginName
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^(?=\d)/, '_');
    let pluginId = sanitizedPluginName;
    
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
        
        // 检查插件是否已存在于unchangeableJson.json中
        // unchangeableJson.json中的键名格式是"plugin:pluginName"
        const possibleKeys = [
          `plugin:${pluginName}`,
          `plugin:${sanitizedPluginName}`,
          `plugin:${pluginId}`,
          pluginName,
          sanitizedPluginName,
          pluginId
        ];
        
        logger.debug(`尝试查找插件 ${pluginName}，可能的键名: ${possibleKeys.join(', ')}`);
        logger.debug(`unchangeableJson中的所有键名: ${Object.keys(unchangeableJson).join(', ')}`);
        
        for (const key of possibleKeys) {
          if (unchangeableJson[key]) {
            pluginId = unchangeableJson[key].apiName || pluginId;
            updateTime = unchangeableJson[key].updateTime || 0;
            logger.info(`插件 ${pluginName} 已存在于unchangeableJson.json中，键名: ${key}, apiName: ${pluginId}, updateTime: ${updateTime}`);
            break;
          }
        }
        
        if (updateTime === 0) {
          logger.debug(`未在unchangeableJson.json中找到插件 ${pluginName}`);
        }
      } catch (error) {
        logger.warn(`获取unchangeableJson.json失败: ${error.message}，使用默认值`);
      }
    }
    
    // 如果启用了force模式，重置updateTime为0，忽略版本检查
    if (force) {
      logger.warning(`force模式已启用，将updateTime重置为0，忽略线上版本检查`);
      updateTime = 0;
    }
    
    // 构建请求数据
    const data = {
      name: pluginName,
      mateXml: pluginXml,
      apiName: pluginId,
      sourceFiles: askData.sourceFiles || [],
      fileTree: askData.fileTree || [],
      images: askData.images || [],
      type: 'plugin',
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
    
    logger.info(`准备推送插件: ${pluginName}, apiName: ${pluginId}, updateTime: ${updateTime}`);
    
    // 调用API上传插件（与组件使用相同的API）
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
        
        if (errorMessage.includes('已存在相同的apiName')) {
          logger.info(`检测到"已存在相同的apiName"错误`);
          
          // 先尝试从服务器获取插件信息并重试（无论是否force模式）
          logger.info(`尝试从服务器获取插件信息并重试`);
          
          try {
            const existingPlugin = await api.fetchComponents('plugin', pluginId);
            
            if (existingPlugin && existingPlugin.length > 0) {
              const pluginInfo = existingPlugin[0];
              const existingUpdateTime = pluginInfo.updateTime || pluginInfo.update_time || 0;
              
              logger.info(`找到已存在的插件，updateTime=${existingUpdateTime}，使用该值重试`);
              
              // 修改updateTime为从服务器获取的值
              data.updateTime = existingUpdateTime;
              
              // 再次调用API
              logger.info('使用正确的updateTime重试推送...');
              uploadResult = await api.uploadComponent(data);
              
              logger.info(`插件推送成功: ${pluginName}`);
              return { name: pluginName, success: true, ...uploadResult };
            } else {
              logger.warning('未找到已存在的插件信息，使用updateTime=0重试');
              data.updateTime = 0;
              uploadResult = await api.uploadComponent(data);
              
              logger.info(`插件推送成功: ${pluginName}`);
              return { name: pluginName, success: true, ...uploadResult };
            }
          } catch (fetchError) {
            logger.warning(`获取插件信息失败: ${fetchError.message}，使用updateTime=0重试`);
            data.updateTime = 0;
            uploadResult = await api.uploadComponent(data);
            
            logger.info(`插件推送成功: ${pluginName}`);
            return { name: pluginName, success: true, ...uploadResult };
          }
        } else if (errorMessage.includes('系统出现异常') && retryCount < maxRetries) {
          // 系统出现异常，尝试将updateTime设置为0并重试
          retryCount++;
          logger.warning(`检测到系统异常，尝试第${retryCount}次重试...`);
          logger.warning(`错误信息: ${errorMessage}`);
          
          // 修改updateTime为0
          data.updateTime = 0;
          originalError = error;
        } else if (errorMessage.includes('当前代码在线上有更高版本') && retryCount < maxRetries) {
          // 当前代码在线上有更高版本，尝试从服务器获取最新插件信息并重试
          retryCount++;
          logger.warning(`检测到版本冲突，尝试第${retryCount}次重试...`);
          logger.warning(`错误信息: ${errorMessage}`);
          
          try {
            // 从服务器获取最新插件信息
            const existingPlugin = await api.fetchComponents('plugin', pluginId);
            
            if (existingPlugin && existingPlugin.length > 0) {
              const pluginInfo = existingPlugin[0];
              const existingUpdateTime = pluginInfo.updateTime || pluginInfo.update_time || 0;
              
              logger.info(`找到已存在的插件，updateTime=${existingUpdateTime}，使用该值重试`);
              
              // 修改updateTime为从服务器获取的值
              data.updateTime = existingUpdateTime;
              originalError = error;
            } else {
              // 未找到插件信息，使用updateTime=0重试
              logger.warning('未找到已存在的插件信息，使用updateTime=0重试');
              data.updateTime = 0;
              originalError = error;
            }
          } catch (fetchError) {
            logger.warning(`获取插件信息失败: ${fetchError.message}，使用updateTime=0重试`);
            data.updateTime = 0;
            originalError = error;
          }
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
    
    logger.info(`插件推送成功: ${pluginName}`);
    return { name: pluginName, success: true, ...uploadResult };
  } catch (error) {
    logger.error(`推送插件失败: ${error.message}`);
    throw error;
  }
};

module.exports = {
  pushPluginFromGitHub
};
