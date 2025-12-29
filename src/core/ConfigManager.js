/**
 * 配置管理器
 * 负责管理CLI工具的配置文件、配置项和认证信息
 * 支持全局配置和项目级配置
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { ConfigError } = require('./ErrorHandler');

// 安全引入Logger，避免循环依赖
let logger;
try {
  // 在初始化阶段避免直接依赖Logger
  // 只有在真正需要使用日志功能时才会尝试引入
  // 这里先将logger设置为console，后续在非初始化方法中再尝试替换为实际的logger
  logger = console;
} catch (error) {
  logger = console;
}

class ConfigManagerClass {
  constructor(options = {}) {
    // 配置选项
    this.useProjectConfig = options.useProjectConfig !== false; // 默认使用项目级配置
    this.projectRoot = options.projectRoot || process.cwd();
    
    // 全局配置文件路径：用户主目录下的.fx-cli目录
    this.globalConfigDir = path.join(os.homedir(), '.fx-cli');
    this.globalConfigPath = path.join(this.globalConfigDir, 'config.json');
    
    // 项目配置文件路径：当前项目根目录下的.fx-cli目录
    this.projectConfigDir = path.join(this.projectRoot, '.fx-cli');
    this.projectConfigPath = path.join(this.projectConfigDir, 'config.json');
    
    // 不再使用项目根目录的config.json，只使用.fx-cli目录下的配置文件
    
    // 确定实际使用的配置路径
    this._determineConfigPath();
    
    this.defaultConfig = {
      auth: {
        domain: '',
        certificate: '',
        lastAuth: null
      },
      project: {
        rootDir: process.cwd(),
        defaultType: 'component',
        defaultOutputDir: './fx-app'
      },
      jenkins: {
        url: '',
        username: '',
        token: '',
        jobPrefix: 'fx-'
      },
      logging: {
        level: 'info',
        file: path.join(this.configDir, 'logs', 'fx-cli.log'),
        enableConsole: true,
        enableFile: true
      },
      cache: {
        enabled: true,
        maxAge: 86400000 // 24小时
      }
    };
    
    // 初始化配置目录
    this._ensureConfigDir();
  }
  
  /**
   * 同步初始化配置目录
   * @private
   */
  _ensureConfigDir() {
    try {
      // 确保全局配置目录存在
      fs.ensureDirSync(this.globalConfigDir);
      fs.ensureDirSync(path.join(this.globalConfigDir, 'logs'));
      
      // 如果使用项目配置，确保项目配置目录存在
      if (this.useProjectConfig) {
        fs.ensureDirSync(this.projectConfigDir);
      }
    } catch (error) {
      logger.error(`创建配置目录失败: ${error.message}`);
    }
  }
  
  /**
   * 确定配置路径
   * @private
   */
  _determineConfigPath() {
    // 只检查项目.fx-cli目录下的config.json
    const hasProjectConfig = this.useProjectConfig && fs.pathExistsSync(this.projectConfigPath);
    
    // 确定使用哪个配置路径
    if (hasProjectConfig) {
      this.configDir = this.projectConfigDir;
      this.configPath = this.projectConfigPath;
    } else {
      this.configDir = this.globalConfigDir;
      this.configPath = this.globalConfigPath;
    }
  }
  
  /**
   * 检查项目配置是否存在（仅检查.fx-cli目录）
   * @private
   * @returns {boolean}
   */
  _isProjectConfigExists() {
    try {
      // 仅检查项目.fx-cli目录下的配置
      return fs.pathExistsSync(this.projectConfigPath);
    } catch (error) {
      logger.debug(`检查项目配置失败: ${error.message}`);
      return false;
    }
  }
  
  /**
   * 设置是否使用项目级别配置
   * @param {boolean} useProjectConfig - 是否使用项目配置
   */
  setUseProjectConfig(useProjectConfig) {
    this.useProjectConfig = useProjectConfig;
    
    // 重新确定配置路径
    this._determineConfigPath();
    
    // 确保日志路径使用正确的配置目录
    if (this.defaultConfig && this.defaultConfig.logging) {
      this.defaultConfig.logging.file = path.join(this.configDir, 'logs', 'fx-cli.log');
    }
  }
  
  /**
   * 获取当前使用的配置类型
   * @returns {string} - 'root'、'project' 或 'global'
   */
  getConfigType() {
    if (this.useProjectConfig) {
      if (fs.pathExistsSync(this.rootConfigPath)) {
        return 'root'; // 项目根目录配置
      } else if (fs.pathExistsSync(this.projectConfigPath)) {
        return 'project'; // 项目.fx-cli目录配置
      }
    }
    return 'global'; // 全局配置
  }
  
  /**
   * 创建项目级别配置
   * @param {Object} options - 配置选项
   * @param {boolean} options.useRootConfig - 是否使用项目根目录配置
   * @returns {Promise<void>}
   */
  async createProjectConfig(options = {}) {
    try {
      const { useRootConfig } = options;
      
      if (useRootConfig) {
        // 创建项目根目录配置文件
        if (!await fs.pathExists(this.rootConfigPath)) {
          const globalConfig = await this.getGlobalConfig();
          // 移除敏感信息
          const projectConfig = {
            ...globalConfig,
            auth: {
              domain: '',
              certificate: '',
              lastAuth: null
            }
          };
          await fs.writeJSON(this.rootConfigPath, projectConfig, { spaces: 2 });
        }
      } else {
        // 创建项目.fx-cli目录配置
        // 确保项目配置目录存在
        await fs.ensureDir(this.projectConfigDir);
        
        // 如果项目配置不存在，从全局配置复制（不包括认证信息）
        if (!await fs.pathExists(this.projectConfigPath)) {
          const globalConfig = await this.getGlobalConfig();
          // 移除敏感信息
          const projectConfig = {
            ...globalConfig,
            auth: {
              domain: '',
              certificate: '',
              userInfo: null,
              lastAuth: null
            }
          };
          await fs.writeJSON(this.projectConfigPath, projectConfig, { spaces: 2 });
          await fs.writeJSON(this.projectCredentialsPath, {}, { spaces: 2 });
        }
      }
      
      // 切换到项目配置
      this.setUseProjectConfig(true);
      logger.debug('项目配置已创建并激活');
    } catch (error) {
      logger.error('创建项目配置失败', error);
      throw new ConfigError(`创建项目配置失败: ${error.message}`);
    }
  }
  
  /**
   * 获取全局配置
   * @returns {Promise<Object>}
   */
  async getGlobalConfig() {
    try {
      if (!await fs.pathExists(this.globalConfigPath)) {
        return { ...this.defaultConfig };
      }
      return await fs.readJSON(this.globalConfigPath);
    } catch (error) {
      logger.error('读取全局配置失败', error);
      throw new ConfigError(`读取全局配置失败: ${error.message}`);
    }
  }

  /**
   * 初始化配置
   */
  async initialize() {
    try {
      // 确保全局配置目录存在
      await fs.ensureDir(this.globalConfigDir);
      await fs.ensureDir(path.join(this.globalConfigDir, 'logs'));
      
      // 如果使用项目配置，确保项目配置目录存在
      if (this.useProjectConfig) {
        await fs.ensureDir(this.projectConfigDir);
      }

      // 确保全局配置文件存在
      if (!await fs.pathExists(this.globalConfigPath)) {
        await fs.writeJSON(this.globalConfigPath, this.defaultConfig, { spaces: 2 });
      }
      
      // 确保项目配置文件存在（如果使用项目配置）
      if (this.useProjectConfig && !await fs.pathExists(this.projectConfigPath)) {
        // 创建项目配置（基于默认配置）
        await fs.writeJSON(this.projectConfigPath, this.defaultConfig, { spaces: 2 });
      }
      
      // 重新确定配置路径
      this.setUseProjectConfig(this.useProjectConfig);
    } catch (error) {
      logger.error('初始化配置失败', error);
      throw new ConfigError(`初始化配置失败: ${error.message}`);
    }
  }
  
  /**
   * 同步初始化配置
   */
  initializeSync() {
    try {
      // 确保配置目录存在
      fs.ensureDirSync(this.configDir);
      fs.ensureDirSync(path.join(this.configDir, 'logs'));

      // 如果配置文件不存在，创建默认配置
      if (!fs.pathExistsSync(this.configPath)) {
        fs.writeJSONSync(this.configPath, this.defaultConfig, { spaces: 2 });
      }
    } catch (error) {
      logger.error('初始化配置失败', error);
      throw new ConfigError(`初始化配置失败: ${error.message}`);
    }
  }

  /**
   * 读取配置文件
   * @returns {Object} 配置对象
   */
  async getConfig() {
    try {
      await this.initialize();
      const config = await fs.readJSON(this.configPath);
      return { ...this.defaultConfig, ...this._mergeDeep(this.defaultConfig, config) };
    } catch (error) {
      logger.error('读取配置失败', error);
      throw new ConfigError(`读取配置失败: ${error.message}`);
    }
  }
  
  /**
   * 同步读取配置文件
   * @returns {Object} 配置对象
   */
  getConfigSync() {
    try {
      this.initializeSync();
      const config = fs.readJSONSync(this.configPath);
      return { ...this.defaultConfig, ...this._mergeDeep(this.defaultConfig, config) };
    } catch (error) {
      logger.error('读取配置失败', error);
      throw new ConfigError(`读取配置失败: ${error.message}`);
    }
  }

  /**
   * 保存配置文件
   * @param {Object} config - 要保存的配置对象
   */
  async saveConfig(config) {
    try {
      await this.initialize();
      await fs.writeJSON(this.configPath, config, { spaces: 2 });
    } catch (error) {
      logger.error('保存配置失败', error);
      throw new ConfigError(`保存配置失败: ${error.message}`, { filePath: this.configPath });
    }
  }
  
  /**
   * 同步保存配置文件
   * @param {Object} config - 要保存的配置对象
   */
  saveConfigSync(config) {
    try {
      this.initializeSync();
      fs.writeJSONSync(this.configPath, config, { spaces: 2 });
    } catch (error) {
      logger.error('保存配置失败', error);
      throw new ConfigError(`保存配置失败: ${error.message}`, { filePath: this.configPath });
    }
  }

  /**
   * 获取指定的配置项
   * @param {string} key - 配置项键名，支持点号表示嵌套键
   * @returns {*} 配置项的值
   */
  async get(key) {
    const config = await this.getConfig();
    return this._getValueByKey(config, key);
  }
  
  /**
   * 同步获取指定的配置项
   * @param {string} key - 配置项键名，支持点号表示嵌套键
   * @returns {*} 配置项的值
   */
  getSync(key) {
    const config = this.getConfigSync();
    return this._getValueByKey(config, key);
  }

  /**
   * 设置配置项
   * @param {string} key - 配置项键名，支持点号表示嵌套键
   * @param {*} value - 配置项的值
   */
  async set(key, value) {
    try {
      const config = await this.getConfig();
      this._setValueByKey(config, key, value);
      await this.saveConfig(config);
      logger.debug(`配置项 ${key} 设置成功`);
    } catch (error) {
      logger.error(`设置配置项 ${key} 失败`, error);
      throw new ConfigError(`无法设置配置项 ${key}`, { key, value });
    }
  }
  
  /**
   * 同步设置配置项
   * @param {string} key - 配置项键名，支持点号表示嵌套键
   * @param {*} value - 配置项的值
   */
  setSync(key, value) {
    const config = this.getConfigSync();
    this._setValueByKey(config, key, value);
    this.saveConfigSync(config);
  }

  /**
   * 删除配置项
   * @param {string} key - 配置项键名，支持点号表示嵌套键
   */
  async delete(key) {
    try {
      const config = await this.getConfig();
      // 检查键是否存在
      const keys = key.split('.');
      let current = config;
      let found = true;
      
      for (const k of keys) {
        if (!current || typeof current !== 'object' || !(k in current)) {
          found = false;
          break;
        }
        current = current[k];
      }
      
      if (!found) {
        logger.debug(`配置项 ${key} 不存在，无需删除`);
        return;
      }
      
      this._deleteValueByKey(config, key);
      await this.saveConfig(config);
      logger.debug(`配置项 ${key} 删除成功`);
    } catch (error) {
      logger.error(`删除配置项 ${key} 失败`, error);
      throw new ConfigError(`无法删除配置项 ${key}`, { key });
    }
  }
  
  /**
   * 同步删除配置项
   * @param {string} key - 配置项键名，支持点号表示嵌套键
   */
  deleteSync(key) {
    const config = this.getConfigSync();
    this._deleteValueByKey(config, key);
    this.saveConfigSync(config);
  }

  /**
   * 合并配置
   * @param {Object} config - 要合并的配置
   */
  async merge(config) {
    const currentConfig = await this.getConfig();
    const mergedConfig = this._mergeDeep(currentConfig, config);
    await this.saveConfig(mergedConfig);
  }
  
  /**
   * 同步合并配置
   * @param {Object} config - 要合并的配置
   */
  mergeSync(config) {
    const currentConfig = this.getConfigSync();
    const mergedConfig = this._mergeDeep(currentConfig, config);
    this.saveConfigSync(mergedConfig);
  }

  /**
   * 重置配置到默认值
   */
  async reset() {
    await this.saveConfig(this.defaultConfig);
  }
  
  /**
   * 同步重置配置到默认值
   */
  resetSync() {
    this.saveConfigSync(this.defaultConfig);
  }
  
  /**
   * 保存认证信息
   * @param {Object} authInfo - 认证信息对象
   */
  async saveAuthInfo(authInfo) {
    try {
      await this.initialize();
      // 移除userInfo字段
      const { userInfo, ...safeAuthInfo } = authInfo || {};
      const authData = {
        ...safeAuthInfo,
        lastAuth: new Date().toISOString()
      };
      
      // 敏感信息加密存储到配置文件中
      if (authInfo.token || authInfo.password) {
        authData.encryptedToken = this._encrypt(authInfo.token || authInfo.password);
        // 不在主配置中存储原始敏感信息
        delete authData.token;
        delete authData.password;
      }
      
      // 直接保存到配置文件
      await this.set('auth', authData);
    } catch (error) {
      logger.error('保存认证信息失败', error);
      throw new ConfigError(`保存认证信息失败: ${error.message}`);
    }
  }
  
  /**
   * 获取认证信息
   * @returns {Object} 认证信息对象
   */
  async getAuthInfo() {
    try {
      await this.initialize();
      let authInfo = await this.get('auth') || {};
      
      // 尝试从项目根目录的certificate.json文件读取认证信息（向后兼容）
      const certificatePath = path.join(this.projectRoot, 'certificate.json');
      if (await fs.pathExists(certificatePath)) {
        try {
          const certificateData = await fs.readJSON(certificatePath);
          if (certificateData.domain && certificateData.certificate) {
            console.log('从项目根目录certificate.json读取认证信息');
            // 合并认证信息，certificate.json中的信息优先级更高
            authInfo = {
              ...authInfo,
              domain: certificateData.domain,
              certificate: certificateData.certificate
            };
          }
        } catch (certError) {
          console.log('读取certificate.json失败:', certError.message);
        }
      }
      
      // 如果authInfo中有加密的token，尝试解密
      if (authInfo.encryptedToken) {
        authInfo.token = this._decrypt(authInfo.encryptedToken);
      }
      
      return authInfo;
    } catch (error) {
      logger.error('获取认证信息失败', error);
      // 不再抛出错误，而是返回空对象，让调用方能够继续执行
      return {};
    }
  }
  
  /**
   * 清除认证信息
   */
  async clearAuthInfo() {
    try {
      await this.initialize();
      const credentials = await this._getCredentials();
      delete credentials.authToken;
      await fs.writeJSON(this.credentialsPath, credentials, { spaces: 2 });
      await this.set('auth', this.defaultConfig.auth);
    } catch (error) {
      logger.error('清除认证信息失败', error);
      throw new ConfigError(`清除认证信息失败: ${error.message}`);
    }
  }
  
  /**
   * 检查是否已认证
   * @returns {boolean} 是否已认证
   */
  async isAuthenticated() {
    try {
      const authInfo = await this.getAuthInfo();
      return authInfo && authInfo.token;
    } catch (error) {
      return false;
    }
  }
  
    // 不再使用单独的credentials.json文件，认证信息直接存储在config.json中
  
  /**
   * 加密敏感信息
   * @private
   * @param {string} text - 要加密的文本
   * @returns {string} 加密后的文本
   */
  _encrypt(text) {
    // 使用简单的加密方式，实际使用中应考虑更安全的加密方法
    const secret = 'fx-cli-secret-key';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secret.padEnd(32, '0')), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }
  
  /**
   * 解密敏感信息
   * @private
   * @param {string} text - 要解密的文本
   * @returns {string} 解密后的文本
   */
  _decrypt(text) {
    try {
      const secret = 'fx-cli-secret-key';
      const parts = text.split(':');
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = Buffer.from(parts[1], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(secret.padEnd(32, '0')), iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } catch (error) {
      throw new Error('解密失败');
    }
  }

  /**
   * 获取配置文件路径
   * @returns {string} 配置文件路径
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * 通过键路径获取值
   * @private
   * @param {Object} obj - 对象
   * @param {string} keyPath - 键路径，如 'auth.domain'
   * @returns {*} 对应的值
   */
  _getValueByKey(obj, keyPath) {
    if (!keyPath) return obj;
    
    return keyPath.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * 通过键路径设置值
   * @private
   * @param {Object} obj - 对象
   * @param {string} keyPath - 键路径，如 'auth.domain'
   * @param {*} value - 要设置的值
   */
  _setValueByKey(obj, keyPath, value) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    
    const lastObj = keys.reduce((current, key) => {
      if (!current[key]) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    lastObj[lastKey] = value;
  }

  /**
   * 通过键路径删除值
   * @private
   * @param {Object} obj - 对象
   * @param {string} keyPath - 键路径，如 'auth.domain'
   */
  _deleteValueByKey(obj, keyPath) {
    const keys = keyPath.split('.');
    const lastKey = keys.pop();
    
    const lastObj = keys.reduce((current, key) => {
      return current && current[key] ? current[key] : null;
    }, obj);
    
    if (lastObj && lastObj[lastKey] !== undefined) {
      delete lastObj[lastKey];
    }
  }

  /**
   * 深度合并对象
   * @private
   * @param {Object} target - 目标对象
   * @param {Object} source - 源对象
   * @returns {Object} 合并后的对象
   */
  _mergeDeep(target, source) {
    if (!source || typeof source !== 'object') return target;
    if (!target || typeof target !== 'object') return source;
    
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!result[key]) {
            result[key] = {};
          }
          result[key] = this._mergeDeep(result[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
}

// 单例实例
let configManagerInstance = null;

/**
 * 获取配置管理器单例实例
 * @param {Object} options - 配置选项
 * @returns {ConfigManagerClass} 配置管理器实例
 */
const getConfigManager = (options = {}) => {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManagerClass(options);
    // 尝试初始化，但不阻塞返回实例
    try {
      configManagerInstance.initialize();
    } catch (e) {
      console.error('[警告] 配置管理器初始化失败:', e.message);
    }
  }
  return configManagerInstance;
};

// 导出配置管理器类和工厂函数
module.exports = {
  ConfigManager: ConfigManagerClass,
  getConfigManager
};