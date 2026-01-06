/**
 * GitHub仓库配置管理服务
 * 用于管理GitHub仓库的配置信息
 */

const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../core/Logger');
const { fileUtils } = require('../utils/fileUtils');

class GitHubConfigManager {
  constructor() {
    this.configDir = path.join(process.cwd(), '.fx-cli');
    this.configFile = path.join(this.configDir, 'github-config.json');
    this.defaultConfig = {
      repositories: {},
      globalSettings: {
        defaultBranch: 'main',
        defaultTypes: ['component', 'plugin', 'function', 'class'],
        overwrite: false,
        dryRun: false
      }
    };
  }

  /**
   * 初始化配置文件
   * @returns {Promise<void>}
   */
  async initConfig() {
    try {
      // 确保配置目录存在
      await fileUtils.ensureDir(this.configDir);
      
      // 如果配置文件不存在，创建默认配置
      if (!(await fileUtils.exists(this.configFile))) {
        await fileUtils.writeFile(
          this.configFile,
          JSON.stringify(this.defaultConfig, null, 2)
        );
        logger.info('GitHub配置文件已初始化');
      }
    } catch (error) {
      logger.error(`初始化GitHub配置文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 读取配置文件
   * @returns {Promise<Object>} 配置信息
   */
  async readConfig() {
    try {
      await this.initConfig();
      const content = await fileUtils.readFile(this.configFile);
      return JSON.parse(content);
    } catch (error) {
      logger.error(`读取GitHub配置文件失败: ${error.message}`);
      return this.defaultConfig;
    }
  }

  /**
   * 写入配置文件
   * @param {Object} config - 配置信息
   * @returns {Promise<void>}
   */
  async writeConfig(config) {
    try {
      await this.initConfig();
      await fileUtils.writeFile(
        this.configFile,
        JSON.stringify(config, null, 2)
      );
      logger.info('GitHub配置已更新');
    } catch (error) {
      logger.error(`写入GitHub配置文件失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 添加或更新仓库配置
   * @param {string} repoUrl - 仓库URL
   * @param {Object} repoConfig - 仓库配置
   * @returns {Promise<void>}
   */
  async addOrUpdateRepository(repoUrl, repoConfig) {
    try {
      const config = await this.readConfig();
      const repoKey = this.getRepoKey(repoUrl);
      
      // 添加或更新仓库配置
      config.repositories[repoKey] = {
        url: repoUrl,
        ...repoConfig,
        updatedAt: new Date().toISOString()
      };
      
      await this.writeConfig(config);
      logger.info(`仓库配置已更新: ${repoUrl}`);
    } catch (error) {
      logger.error(`添加或更新仓库配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取仓库配置
   * @param {string} repoUrl - 仓库URL
   * @returns {Promise<Object|null>} 仓库配置
   */
  async getRepository(repoUrl) {
    try {
      const config = await this.readConfig();
      const repoKey = this.getRepoKey(repoUrl);
      return config.repositories[repoKey] || null;
    } catch (error) {
      logger.error(`获取仓库配置失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 删除仓库配置
   * @param {string} repoUrl - 仓库URL
   * @returns {Promise<void>}
   */
  async removeRepository(repoUrl) {
    try {
      const config = await this.readConfig();
      const repoKey = this.getRepoKey(repoUrl);
      
      if (config.repositories[repoKey]) {
        delete config.repositories[repoKey];
        await this.writeConfig(config);
        logger.info(`仓库配置已删除: ${repoUrl}`);
      } else {
        logger.warning(`仓库配置不存在: ${repoUrl}`);
      }
    } catch (error) {
      logger.error(`删除仓库配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 列出所有仓库配置
   * @returns {Promise<Array>} 仓库配置列表
   */
  async listRepositories() {
    try {
      const config = await this.readConfig();
      return Object.values(config.repositories);
    } catch (error) {
      logger.error(`列出仓库配置失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 更新全局设置
   * @param {Object} settings - 全局设置
   * @returns {Promise<void>}
   */
  async updateGlobalSettings(settings) {
    try {
      const config = await this.readConfig();
      config.globalSettings = {
        ...config.globalSettings,
        ...settings
      };
      await this.writeConfig(config);
      logger.info('全局设置已更新');
    } catch (error) {
      logger.error(`更新全局设置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取全局设置
   * @returns {Promise<Object>} 全局设置
   */
  async getGlobalSettings() {
    try {
      const config = await this.readConfig();
      return config.globalSettings;
    } catch (error) {
      logger.error(`获取全局设置失败: ${error.message}`);
      return this.defaultConfig.globalSettings;
    }
  }

  /**
   * 从仓库URL生成唯一键
   * @param {string} repoUrl - 仓库URL
   * @returns {string} 仓库键
   */
  getRepoKey(repoUrl) {
    // 提取仓库的owner/name部分
    const match = repoUrl.match(/github\.com[:/](.+?)(?:\.git)?$/);
    if (match) {
      return match[1];
    }
    // 如果无法提取，使用URL的哈希值
    const crypto = require('crypto');
    return crypto.createHash('md5').update(repoUrl).digest('hex');
  }

  /**
   * 导出配置
   * @param {string} exportPath - 导出路径
   * @returns {Promise<void>}
   */
  async exportConfig(exportPath) {
    try {
      const config = await this.readConfig();
      await fileUtils.writeFile(
        exportPath,
        JSON.stringify(config, null, 2)
      );
      logger.info(`配置已导出到: ${exportPath}`);
    } catch (error) {
      logger.error(`导出配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 导入配置
   * @param {string} importPath - 导入路径
   * @param {boolean} merge - 是否合并现有配置
   * @returns {Promise<void>}
   */
  async importConfig(importPath, merge = true) {
    try {
      const content = await fileUtils.readFile(importPath);
      const importedConfig = JSON.parse(content);
      
      if (merge) {
        // 合并配置
        const currentConfig = await this.readConfig();
        
        // 合并仓库配置
        const mergedConfig = {
          ...currentConfig,
          repositories: {
            ...currentConfig.repositories,
            ...importedConfig.repositories
          },
          globalSettings: {
            ...currentConfig.globalSettings,
            ...importedConfig.globalSettings
          }
        };
        
        await this.writeConfig(mergedConfig);
      } else {
        // 直接替换
        await this.writeConfig(importedConfig);
      }
      
      logger.info(`配置已从 ${importPath} 导入`);
    } catch (error) {
      logger.error(`导入配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 清理配置
   * @returns {Promise<void>}
   */
  async cleanConfig() {
    try {
      await this.writeConfig(this.defaultConfig);
      logger.info('GitHub配置已重置为默认值');
    } catch (error) {
      logger.error(`清理配置失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取仓库使用统计
   * @returns {Promise<Object>} 使用统计
   */
  async getUsageStats() {
    try {
      const config = await this.readConfig();
      const repos = Object.values(config.repositories);
      
      return {
        totalRepositories: repos.length,
        repositoriesByType: this.groupBy(repos, 'type'),
        repositoriesByBranch: this.groupBy(repos, 'branch'),
        recentlyUsed: repos
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          .slice(0, 5)
      };
    } catch (error) {
      logger.error(`获取使用统计失败: ${error.message}`);
      return {
        totalRepositories: 0,
        repositoriesByType: {},
        repositoriesByBranch: {},
        recentlyUsed: []
      };
    }
  }

  /**
   * 按字段分组
   * @param {Array} items - 项目列表
   * @param {string} field - 分组字段
   * @returns {Object} 分组结果
   */
  groupBy(items, field) {
    return items.reduce((result, item) => {
      const key = item[field] || 'unknown';
      result[key] = (result[key] || 0) + 1;
      return result;
    }, {});
  }
}

module.exports = new GitHubConfigManager();