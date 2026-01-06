/**
 * 代码部署服务
 * 负责将组件、插件、函数和类的代码推送到远程服务
 */

const fs = require('fs-extra');
const path = require('path');
// 使用request库代替axios，与extension保持一致
const request = require('request');
const CryptoJS = require('crypto-js');
const { readFileContent, dir2json, prepareFilesForUpload, parseGroovyComments, getInfoJson, setInfoJson, shouldIgnore } = require('../utils/fileUtils');
const api = require('./api');
// 导入拆分出去的pushClassService模块
const pushClassService = require('./pushClassService');
// 导入拆分出去的pushFunctionService模块
const pushFunctionService = require('./pushFunctionService');
// 导入拆分出去的pushComponentService模块
const pushComponentService = require('./pushComponentService');
// 导入拆分出去的pushPluginService模块
const pushPluginService = require('./pushPluginService');

// 日志级别枚举
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN', 
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// 日志颜色
const COLORS = {
  ERROR: '\x1b[31m', // 红色
  WARN: '\x1b[33m',  // 黄色
  INFO: '\x1b[36m',  // 青色
  DEBUG: '\x1b[32m', // 绿色
  RESET: '\x1b[0m'   // 重置
};

// 错误码映射配置 - 用于识别和分类不同类型的错误消息
const ERROR_CODE_MAPPING = {
  // 系统提示类（降级为警告）
  SYSTEM_NOTICES: [
    '提示信息',
    '系统提示',
    '未查询到该自定义函数' // 将查询不到函数的错误视为系统提示，允许继续创建流程
  ],
  
  // 错误类型映射
  ERROR_TYPES: {
    PERMISSION_DENIED: ['权限不足', '无权限', 'permission denied'],
    VALIDATION_ERROR: ['参数错误', '验证失败', '格式错误', 'invalid'],
    NOT_FOUND: ['不存在', '未找到', 'not found'],
    NETWORK_ERROR: ['网络错误', '连接失败', 'timeout', 'connection'],
    SERVER_ERROR: ['服务器错误', 'internal error', '500'],
    DUPLICATE_ERROR: ['已存在', '重复', 'duplicate', 'already exists']
  }
};

// 错误处理工具
const errorHandler = {
  /**
   * 判断错误是否为系统提示类错误（应降级为警告）
   * @param {string} errorMessage - 错误消息
   * @returns {boolean} 是否为系统提示
   */
  isSystemNotice: (errorMessage) => {
    if (!errorMessage) return false;
    const lowerMessage = errorMessage.toLowerCase();
    return ERROR_CODE_MAPPING.SYSTEM_NOTICES.some(notice => 
      lowerMessage.includes(notice.toLowerCase())
    );
  },
  
  /**
   * 获取错误类型
   * @param {string} errorMessage - 错误消息
   * @returns {string} 错误类型
   */
  getErrorType: (errorMessage) => {
    if (!errorMessage) return 'UNKNOWN_ERROR';
    const lowerMessage = errorMessage.toLowerCase();
    
    for (const [errorType, keywords] of Object.entries(ERROR_CODE_MAPPING.ERROR_TYPES)) {
      if (keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()))) {
        return errorType;
      }
    }
    
    return 'UNKNOWN_ERROR';
  },
  
  /**
   * 处理API响应中的错误
   * @param {Object} response - API响应对象
   * @param {string} operation - 操作名称
   * @returns {Object} 处理后的结果 { isError, errorType, message }
   */
  handleApiError: (response, operation = '操作') => {
    // 添加详细的调试日志
    logger.debug(`handleApiError 被调用，response: ${JSON.stringify(response, null, 2)}`);
    logger.debug(`handleApiError 被调用，response类型: ${typeof response}`);
    logger.debug(`handleApiError 被调用，operation: ${operation}`);
    
    if (!response) {
      logger.error(`${operation}失败: 无效的响应对象`);
      return {
        isError: true,
        errorType: 'INVALID_RESPONSE',
        message: '无效的响应对象'
      };
    }
    
    if (response.Result && response.Result.StatusCode !== 0) {
      // StatusCode不为0，检查是否是特殊错误
      const errorMessage = response.Result?.FailureMessage || response.Error?.Message || '未知错误';
      
      // 特殊处理：将"未查询到该自定义函数"视为系统提示，允许继续创建流程
      if (errorHandler.isSystemNotice(errorMessage) || errorMessage.includes('未查询到该自定义函数')) {
        // 降级为警告
        logger.warn(`系统提示: ${errorMessage}`);
        return {
          isError: false,
          errorType: 'SYSTEM_NOTICE',
          message: errorMessage
        };
      }
      
      // 其他错误确认为错误
      const errorType = errorHandler.getErrorType(errorMessage);
      
      logger.error(`${operation}失败 [${errorType}]: ${errorMessage}`);
      return {
        isError: true,
        errorType,
        message: errorMessage
      };
    } else if (response?.Error?.Message) {
      // StatusCode为0但有Error，检查是否为系统提示或令牌升级提示
      const errorMessage = response.Error.Message;
      
      // 仅保留系统提示检查，令牌升级提示由api.js统一处理
      if (errorHandler.isSystemNotice(errorMessage)) {
        // 系统提示或令牌升级提示降级为警告
        logger.warn(`系统提示: ${errorMessage}`);
        return {
          isError: false,
          errorType: 'SYSTEM_NOTICE',
          message: errorMessage
        };
      } else {
        // 其他错误仍作为错误处理
        const errorType = errorHandler.getErrorType(errorMessage);
        logger.error(`${operation}发生错误 [${errorType}]: ${errorMessage}`);
        return {
          isError: true,
          errorType,
          message: errorMessage
        };
      }
    }
    
    // 没有错误
    return {
      isError: false,
      errorType: null,
      message: null
    };
  }
};

// 获取当前时间戳
const getTimestamp = () => {
  return new Date().toISOString().replace('T', ' ').substring(0, 23);
};

// 带颜色的日志输出
const logWithColor = (level, message, module = 'pushService') => {
  const timestamp = getTimestamp();
  const color = COLORS[level] || COLORS.RESET;
  console.log(`${color}[${timestamp}] [${module}] [${level}] ${message}${COLORS.RESET}`);
};

// 简化的日志函数 - 默认只输出ERROR和WARN级别，保持输出简洁
const logger = {
  error: (message, module) => logWithColor(LOG_LEVELS.ERROR, message, module),
  warn: (message, module) => logWithColor(LOG_LEVELS.WARN, message, module),
  info: (message, module) => {}, // 禁用INFO级别日志
  debug: (message, module) => {} // 禁用DEBUG级别日志
};

// 导入ConfigManager并初始化
const { getConfigManager } = require('../core/ConfigManager');
const configManager = getConfigManager();

// 获取证书数据 - 优先从项目根目录的certificate.json读取，与extension行为保持一致
const getCertificateData = async () => {
  try {
    const fs = require('fs-extra');
    const path = require('path');
    
    // 1. 优先尝试从项目根目录的certificate.json文件读取，这与extension的行为完全一致
    const certificateJsonPath = path.join(process.cwd(), 'certificate.json');
    if (await fs.pathExists(certificateJsonPath)) {
      logger.info(`从项目根目录的certificate.json读取证书信息`);
      const certData = await fs.readJSON(certificateJsonPath);
      return {
        domain: certData.domain || 'https://www.fxiaoke.com',
        certificate: certData.certificate || ''
      };
    }
    
    // 2. 如果没有certificate.json，再尝试从configManager获取
    logger.info(`未找到certificate.json，尝试从configManager获取认证信息`);
    // 使用configManager的get方法获取auth信息
    const authInfo = await configManager.get('auth') || {};
    return {
      domain: authInfo.domain || 'https://www.fxiaoke.com',
      certificate: authInfo.certificate || ''
    };
  } catch (error) {
    logger.error(`获取认证信息失败: ${error.message}`);
    // 返回默认配置
    return {
      domain: 'https://www.fxiaoke.com',
      certificate: ''
    };
  }
};

// 获取函数代码 - 从URL中提取函数代码
const getFuncCodes = (url) => {
  const menuCodeMap = {
    Component: ["customcomponent/=/module-component"],
    Plugin: ["customplugins/=/module-plugins"],
    FUNC: ["crmmanage/=/module-myfunction"],
    CompBuild: [
      "customcomponent/=/module-component",
      "customplugins/=/module-plugins"
    ],
    FSC: [
      "customcomponent/=/module-component",
      "customplugins/=/module-plugins"
    ],
    NCRM: [
      "customcomponent/=/module-component",
      "customplugins/=/module-plugins",
      "crmmanage/=/module-myfunction"
    ]
  };
  const code = Object.keys(menuCodeMap).find((key) => url.includes(key));
  if (!code) return [];
  return menuCodeMap[code];
};

// 将base64字符串转换为普通字符串
const base64ToStr = (text) => {
  return CryptoJS.enc.Base64.parse(text).toString(CryptoJS.enc.Utf8);
};

// 加密字符串
const encrypt = (text) => {
  const token = '9Uip/owR+824m03Vzo2ECoJuLlXom6HrvBs+ykiQkN0=';
  const iv = 'jwNz4Ia8OHVpPyEXIQjJ2g==';
  return CryptoJS.enc.Base64.stringify(
    CryptoJS.AES.encrypt(text, CryptoJS.enc.Base64.parse(token), {
      iv: CryptoJS.enc.Base64.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    }).ciphertext
  );
};

// 获取刷新令牌
const fetchRefreshToken = async () => {
  const certificateData = await getCertificateData();
  
  if (!certificateData.domain) {
    logger.error('未配置服务域名');
    throw new Error('未配置服务域名');
  }
  
  if (!certificateData.certificate) {
    logger.error('未配置认证证书');
    throw new Error('未配置认证证书');
  }
  
  try {
    let jsonStr;
    
    // 检查证书数据格式
    if (certificateData.certificate.startsWith('eyJhbGciOi')) {
      // 如果已经是JWT令牌，直接使用
      jsonStr = certificateData.certificate;
    } else {
      // 否则尝试base64解码
      jsonStr = base64ToStr(certificateData.certificate);
      
      // 检查解码后是否是JSON字符串
        if (jsonStr.startsWith('{')) {
          let jsonObj = JSON.parse(jsonStr);
          jsonObj.expiredTime = +new Date() + 60 * 60 * 1000; // 设置过期时间为1小时后
          jsonStr = JSON.stringify(jsonObj);
          jsonStr = encrypt(jsonStr);
        } else {
          // 如果不是JSON字符串，直接使用原证书
          jsonStr = certificateData.certificate;
        }
    }
    
    // 使用Promise封装request.post
    return new Promise((resolve, reject) => {
      request.post({
        url: `${certificateData.domain}/FHH/EMDHFUNC/token/refreshToken`,
        headers: {
          "x-fs-develop-token": jsonStr
        },
        body: '{}'
      }, (err, httpResponse, body) => {
        if (err) {
          logger.error(`刷新令牌请求失败: ${err.message}`);
          reject(err);
        } else {
          try {
            const res = JSON.parse(body);
            if (res.Result.StatusCode == 0) {
              resolve(res.Value);
            } else {
              logger.error(`刷新令牌失败: ${res.Result.FailureMessage}`);
              reject(new Error(res.Result.FailureMessage || '刷新令牌失败'));
            }
          } catch (parseError) {
            logger.error(`解析刷新令牌响应失败: ${parseError.message}`);
            reject(parseError);
          }
        }
      });
    });
  } catch (error) {
    logger.error('刷新令牌过程中发生错误:', error.message);
    // 如果刷新令牌失败，直接使用原证书
    return certificateData.certificate;
  }
};

// 替换本地post函数为api模块的post函数，确保API调用方式与extension完全一致
const post = api.post;

/**
 * 根据路径和类型推送代码
 * @param {string} targetPath - 目标路径（组件/插件目录、函数目录或类目录）
 * @param {string} type - 类型：component、plugin、function或class
 * @param {string} singleFilePath - 单个文件路径（可选，用于推送单个文件）
 * @returns {Promise<Object>} 推送结果
 */
/**
 * 推送组件/插件
 * @param {string} targetPath - 目标路径
 * @param {string} type - 类型：component/plugin/class/function
 * @param {string} singleFilePath - 单个文件路径（可选）
 * @returns {Promise<Object>} 推送结果
 */
const pushByType = async (targetPath, type, singleFilePath = null) => {
  try {
    // 根据类型调用不同的推送函数
    if (type === 'component') {
      // 移除isNewComponent参数，实现智能判断
      return await pushComponentService.pushComponent(targetPath, type, singleFilePath);
    } else if (type === 'plugin') {
      // 修复参数传递问题，确保type参数正确传递
      return await pushPluginService.pushPlugin(targetPath, type, singleFilePath);
    } else if (type === 'class') {
      return await pushClassService.pushClass(targetPath, singleFilePath);
    } else if (type === 'function') {
      return await pushFunctionService.pushFunction(targetPath, singleFilePath);
    } else {
      throw new Error(`不支持的类型: ${type}`);
    }
  } catch (error) {
    logger.error(`推送${type}失败: ${error.message}`);
    throw error;
  }
};

/**
 * 部署指定的代码
 * @param {string} targetPath - 目标路径
 * @param {string} type - 类型
 * @param {string} env - 环境
 * @returns {Promise<Object>} 部署结果
 */
const deployByType = async (targetPath, type, env = 'dev') => {
  logger.info(`根据类型部署: ${type}`);
  if (type === 'component') {
    return await pushComponentService.deployComponent(targetPath, type, env);
  } else if (type === 'plugin') {
    return await pushPluginService.deployPlugin(targetPath, env);
  } else if (type === 'function') {
    // 函数可能需要特殊的部署逻辑
    logger.info(`部署函数到${env}环境...`);
    const pushResult = await pushFunctionService.pushFunction(targetPath);
    logger.info(`函数部署到${env}环境成功!`);
    return {
      success: true,
      name: pushResult.name,
      id: pushResult.id,
      env: env,
      message: '函数部署成功'
    };
  } else {
    logger.error(`不支持的类型: ${type}`);
    throw new Error(`不支持的类型: ${type}`);
  }
};

/**
 * 准备单个文件的文件树
 * @param {string} sourceDir - 源代码根目录
 * @param {string} singleFilePath - 单个文件的完整路径
 * @param {string} relativePath - 相对于源代码根目录的路径
 * @returns {Promise<Array>} 文件树数组
 */
const prepareSingleFileTree = async (sourceDir, singleFilePath, relativePath) => {
  const fileContent = await readFileContent(singleFilePath);
  const fileStats = await fs.stat(singleFilePath);
  
  return [{
    fileName: path.basename(singleFilePath),
    filePath: relativePath,
    fileSize: fileStats.size,
    content: fileContent
  }];
};

module.exports = {
  pushComponent: pushComponentService.pushComponent,
  buildComponent: api.buildComponent,
  deployComponent: pushComponentService.deployComponent,
  pushByType,
  deployByType,
  pushFunctionService,
  pushClassService,
  pushComponentService,
  pushPluginService
};