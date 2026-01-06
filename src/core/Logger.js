const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// 移除对ConfigManager的依赖，使用默认配置避免循环依赖

/**
 * 日志级别枚举
 */
const LOG_LEVELS = {
  DEBUG: { value: 0, name: 'debug', color: 'gray' },
  INFO: { value: 1, name: 'info', color: 'blue' },
  WARNING: { value: 2, name: 'warning', color: 'yellow' },
  ERROR: { value: 3, name: 'error', color: 'red' },
  FATAL: { value: 4, name: 'fatal', color: 'red' }
};

// 简单的颜色处理函数，避免chalk版本兼容性问题
const colorText = (text, colorName) => {
  try {
    if (chalk && chalk[colorName]) {
      return chalk[colorName](text);
    }
  } catch (e) {
    // 如果chalk有问题，返回原始文本
  }
  return text;
};

/**
 * 日志管理器类
 */
class Logger {
  constructor() {
    this.logLevel = LOG_LEVELS.INFO;
    this.logFile = null;
    this.isFileLoggingEnabled = false;
    this.initialize();
  }

  /**
   * 初始化日志配置
   */
  initialize() {
    try {
      // 使用默认日志配置，避免依赖配置管理器
      // 默认日志级别为 WARNING，仅输出警告和错误日志，保持进度条显示简洁
      this.setLogLevel('warning');
      
      // 文件日志默认关闭，可在ConfigManager初始化后通过setLogFile方法启用
      this.isFileLoggingEnabled = false;
      // 默认日志文件路径（预留）
      const logDir = path.join(process.env.HOME || process.env.USERPROFILE, '.fx-cli', 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const defaultLogFile = path.join(logDir, `fx-cli-${new Date().toISOString().split('T')[0]}.log`);
      this.setLogFile(defaultLogFile);
    } catch (error) {
      console.error('Failed to initialize logger configuration:', error.message);
      // 回退到默认配置
      this.setLogLevel('warning');
    }
  }

  /**
   * 设置日志级别
   * @param {string} levelName - 日志级别名称
   */
  setLogLevel(levelName) {
    const normalizedLevelName = levelName.toUpperCase();
    if (LOG_LEVELS[normalizedLevelName]) {
      this.logLevel = LOG_LEVELS[normalizedLevelName];
    } else {
      console.error(`Invalid log level: ${levelName}. Using default level: info`);
      this.logLevel = LOG_LEVELS.INFO;
    }
  }

  /**
   * 设置日志文件
   * @param {string} filePath - 日志文件路径
   */
  setLogFile(filePath) {
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.logFile = filePath;
    } catch (error) {
      console.error(`Failed to set log file: ${error.message}`);
      this.isFileLoggingEnabled = false;
      this.logFile = null;
    }
  }

  /**
   * 记录日志
   * @param {Object} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Error|null} error - 错误对象（可选）
   * @param {Object|null} meta - 附加元数据（可选）
   */
  log(level, message, error = null, meta = null) {
    // 禁用所有控制台日志输出，保持进度条显示简洁
    // 仅保留文件日志记录（如果启用）
    if (this.isFileLoggingEnabled && this.logFile) {
      try {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} [${level.name.toUpperCase()}] ${message}`;
        let fileLogContent = logMessage;
        if (error) {
          fileLogContent += `\n${error.stack || error.message}`;
        }
        if (meta) {
          fileLogContent += `\n${JSON.stringify(meta, null, 2)}`;
        }
        fileLogContent += '\n';
        
        fs.appendFileSync(this.logFile, fileLogContent);
      } catch (fileError) {
        // 防止无限循环，不输出文件写入错误
      }
    }
  }

  /**
   * 记录调试日志
   * @param {string} message - 日志消息
   * @param {Object|null} meta - 附加元数据（可选）
   */
  debug(message, meta = null) {
    this.log(LOG_LEVELS.DEBUG, message, null, meta);
  }

  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   * @param {Object|null} meta - 附加元数据（可选）
   */
  info(message, meta = null) {
    this.log(LOG_LEVELS.INFO, message, null, meta);
  }

  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   * @param {Error|null} error - 错误对象（可选）
   */
  warning(message, error = null) {
    this.log(LOG_LEVELS.WARNING, message, error);
  }

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {Error|null} error - 错误对象（可选）
   */
  error(message, error = null) {
    this.log(LOG_LEVELS.ERROR, message, error);
  }

  /**
   * 记录致命错误日志
   * @param {string} message - 日志消息
   * @param {Error|null} error - 错误对象（可选）
   */
  fatal(message, error = null) {
    this.log(LOG_LEVELS.FATAL, message, error);
  }
}

// 创建单例实例
const logger = new Logger();

module.exports = {
  Logger,
  logger,
  LOG_LEVELS
};
