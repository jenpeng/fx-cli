const chalk = require('chalk');
const { logger } = require('./Logger');

/**
 * 基础错误类
 */
class FxError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', statusCode = 500, metadata = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 配置错误类
 */
class ConfigError extends FxError {
  constructor(message, metadata = {}) {
    super(message, 'CONFIG_ERROR', 400, metadata);
  }
}

/**
 * 认证错误类
 */
class AuthError extends FxError {
  constructor(message, metadata = {}) {
    super(message, 'AUTH_ERROR', 401, metadata);
  }
}

/**
 * 权限错误类
 */
class PermissionError extends FxError {
  constructor(message, metadata = {}) {
    super(message, 'PERMISSION_ERROR', 403, metadata);
  }
}

/**
 * 资源不存在错误类
 */
class NotFoundError extends FxError {
  constructor(message, metadata = {}) {
    super(message, 'NOT_FOUND_ERROR', 404, metadata);
  }
}

/**
 * API错误类
 */
class ApiError extends FxError {
  constructor(message, statusCode = 500, apiEndpoint = '', metadata = {}) {
    super(message, 'API_ERROR', statusCode, { ...metadata, apiEndpoint });
  }
}

/**
 * 构建错误类
 */
class BuildError extends FxError {
  constructor(message, buildInfo = {}, metadata = {}) {
    super(message, 'BUILD_ERROR', 500, { ...metadata, buildInfo });
  }
}

/**
 * Jenkins错误类
 */
class JenkinsError extends FxError {
  constructor(message, jobName = '', buildNumber = null, metadata = {}) {
    super(message, 'JENKINS_ERROR', 500, { ...metadata, jobName, buildNumber });
  }
}

/**
 * 错误处理工具类
 */
class ErrorHandler {
  /**
   * 处理未捕获的异常
   */
  static setupGlobalHandlers() {
    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      ErrorHandler.handleUncaughtException(error);
    });

    // 处理未处理的Promise拒绝
    process.on('unhandledRejection', (reason, promise) => {
      ErrorHandler.handleUnhandledRejection(reason, promise);
    });
  }

  /**
   * 处理未捕获的异常
   * @param {Error} error - 未捕获的异常
   */
  static handleUncaughtException(error) {
    logger.fatal('未捕获的异常', error);
    
    try {
      console.error('\n[错误] 发生未捕获的异常:');
      console.error('[错误] ' + error.message);
    } catch (e) {
      console.error('\n发生未捕获的异常:', error.message);
    }
    console.error('\n请查看日志文件获取详细信息。');
    
    process.exit(1);
  }

  /**
   * 处理未处理的Promise拒绝
   * @param {Error} reason - 拒绝原因
   * @param {Promise} promise - 被拒绝的Promise
   */
  static handleUnhandledRejection(reason, promise) {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    // 只记录错误消息，不记录堆栈
    // logger.error('未处理的Promise拒绝: ' + error.message);
    
    try {
      // console.error('\n[警告] 未处理的Promise拒绝:');
      console.error('[警告] ' + error.message);
    } catch (e) {
      console.error('\n未处理的Promise拒绝:', error.message);
    }
  }

  /**
   * 处理API错误响应
   * @param {Object} errorResponse - API错误响应对象
   * @returns {ApiError} 格式化后的API错误
   */
  static parseApiError(errorResponse) {
    try {
      const response = errorResponse.response;
      let message = 'API调用失败';
      let statusCode = 500;
      let metadata = {};

      if (response) {
        statusCode = response.status;
        
        // 尝试从响应中提取错误信息
        if (response.data && typeof response.data === 'object') {
          message = response.data.message || (response.data?.error ? String(response.data.error) : message);
          metadata = response.data.metadata || {};
        } else if (response.data) {
          message = String(response.data);
        }
      } else if (errorResponse.request) {
        message = '无法连接到服务器，请检查网络连接';
      }

      return new ApiError(message, statusCode, errorResponse.config?.url || '', {
        ...metadata,
        requestConfig: errorResponse.config,
        stack: errorResponse.stack
      });
    } catch (err) {
      return new ApiError('API错误解析失败', 500, '', {
        originalError: errorResponse
      });
    }
  }

  /**
   * 格式化错误消息用于显示
   * @param {Error} error - 错误对象
   * @returns {string} 格式化的错误消息
   */
  static formatErrorMessage(error) {
    if (error instanceof FxError) {
      return `${error.code}: ${error.message}`;
    }
    return error.message || '发生未知错误';
  }

  /**
   * 处理命令执行错误
   * @param {Error} error - 错误对象
   * @param {string} commandName - 命令名称
   * @returns {number} 退出代码
   */
  static handleCommandError(error, commandName) {
    let formattedError;
    let logLevel = 'error';
    let exitCode = 1;

    // 根据错误类型进行特定处理
    if (error.response) {
      // 处理Axios响应错误
      formattedError = ErrorHandler.parseApiError(error);
    } else if (error instanceof FxError) {
      // 已定义的自定义错误
      formattedError = error;
      
      // 根据错误类型设置适当的退出代码
      if (error.statusCode >= 400 && error.statusCode < 500) {
        exitCode = 2; // 用户错误
      }
    } else {
      // 未定义的错误
      formattedError = new FxError(error.message || '未知错误', 'UNKNOWN_ERROR', 500, {
        originalError: error,
        stack: error.stack
      });
    }

    // 根据错误级别记录日志
    if (formattedError.statusCode >= 500) {
      logger.fatal(`命令 ${commandName} 执行失败`, formattedError);
    } else {
      logger[logLevel](`命令 ${commandName} 执行失败`, formattedError);
    }

    // 显示用户友好的错误信息
    console.error('\n[错误]:');
    console.error('[错误] ' + formattedError.message);

    // 对于配置和认证错误，提供额外的指导
    if (formattedError instanceof ConfigError) {
      console.error('[提示] 请检查您的配置文件并重试。');
    } else if (formattedError instanceof AuthError) {
      console.error('[提示] 请使用 fx-cli auth 命令重新登录。');
    }

    return exitCode;
  }

  /**
   * 安全地执行异步操作并处理错误
   * @param {Function} asyncFunction - 异步函数
   * @param {Function} errorHandler - 自定义错误处理函数（可选）
   * @returns {Promise<any>} 异步操作结果
   */
  static async safelyExecute(asyncFunction, errorHandler = null) {
    try {
      return await asyncFunction();
    } catch (error) {
      if (errorHandler) {
        return errorHandler(error);
      }
      throw error;
    }
  }
}

module.exports = {
  ErrorHandler,
  FxError,
  ConfigError,
  AuthError,
  PermissionError,
  NotFoundError,
  ApiError,
  BuildError,
  JenkinsError
};
