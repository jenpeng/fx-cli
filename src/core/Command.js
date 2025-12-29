/**
 * 命令基类
 * 所有具体命令实现都需要继承此类
 */

const chalk = require('chalk');
const ora = require('ora');

class Command {
  constructor() {
    this.spinner = null;
  }

  /**
   * 执行命令的主入口，子类必须实现此方法
   */
  async execute() {
    throw new Error('子类必须实现execute方法');
  }

  /**
   * 显示加载中动画
   * @param {string} text - 加载提示文本
   */
  startSpinner(text) {
    this.spinner = ora(text).start();
  }

  /**
   * 更新加载中动画文本
   * @param {string} text - 新的提示文本
   */
  updateSpinner(text) {
    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  /**
   * 停止加载动画并显示成功信息
   * @param {string} text - 成功提示文本
   */
  stopSpinnerWithSuccess(text) {
    if (this.spinner) {
      this.spinner.succeed(text);
      this.spinner = null;
    } else {
      console.log(chalk.green('✓'), text);
    }
  }

  /**
   * 停止加载动画并显示失败信息
   * @param {string} text - 失败提示文本
   */
  stopSpinnerWithError(text) {
    if (this.spinner) {
      this.spinner.fail(text);
      this.spinner = null;
    } else {
      console.error(chalk.red('✗'), text);
    }
  }

  /**
   * 显示成功信息
   * @param {string} message - 成功消息
   */
  logSuccess(message) {
    console.log(chalk.green('✓'), message);
  }

  /**
   * 显示错误信息
   * @param {string} message - 错误消息
   */
  logError(message) {
    console.error(chalk.red('✗'), message);
  }

  /**
   * 显示警告信息
   * @param {string} message - 警告消息
   */
  logWarning(message) {
    console.log(chalk.yellow('!'), message);
  }

  /**
   * 显示普通信息
   * @param {string} message - 信息内容
   */
  logInfo(message) {
    console.log(chalk.blue('ℹ'), message);
  }

  /**
   * 检查参数是否有效
   * @param {*} value - 要检查的值
   * @param {string} errorMessage - 错误消息
   * @returns {boolean} 参数是否有效
   */
  validateParam(value, errorMessage) {
    if (!value) {
      this.logError(errorMessage);
      return false;
    }
    return true;
  }

  /**
   * 抛出错误并退出
   * @param {string} message - 错误消息
   * @param {number} code - 退出码
   */
  throwError(message, code = 1) {
    this.logError(message);
    process.exit(code);
  }
}

module.exports = Command;