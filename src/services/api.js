/**
 * API服务模块
 * 封装与纷享销客服务的API调用
 */

const requestLib = require('request');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');
const { getConfigManager } = require('../core/ConfigManager');
const { logger } = require('../core/Logger');

// Refresh token 相关变量
let _refreshToken = '';
let _refreshTokenTime = -Infinity;
const configManager = getConfigManager();

/**
 * 生成唯一的traceId，与extension保持一致的格式
 * @returns {string} traceId
 */
const generateTraceId = () => {
  return `fx-cli-${Date.now()}`;
};

/**
 * 生成完整的URL，与extension的http.js保持完全一致
 * @param {string} endpoint - API端点
 * @param {Object} authInfo - 认证信息
 * @returns {string} 完整的URL
 */
const getFullUrl = (endpoint, authInfo) => {
  let baseUrl = authInfo.domain;
  
  // 确保baseUrl以http或https开头
  if (!baseUrl.startsWith('http')) {
    baseUrl = `https://${baseUrl}`;
  }
  
  // 确保baseUrl不以/结尾
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  // 确保endpoint以/开头
  if (!endpoint.startsWith('/')) {
    endpoint = `/${endpoint}`;
  }
  
  // 参照extension实现，确保正确添加/FHH前缀
  if (!endpoint.startsWith('/FHH/')) {
    endpoint = `/FHH${endpoint}`;
  }
  
  // 直接返回基础URL和端点的组合，不进行路径替换
  // 路径替换将在添加traceId后进行
  
  return `${baseUrl}${endpoint}`;
}

/**
 * 获取证书信息
 * @returns {Object} 证书信息
 */
const getCertificate = async () => {
  try {
    // 直接从配置管理器获取认证信息
    let certificateData = await configManager.getAuthInfo() || {};
    
    // 确保domain字段存在
    if (!certificateData.domain) {
      certificateData.domain = 'https://www.fxiaoke.com';
    }
    if (certificateData && certificateData.domain && certificateData.certificate) {
      return certificateData;
    }
    
    throw new Error('认证信息未找到，请检查config.json配置');
  } catch (error) {
    // 禁用控制台错误输出，保持进度条显示简洁
    // 使用logger记录错误，不会输出到控制台
    logger.error('获取认证信息失败:', error.message);
    throw error;
  }
};

/**
 * 将base64字符串转换为普通字符串
 * @param {string} text - base64编码的字符串
 * @returns {string} 解码后的字符串
 */
const base64ToStr = (text) => {
  return CryptoJS.enc.Base64.parse(text).toString(CryptoJS.enc.Utf8);
};

/**
 * 加密字符串
 * @param {string} text - 要加密的字符串
 * @returns {string} 加密后的字符串
 */
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

/**
 * 获取刷新令牌
 * @returns {Promise<string>} 新的令牌
 */
const fetchRefreshToken = async () => {
  const certificateData = await getCertificate();
  
  if (!certificateData.domain) {
    throw new Error('未配置服务域名');
  }
  
  if (!certificateData.certificate) {
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
    
    const response = await post('/FHH/EMDHFUNC/token/refreshToken', {}, {
      headers: {
        "x-fs-develop-token": jsonStr
      }
    });
    
    if (response.data.Result.StatusCode === 0) {
      return response.data.Value;
    } else {
      throw new Error(response.data.Result.FailureMessage || '刷新令牌失败');
    }
  } catch (error) {
    logger.error('刷新令牌失败:', error.message);
    // 如果刷新令牌失败，直接使用原证书
    return certificateData.certificate;
  }
};

/**
 * 执行HTTP请求
 * @param {string} method - HTTP方法
 * @param {string} endpoint - API端点
 * @param {Object} data - 请求数据
 * @param {Object} authInfo - 认证信息
 * @returns {Promise<Object>} 响应结果
 */
const request = async (method, endpoint, data = {}, certificate = null) => {
  // 尝试获取认证信息，但不强制要求
  let authCert = certificate || {};
  if (Object.keys(authCert).length === 0) {
    try {
      authCert = await getCertificate();
    } catch (err) {
      // 静默处理，继续尝试
    }
  }
  
  // 检查certificate是否包含JSON字符串，如果是则解析它
  if (authCert.certificate && typeof authCert.certificate === 'string') {
    try {
      // 尝试解析JSON字符串
      if (authCert.certificate.startsWith('{')) {
        const parsedCert = JSON.parse(authCert.certificate);
        // 如果解析成功，更新certificate对象
        if (parsedCert.domain && parsedCert.certificate) {
          authCert = parsedCert;
        }
      }
    } catch (parseError) {
      // 解析失败，保持原样
    }
  }
  
  // 构建完整URL，与extension的http.js保持完全一致
  let url = endpoint;
  let processedEndpoint = endpoint;
  
  // 确保endpoint以/开头
  if (!processedEndpoint.startsWith('/')) {
    processedEndpoint = `/${processedEndpoint}`;
  }
  
  // 参照extension实现，确保正确添加/FHH前缀
  if (!processedEndpoint.startsWith('/FHH/')) {
    processedEndpoint = `/FHH${processedEndpoint}`;
  }
  
  // 构建基础URL（包含traceId）
  const traceId = `fx-cli-${+new Date()}`;
  
  if (authCert.domain) {
    // 确保域名有正确的协议前缀
    const baseUrl = authCert.domain.startsWith('http://') || authCert.domain.startsWith('https://') 
      ? authCert.domain 
      : `https://${authCert.domain}`;
    
    url = `${baseUrl}${processedEndpoint}?traceId=${traceId}`;
  } else {
    // 如果没有域名，抛出错误而不是使用?MDH
    throw new Error('未配置服务域名');
  }
  
  // 将EM9H替换为EMDH
  url = url.replace(/EM9H/g, "EMDH");
  
  logger.debug(`API请求URL: ${url}`);
  
  // 设置请求头，直接使用原始证书，与extension保持一致
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': authCert.certificate || ''
  };
  
  // 进行权限检查，与extension完全一致
  if (authCert.certificate) {
    await fetchCheckPermission(url, authCert);
  }
  
  return new Promise((resolve, reject) => {
    // 与extension的http.js完全一致：将json属性直接设置为要发送的数据对象
    const options = {
      url,
      method,
      headers,
      json: data
    };
    
    // 添加请求体内容的日志输出
    logger.debug(`请求体内容: ${JSON.stringify(data)}`);
    
    requestLib(options, (err, httpResponse, body) => {
      if (err) {
        logger.error(`API请求失败: ${err.message}`);
        reject(err);
      } else {
        try {
          // 检查body是否是字符串，如果是，尝试解析为JSON
          let responseBody = body;
          if (typeof body === 'string') {
            try {
              responseBody = JSON.parse(body);
            } catch (jsonError) {
              // 如果解析失败，仍然使用原始字符串
              logger.debug(`API响应不是有效的JSON: ${body}`);
            }
          }
          
          // 检查响应中是否包含"需要升级令牌"的错误信息
          if (responseBody && responseBody.Error && responseBody.Error.Message && 
              responseBody.Error.Message.includes('需要升级令牌')) {
            logger.warn(`⚠️ 令牌需要升级，但操作将继续执行`);
          }
          
          // 与extension完全一致：检查StatusCode是否等于0，如果不等于0，抛出错误
          // extension的http.js实现：if (body.Result.StatusCode === 0) { resolve(body) } else { reject() }
          if (responseBody.Result && responseBody.Result.StatusCode !== 0) {
            const errorMessage = responseBody.Result.FailureMessage || 'API请求失败';
            logger.error(`API请求失败: ${url} Error: ${errorMessage}`);
            reject(new Error(errorMessage));
          } else {
            resolve(responseBody);
          }
        } catch (error) {
          logger.error(`处理API响应失败: ${error.message}`);
          logger.debug(`原始响应: ${body}`);
          reject(error);
        }
      }
    });
  });
};

/**
 * 权限检查函数，与extension保持一致
 * @param {string} url - 请求URL
 * @param {Object} certificateData - 证书数据
 * @returns {Promise<void>}
 */
const fetchCheckPermission = (url, certificateData) => {
  return new Promise((resolve) => {
    if (!certificateData || !certificateData.domain) {
      // 使用logger.warn代替console.warn，避免干扰进度条显示
      logger.warn('未提供证书信息，跳过权限检查');
      resolve();
      return;
    }
    
    const checkUrl = `${certificateData.domain}/FHH/EMDHFUNC/runtime/checkPermission?fx-cli-${+new Date()}`;
    
    requestLib.post({
      url: checkUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: certificateData.certificate
      },
      body: JSON.stringify({
        funcCodes: getFuncCodes(url)
      })
    }, (err, httpResponse, body) => {
      if (err) {
        logger.error(`权限检查请求失败: ${err.message}`);
        logger.debug(`权限检查请求URL: ${checkUrl}`);
        // 权限检查失败不应该阻止后续请求
        resolve();
      } else {
        try {
          const res = JSON.parse(body);
          if (res && res.Result && res.Result.StatusCode == 0) {
            if (res?.Error && !res.Value) {
              // 检查是否是"需要升级令牌"的错误
              if (res.Error?.Message && res.Error.Message.includes('需要升级令牌')) {
                logger.warn(`⚠️ 权限检查提示: 需要升级令牌，但操作将继续执行`);
              } else {
                logger.error(`权限检查错误: ${res.Error?.Message || '未知错误'}`);
              }
              // 权限检查错误不应该阻止后续请求
              resolve();
            } else {
              resolve(res.Value);
            }
          } else if (res && res.Result) {
            logger.error(`权限检查失败: ${res.Result.FailureMessage || '未知错误'}`);
            // 权限检查失败不应该阻止后续请求
            resolve();
          } else {
            logger.error(`权限检查失败: 无效的响应格式`);
            // 无效响应也不应该阻止后续请求
            resolve();
          }
        } catch (parseError) {
          logger.error(`解析权限检查响应失败: ${parseError.message}`);
          logger.debug(`原始响应: ${body}`);
          // 解析失败不应该阻止后续请求
          resolve();
        }
      }
    });
  });
};

// 别名以兼容现有代码
const checkPermission = fetchCheckPermission;

const getFuncCodes = (url) => {
  const menuCodeMap = {
    'Component': ['customcomponent/=/module-component'],
    'Plugin': ['customplugins/=/module-plugins'],
    'FUNC': ['crmmanage/=/module-myfunction'],
    'CompBuild': [
      'customcomponent/=/module-component',
      'customplugins/=/module-plugins'
    ],
    'FSC': [
      'customcomponent/=/module-component',
      'customplugins/=/module-plugins'
    ],
    'NCRM': [
      'customcomponent/=/module-component',
      'customplugins/=/module-plugins',
      'crmmanage/=/module-myfunction'
    ]
  };
  
  const code = Object.keys(menuCodeMap).find(key => url.includes(key));
  // 当url为空或不匹配任何关键字时，返回一个默认的功能代码列表
  return code ? menuCodeMap[code] : ['customcomponent/=/module-component'];
};

// 权限验证功能已实现

/**
 * 执行POST请求
 * @param {string} endpoint - API端点
 * @param {Object} data - 请求数据
 * @param {Object} certificateData - 证书数据
 * @returns {Promise<Object>} 响应结果
 */
const post = async (endpoint, data = {}, certificateData = null) => {
  let requestEndpoint = endpoint;
  // 确保路径格式正确
  if (!requestEndpoint.startsWith('/FHH/')) {
    requestEndpoint = `/FHH${requestEndpoint}`;
  }
  
  try {
    // 直接使用endpoint，由request函数处理traceId和路径替换
    return await request('post', requestEndpoint, data, certificateData);
  } catch (error) {
    // 禁用控制台错误输出，保持进度条显示简洁
    // 使用logger记录错误，不会输出到控制台
    logger.error(`API调用失败 [${requestEndpoint}]:`, error.message || error);
    throw error;
  }
};

/**
 * 执行GET请求
 * @param {string} endpoint - API端点
 * @param {Object} params - 查询参数
 * @param {Object} certificateData - 证书数据
 * @returns {Promise<Object>} 响应结果
 */
const get = async (endpoint, params = {}, certificateData = null) => {
  let requestEndpoint = endpoint;
  // 确保路径格式正确
  if (!requestEndpoint.startsWith('/')) {
    requestEndpoint = '/' + requestEndpoint;
  }
  
  try {
    return await request('get', requestEndpoint, params, certificateData);
  } catch (error) {
    // 禁用控制台错误输出，保持进度条显示简洁
    // 使用logger记录错误，不会输出到控制台
    logger.error(`API调用失败 [${requestEndpoint}]:`, error.message || error);
    throw error;
  }
};

/**
 * 用户登录
 * @param {string} domain - 服务器域名
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<Object>} 登录结果
 */
const login = async (domain, username, password) => {
  try {
    // 构建请求URL
    let baseUrl = domain.endsWith('/') ? domain : `${domain}/`;
    if (!baseUrl.includes('://')) {
      baseUrl = `https://${baseUrl}`;
    }
    // 将EM9H替换为EMDH
    const url = `${baseUrl}FHH/EMDHCompBuild/VscodeExtension/login`;
    
    // 构建请求数据
    const data = {
      username,
      password,
      traceId: generateTraceId()
    };
    
    // 构建请求头
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // 执行登录请求
    const response = await axios.post(url, data, { headers, timeout: 15000 });
    
    if (response.data && response.data.success) {
      return {
        token: response.data.token || response.data.certificate,
        userInfo: response.data.userInfo || { username }
      };
    } else {
      throw new Error(response.data.message || '登录失败');
    }
  } catch (error) {
    if (error.response) {
      throw new Error(`登录失败: ${error.response.data.message || '用户名或密码错误'}`);
    }
    throw new Error(`登录失败: ${error.message}`);
  }
};

/**
 * 验证令牌有效性
 * @param {string} token - 认证令牌
 * @returns {Promise<boolean>} 是否有效
 */
const validateToken = async (token) => {
  try {
    const authInfo = await configManager.getAuthInfo();
    if (!authInfo || !authInfo.domain) {
      return false;
    }
    
    // 将EM9H替换为EMDH
    const endpoint = '/EMDHCompBuild/VscodeExtension/validateToken';
    const data = {
      token,
      traceId: generateTraceId()
    };
    
    // 直接使用axios避免循环依赖
    const url = getFullUrl(endpoint, authInfo);
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': token
    };
    
    const response = await axios.post(url, data, { headers, timeout: 10000 });
    return response.data && response.data.success;
  } catch (error) {
    return false;
  }
};

// fetchCheckPermission函数已在文件上方定义（权限检查实现）

/**
 * 获取组件/插件列表
 * @param {string} type - 类型：component或plugin
 * @returns {Promise<Object>} 组件/插件列表
 */
const fetchComponents = async (type = 'component', apiName = '') => {
  try {
    // 详细日志记录
    logger.debug(`正在获取${type === 'component' ? '组件' : '插件'}数据，apiName: "${apiName}"...`);
    
    // 直接从配置管理器获取认证信息
    let certificateData = await configManager.getAuthInfo() || {};
    
    // 确保domain字段存在
    if (!certificateData.domain) {
      certificateData.domain = 'https://www.fxiaoke.com';
    }
    
    // 关键修复：使用正确的EMDH路径而不是EM9H
    // extension代码中会将EM9H替换为EMDH，但我们直接使用正确的路径
    const endpoint = '/FHH/EMDHCompBuild/VscodeExtension/downloadCode';
    
    // 简化请求参数，与extension实现保持一致
    const data = {
      type: String(type || 'component'),
      apiName: String(apiName || '')
    };
    
    logger.debug('发送请求参数:', JSON.stringify(data));
    
    // 直接使用axios发送请求，确保与extension行为一致
    // 参照extension的http.js实现
    const traceId = `fx-cli-${+new Date()}`;
    const fullUrl = `${certificateData.domain || 'https://www.fxiaoke.com'}${endpoint}?traceId=${traceId}`;
    
    logger.debug(`准备直接发送请求到: ${fullUrl}`);
    logger.debug(`请求头: Authorization=${certificateData.certificate ? '***证书已提供***' : '未提供'}`);
    
    // 进行权限检查，与extension完全一致
    await fetchCheckPermission(fullUrl, certificateData);
    
    const response = await axios({
      method: 'post',
      url: fullUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': certificateData.certificate || ''
      },
      data: data,
      timeout: 30000
    }).then(res => res.data);
    
    // 详细记录响应 - 打印完整响应结构
    logger.debug('收到API响应，完整响应数据:');
    logger.debug('响应类型:', typeof response);
    logger.debug('响应键:', response ? Object.keys(response).join(', ') : 'undefined');
    logger.debug('Result:', response ? JSON.stringify(response.Result) : 'undefined');
    logger.debug('Error:', response ? JSON.stringify(response.Error) : 'undefined');
    logger.debug('Value:', response && response.Value ? JSON.stringify(response.Value).substring(0, 500) + '...' : 'undefined');
    
    // 注意：令牌升级警告已在request函数中统一处理，这里不再重复处理
    
    // 确保全局Fx对象存在
    if (!global.Fx) {
      global.Fx = {};
    }
    
    // 参照extension实现，处理响应和设置全局变量
    let components = [];
    if (response && response.Value && response.Value.components) {
      components = response.Value.components;
      logger.debug(`从Value.components获取到${components.length}个${type === 'component' ? '组件' : '插件'}`);
      
      // 使用与extension相同的小写全局变量名
      if (type === 'component') {
        global.Fx.components = components;
        logger.debug('已设置全局.Fx.components，与extension保持一致');
      } else {
        global.Fx.plugins = components;
        logger.debug('已设置全局.Fx.plugins，与extension保持一致');
      }
    } else {
      logger.debug('未从响应中找到components数据');
      // 如果没有找到components，尝试使用其他可能的数据结构
      if (response && response.Value) {
        if (Array.isArray(response.Value)) {
          components = response.Value;
          logger.debug(`从Value数组获取到${components.length}个${type === 'component' ? '组件' : '插件'}`);
        } else {
          components = [response.Value];
          logger.debug('尝试将Value作为单个组件/插件');
        }
      }
    }
    
    // 过滤出有效的组件
    const validComponents = components.filter(comp => comp && (comp.apiName || comp.api_code) && (comp.name || comp.label));
    logger.debug(`过滤后有效${type === 'component' ? '组件' : '插件'}数量: ${validComponents.length}`);
    
    return validComponents;
  } catch (error) {
    // 禁用控制台错误输出，保持进度条显示简洁
    // 使用logger记录错误，不会输出到控制台
    logger.error('获取组件/插件数据失败:', error.message);
    logger.debug('错误详情:', error.stack);
    throw error;
  }
};

// 权限验证功能已在文件末尾实现

/**
 * 上传组件/插件 - 完全复制extension的实现
 * @param {Object} params - 组件/插件参数
 * @returns {Promise<Object>} 上传结果
 */
/**
 * 上传单个文件
 * @param {string} filePath - 本地文件的绝对路径
 * @returns {Promise<Object>} 上传结果，包含TempFileName
 */
const uploadFile = async (filePath) => {
  try {
    const fileName = path.basename(filePath);
    const content = await fs.promises.readFile(filePath, 'utf8');
    const base64String = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(content));
    
    logger.debug('开始上传文件:', fileName);
    logger.debug('API路径:', '/FHH/EMDHCompBuild/VscodeExtension/uploadFile');
    logger.debug('请求数据:', { fileName, base64String });
     const uploadResult = await post('/FHH/EMDHCompBuild/VscodeExtension/uploadFile', { fileName, base64String });
     logger.debug('上传结果:', uploadResult);
    
    // 根据服务器返回的格式提取TempFileName或nPath
    if (uploadResult.Value && uploadResult.Value.TempFileName) {
      return uploadResult.Value;
    } else if (uploadResult.TempFileName) {
      return uploadResult;
    } else if (uploadResult.Value && uploadResult.Value.nPath) {
      // 处理服务器返回nPath的情况
      return { TempFileName: uploadResult.Value.nPath };
    } else {
      // 禁用控制台警告输出，保持进度条显示简洁
      logger.warn('未找到TempFileName或nPath，返回完整响应:', uploadResult);
      return uploadResult;
    }
  } catch (error) {
    // 禁用控制台错误输出，保持进度条显示简洁
    logger.error('上传文件失败:', error.message);
    logger.debug('错误详情:', error.response?.data || error);
    throw error;
  }
};

/**
 * 从内容上传单个文件（用于GitHub推送）
 * @param {string} fileName - 文件名
 * @param {string} content - 文件内容
 * @returns {Promise<Object>} 上传结果，包含TempFileName
 */
const uploadFileFromContent = async (fileName, content) => {
  try {
    const base64String = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(content));
    
    logger.debug('开始上传文件（从内容）:', fileName);
    const uploadResult = await post('/FHH/EMDHCompBuild/VscodeExtension/uploadFile', { fileName, base64String });
    logger.debug('上传结果:', uploadResult);
    
    // 根据服务器返回的格式提取TempFileName或nPath
    if (uploadResult.Value && uploadResult.Value.TempFileName) {
      return uploadResult.Value;
    } else if (uploadResult.TempFileName) {
      return uploadResult;
    } else if (uploadResult.Value && uploadResult.Value.nPath) {
      return { TempFileName: uploadResult.Value.nPath };
    } else {
      // 禁用控制台警告输出，保持进度条显示简洁
      logger.warn('未找到TempFileName或nPath，返回完整响应:', uploadResult);
      return uploadResult;
    }
  } catch (error) {
    // 禁用控制台错误输出，保持进度条显示简洁
    logger.error('上传文件失败（从内容）:', error.message);
    logger.debug('错误详情:', error.response?.data || error);
    throw error;
  }
};

/**
 * 上传组件/插件
 */
const uploadComponent = (params = {}) => {
  return request('post', '/FHH/EMDHCompBuild/VscodeExtension/uploadCode', { component: params });
};

/**
 * 构建组件
 * @param {string} apiName - 组件API名称
 * @returns {Promise<Object>} 构建结果，包含buildId
 */
const buildComponent = async (apiName) => {
  return await post('/FHH/EMDHCompBuild/Component/AsynBuildComponent', { apiName });
};

/**
 * 获取构建结果
 * @param {string} buildId - 构建ID
 * @returns {Promise<Object>} 构建结果
 */
const getBuildResult = async (buildId) => {
  const endpoint = '/EMDHCompBuild/VscodeExtension/getBuildResult';
  const data = { buildId };
  return post(endpoint, data);
};

/**
 * 参照fs-cli实现，获取函数/类信息
 * @param {Object} params - 查询参数，包含function_name等
 * @returns {Promise<Object>} 函数/类信息
 */
const fetchFunctionInfo = async (params = {}, certificateData = null) => {
  try {
    // 确保参数格式正确，使用pageNum而不是pageNumber
    const formattedParams = { ...params };
    if (formattedParams.pageNumber && !formattedParams.pageNum) {
      formattedParams.pageNum = formattedParams.pageNumber;
      delete formattedParams.pageNumber;
    }
    
    logger.debug('正在查询函数/类信息，参数:', JSON.stringify(formattedParams));
    const response = await post('/FHH/EMDHFUNC/biz/find', formattedParams, certificateData);
    
    // 错误处理和数据验证
    if (response.Result && response.Result.StatusCode) {
      // 禁用控制台错误输出，保持进度条显示简洁
      logger.error('查询函数/类失败:', response.Result.FailureMessage || '未知错误');
      throw new Error(response.Result.FailureMessage || '查询函数/类失败');
    }
    
    logger.debug('查询函数/类成功，返回数据类型:', response.Value ? Array.isArray(response.Value) ? 'array' : typeof response.Value : 'undefined');
    return response;
  } catch (error) {
    // 禁用控制台错误输出，保持进度条显示简洁
    logger.error('查询函数/类时发生错误:', error.message);
    // 参照fs-cli实现，如果查询失败，返回包含空items的响应
    return { Result: { StatusCode: 0 }, Value: { items: [] } };
  }
};

/**
 * 参照fs-cli实现，同步函数/类信息（获取列表）
 * @param {Object} params - 查询参数，包含type(class/function)、pageNumber、pageSize等
 * @returns {Promise<Object>} 函数/类列表
 */
const syncFunction = async (params = {}, certificateData = null) => {
  try {
    // 默认参数设置
    const defaultParams = {
      bindingObjectApiName: 'NONE',
      pageNumber: 1,
      pageSize: 2000,
      type: 'function' // 默认获取函数
    };
    
    const requestParams = { ...defaultParams, ...params };
    
    logger.debug('正在同步函数/类列表，参数:', JSON.stringify(requestParams));
    
    const response = await post('/FHH/EMDHFUNC/biz/download', requestParams, certificateData);
    
    // 注意："需要升级令牌"的错误信息已在request函数中处理并输出警告，这里不再重复处理
    
    // 错误处理和数据验证
    if (response.Result && response.Result.StatusCode) {
      // 禁用控制台错误输出，保持进度条显示简洁
      logger.error('获取函数/类列表失败:', response.Result.FailureMessage || '未知错误');
      throw new Error(response.Result.FailureMessage || '获取函数/类列表失败');
    }
    
    // 确保返回的数据结构包含list字段，与原始实现保持一致
    if (!response.Value) {
      response.Value = { list: [] };
    } else if (!response.Value.list) {
      if (Array.isArray(response.Value)) {
        response.Value = { list: response.Value };
      } else {
        response.Value.list = [];
      }
    }
    
    logger.debug('同步函数/类列表成功，list长度:', response.Value.list.length || 0);
    return response;
  } catch (error) {
    // 禁用控制台错误输出，保持进度条显示简洁
    logger.error('同步函数/类列表时发生错误:', error.message);
    // 参照fs-cli实现，如果获取失败，返回包含空list的成功响应，以便调用方可以继续执行
    return { Result: { StatusCode: 0 }, Value: { list: [] } };
  }
};

/**
 * 参照fs-cli实现，获取单个函数/类详情
 * @param {string} name - 函数/类名称
 * @param {string} type - 类型：function或class
 * @param {string} bindingObjectApiName - 绑定对象API名称
 * @returns {Promise<Object|null>} 函数/类详情
 */
const getSingleFunction = async (idOrName, type = 'function', bindingObjectApiName = 'NONE', certificateData = null) => {
  if (!idOrName) {
    throw new Error('函数/类ID或名称不能为空');
  }
  
  try {
    // 获取认证信息（如果没有提供）
    let authData = certificateData;
    if (!authData) {
      authData = await configManager.getAuthInfo() || {};
    }
    
    // 首先使用find API查询 - 使用与pushClassService一致的参数格式
    const findResponse = await fetchFunctionInfo({
      api_name: idOrName,  // 使用api_name而不是funcName，与类服务保持一致
      binding_object_api_name: bindingObjectApiName,  // 使用传入的bindingObjectApiName
      type: type  // 使用字符串类型：'function' 或 'class'
    }, authData);
    
    // 处理不同的响应格式
    let items = [];
    
    if (findResponse.Value) {
      if (Array.isArray(findResponse.Value)) {
        items = findResponse.Value;
      } else if (findResponse.Value.items) {
        items = findResponse.Value.items;
      } else if (findResponse.Value.list) {
        items = findResponse.Value.list;
      } else if (findResponse.Value.function) {
        // 处理新的数据结构：{ Value: { function: { ... } } }
        items = [findResponse.Value.function];
      } else {
        // 直接检查Value是否包含我们需要的数据
        items = [findResponse.Value];
      }
    }
    
    logger.debug('解析后的items数量:', items.length);
    if (items.length > 0) {
      logger.debug('第一个item的所有字段:', Object.keys(items[0]));
      logger.debug('第一个item的funcName:', items[0].funcName);
      logger.debug('第一个item的apiName:', items[0].apiName);
      logger.debug('第一个item的name:', items[0].name);
    }
    
    let targetItem = null;
    if (items.length > 0) {
      logger.debug('查找目标函数:', idOrName);
      logger.debug('items数量:', items.length);
      
      // 优先通过ID匹配，然后通过名称匹配，同时兼容funcId/funcName和apiName/name字段
      targetItem = items.find(item => {
        const match = item.funcId === idOrName || 
                     item.apiName === idOrName || 
                     item.funcName === idOrName || 
                     item.name === idOrName ||
                     item.api_name === idOrName || 
                     item.function_name === idOrName;
        if (match) {
          logger.debug('找到匹配项:', { funcId: item.funcId, apiName: item.apiName, funcName: item.funcName, api_name: item.api_name, function_name: item.function_name });
        }
        return match;
      });
      
      if (!targetItem) {
        logger.debug('未找到匹配项，所有item的apiName:', items.map(item => item.apiName));
        logger.debug('未找到匹配项，所有item的api_name:', items.map(item => item.api_name));
      }
    }
    
    if (targetItem) {
      // 检查targetItem是否已经包含完整的函数信息（包括body和parameters）
      if (targetItem && targetItem.body && targetItem.parameters) {
        logger.debug('find API已返回完整函数信息，无需调用download');
        logger.debug('targetItem的所有字段:', Object.keys(targetItem));
        logger.debug('targetItem的ID相关字段:', {
          id: targetItem.id,
          funcId: targetItem.funcId,
          api_name: targetItem.api_name,
          function_name: targetItem.function_name
        });
        return targetItem; // 直接返回find API的结果，避免调用download
      }
      
      // 使用download API获取完整内容
      logger.debug('准备下载函数详情，使用的ID:', targetItem.funcId || targetItem.id);
      const downloadResponse = await post('/FHH/EMDHFUNC/biz/download', {
        funcId: targetItem.funcId || targetItem.id,
        type: type  // 使用字符串类型：'function' 或 'class'
      }, authData);
      
      // 错误处理和数据验证
      if (downloadResponse.Result && downloadResponse.Result.StatusCode) {
        // 禁用控制台错误输出，保持进度条显示简洁
        logger.error('下载函数/类代码失败:', downloadResponse.Result.FailureMessage || '未知错误');
        throw new Error(downloadResponse.Result.FailureMessage || '下载函数/类代码失败');
      }
      
      // 直接返回响应数据，因为它已经包含了我们需要的所有信息
      // 适配不同的响应格式
      if (downloadResponse.Value) {
        return downloadResponse;
      }
      
      // 如果没有Value字段，返回一个标准格式的响应
      throw new Error(`${type === 'class' ? '类' : '函数'} ${idOrName} 下载失败，没有返回内容`);
    }
    
    logger.debug(`${type === 'class' ? '类' : '函数'} ${idOrName} 未找到`);
    throw new Error(`${type === 'class' ? '类' : '函数'} ${idOrName} 未找到`);
  } catch (error) {
    // 禁用控制台错误输出，保持进度条显示简洁
    logger.error(`获取${type === 'class' ? '类' : '函数'} ${idOrName} 详情时发生错误:`, error.message);
    throw error;
  }
};


module.exports = {
  request,
  post,
  get,
  getFullUrl,
  generateTraceId,
  fetchCheckPermission,
  fetchComponents,
  fetchFunctionInfo,
  syncFunction,
  getSingleFunction,
  uploadComponent,
  buildComponent,
  getBuildResult,
  uploadFile,
  uploadFileFromContent,
  login,
  validateToken
};