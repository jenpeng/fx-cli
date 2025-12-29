/**
 * Jenkins集成服务
 * 负责与Jenkins服务器交互，支持流水线查询、构建触发和状态查询
 */

const jenkins = require('jenkins');
const { getConfigManager } = require('../core/ConfigManager');

// 使用延迟加载的方式获取配置管理器实例
const getConfigManagerInstance = () => {
  try {
    const { getConfigManager } = require('../core/ConfigManager');
    return getConfigManager();
  } catch (e) {
    // 如果获取失败，返回一个简单的配置管理器模拟对象
    console.error('[警告] 无法获取配置管理器，使用默认配置');
    return {
      get: () => null,
      set: () => Promise.resolve()
    };
  }
};

// 获取配置管理器实例
let configManager;
try {
  configManager = getConfigManager();
} catch (e) {
  configManager = getConfigManagerInstance();
}

/**
 * 创建Jenkins客户端实例
 * @returns {Object} Jenkins客户端
 */
const createJenkinsClient = () => {
  const jenkinsConfig = configManager.get('jenkins');
  
  if (!jenkinsConfig) {
    throw new Error('Jenkins配置不存在，请先运行 fx-cli jenkins setup');
  }
  
  const { url, username, password, token } = jenkinsConfig;
  
  if (!url) {
    throw new Error('Jenkins URL未配置');
  }
  
  // 构建Jenkins连接URL
  let jenkinsUrl = url;
  if (username && (password || token)) {
    const auth = `${username}:${token || password}`;
    // 替换URL中的协议部分，添加认证信息
    const urlParts = url.split('://');
    jenkinsUrl = `${urlParts[0]}://${auth}@${urlParts[1]}`;
  }
  
  return jenkins({
    baseUrl: jenkinsUrl,
    crumbIssuer: true,
    promisify: true
  });
};

/**
 * 配置Jenkins连接信息
 * @param {Object} config - Jenkins配置信息
 * @returns {Promise<void>}
 */
const configureJenkins = async (config) => {
  try {
    // 验证必要的配置项
    if (!config.url) {
      throw new Error('Jenkins URL是必填项');
    }
    
    // 验证URL格式
    try {
      new URL(config.url);
    } catch (error) {
      throw new Error('Jenkins URL格式不正确');
    }
    
    // 保存配置
    await configManager.set('jenkins', config);
    
    // 测试连接
    const client = createJenkinsClient();
    await client.info();
    
    return { success: true, message: 'Jenkins配置成功并已连接' };
  } catch (error) {
    throw new Error(`配置Jenkins失败: ${error.message}`);
  }
};

/**
 * 获取Jenkins系统信息
 * @returns {Promise<Object>} Jenkins系统信息
 */
const getJenkinsInfo = async () => {
  try {
    const client = createJenkinsClient();
    const info = await client.info();
    return info;
  } catch (error) {
    throw new Error(`获取Jenkins信息失败: ${error.message}`);
  }
};

/**
 * 获取所有Job/Pipeline列表
 * @param {string} folder - 文件夹路径（可选）
 * @returns {Promise<Array>} Job列表
 */
const getJobs = async (folder = '') => {
  try {
    const client = createJenkinsClient();
    let jobs = [];
    
    if (folder) {
      // 获取指定文件夹下的Job
      const folderInfo = await client.job.get(folder);
      jobs = folderInfo.jobs || [];
    } else {
      // 获取根目录下的所有Job
      const info = await client.info();
      jobs = info.jobs || [];
    }
    
    // 递归获取所有文件夹中的Job
    const allJobs = [];
    await processJobs(jobs, allJobs, folder, client);
    
    return allJobs;
  } catch (error) {
    throw new Error(`获取Pipeline列表失败: ${error.message}`);
  }
};

/**
 * 递归处理Job列表，包括文件夹
 * @param {Array} jobs - Job列表
 * @param {Array} allJobs - 收集所有Job的数组
 * @param {string} parentPath - 父路径
 * @param {Object} client - Jenkins客户端
 */
const processJobs = async (jobs, allJobs, parentPath, client) => {
  for (const job of jobs) {
    const fullPath = parentPath ? `${parentPath}/${job.name}` : job.name;
    
    if (job._class.includes('Folder')) {
      // 如果是文件夹，递归处理
      const folderInfo = await client.job.get(fullPath);
      await processJobs(folderInfo.jobs || [], allJobs, fullPath, client);
    } else {
      // 将Job信息添加到结果数组
      allJobs.push({
        name: job.name,
        fullName: fullPath,
        url: job.url,
        color: job.color,
        description: job.description || ''
      });
    }
  }
};

/**
 * 触发Job构建
 * @param {string} jobName - Job名称
 * @param {Object} params - 构建参数
 * @returns {Promise<Object>} 构建结果
 */
const buildJob = async (jobName, params = null) => {
  try {
    const client = createJenkinsClient();
    
    // 检查Job是否存在
    let jobInfo;
    try {
      jobInfo = await client.job.get(jobName);
    } catch (error) {
      throw new Error(`Job不存在: ${jobName}`);
    }
    
    // 检查是否支持参数化构建
    const hasParameters = jobInfo.actions.some(action => 
      action._class === 'hudson.model.ParametersDefinitionProperty'
    );
    
    // 触发构建
    let queueId;
    if (params && hasParameters) {
      queueId = await client.job.build({ name: jobName, parameters: params });
    } else {
      if (params && !hasParameters) {
        console.warn(`Job ${jobName} 不支持参数化构建，忽略提供的参数`);
      }
      queueId = await client.job.build(jobName);
    }
    
    return { success: true, queueId, message: `构建已触发，队列ID: ${queueId}` };
  } catch (error) {
    throw new Error(`触发构建失败: ${error.message}`);
  }
};

/**
 * 获取构建状态
 * @param {string} jobName - Job名称
 * @param {number} buildNumber - 构建编号（可选，默认为最后一次构建）
 * @returns {Promise<Object>} 构建状态信息
 */
const getBuildStatus = async (jobName, buildNumber = null) => {
  try {
    const client = createJenkinsClient();
    
    // 获取Job信息
    const jobInfo = await client.job.get(jobName);
    
    // 确定构建编号
    const number = buildNumber || jobInfo.lastBuild.number;
    
    // 获取构建信息
    const buildInfo = await client.build.get(jobName, number);
    
    // 格式化构建状态信息
    const statusInfo = {
      jobName: buildInfo.fullDisplayName,
      buildNumber: buildInfo.number,
      status: buildInfo.result || 'IN_PROGRESS',
      startTime: buildInfo.timestamp,
      duration: buildInfo.duration,
      url: buildInfo.url,
      executor: buildInfo.executor ? buildInfo.executor.displayName : 'N/A',
      building: buildInfo.building,
      description: buildInfo.description || ''
    };
    
    return statusInfo;
  } catch (error) {
    throw new Error(`获取构建状态失败: ${error.message}`);
  }
};

/**
 * 获取构建日志
 * @param {string} jobName - Job名称
 * @param {number} buildNumber - 构建编号
 * @param {number} startLine - 开始行号
 * @returns {Promise<string>} 构建日志
 */
const getBuildLog = async (jobName, buildNumber, startLine = 0) => {
  try {
    const client = createJenkinsClient();
    const log = await client.build.log(jobName, buildNumber, { start: startLine });
    return log;
  } catch (error) {
    throw new Error(`获取构建日志失败: ${error.message}`);
  }
};

/**
 * 取消正在排队或运行的构建
 * @param {number} queueId - 队列ID
 * @returns {Promise<Object>} 取消结果
 */
const cancelBuild = async (queueId) => {
  try {
    const client = createJenkinsClient();
    await client.queue.cancel(queueId);
    return { success: true, message: `构建已取消，队列ID: ${queueId}` };
  } catch (error) {
    throw new Error(`取消构建失败: ${error.message}`);
  }
};

module.exports = {
  configureJenkins,
  getJenkinsInfo,
  getJobs,
  buildJob,
  getBuildStatus,
  getBuildLog,
  cancelBuild
};