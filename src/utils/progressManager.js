/**
 * 进度显示工具
 * 用于显示长时间运行操作的进度
 */

const chalk = require('chalk');
const chalkInstance = chalk.default || chalk;
const { cyan, white } = chalkInstance;
const ora = require('ora').default;
const cliProgress = require('cli-progress');
const { logger } = require('../core/Logger');

class ProgressManager {
  constructor() {
    this.spinners = new Map();
    this.progressBars = new Map();
  }

  /**
   * 创建并启动一个加载指示器
   * @param {string} text - 显示文本
   * @param {string} id - 唯一标识符
   * @returns {Object} 加载指示器对象
   */
  startSpinner(text, id = 'default') {
    // 如果已存在相同ID的spinner，先停止它
    if (this.spinners.has(id)) {
      this.stopSpinner(id);
    }

    const spinner = ora({
      text,
      color: 'cyan',
      spinner: 'dots'
    }).start();

    this.spinners.set(id, spinner);
    return spinner;
  }

  /**
   * 更新加载指示器文本
   * @param {string} text - 新的显示文本
   * @param {string} id - 加载指示器ID
   */
  updateSpinner(text, id = 'default') {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.text = text;
    }
  }

  /**
   * 停止加载指示器并显示成功信息
   * @param {string} text - 成功信息
   * @param {string} id - 加载指示器ID
   */
  succeedSpinner(text, id = 'default') {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.succeed(text);
      this.spinners.delete(id);
    }
  }

  /**
   * 停止加载指示器并显示失败信息
   * @param {string} text - 失败信息
   * @param {string} id - 加载指示器ID
   */
  failSpinner(text, id = 'default') {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.fail(text);
      this.spinners.delete(id);
    }
  }

  /**
   * 停止加载指示器并显示警告信息
   * @param {string} text - 警告信息
   * @param {string} id - 加载指示器ID
   */
  warnSpinner(text, id = 'default') {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.warn(text);
      this.spinners.delete(id);
    }
  }

  /**
   * 停止加载指示器并显示信息
   * @param {string} text - 信息
   * @param {string} id - 加载指示器ID
   */
  infoSpinner(text, id = 'default') {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.info(text);
      this.spinners.delete(id);
    }
  }

  /**
   * 停止指定的加载指示器
   * @param {string} id - 加载指示器ID
   */
  stopSpinner(id = 'default') {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.stop();
      this.spinners.delete(id);
    }
  }

  /**
   * 停止所有加载指示器
   */
  stopAllSpinners() {
    for (const [id, spinner] of this.spinners) {
      spinner.stop();
    }
    this.spinners.clear();
  }

  /**
   * 创建并启动一个进度条
   * @param {number} total - 总数
   * @param {string} text - 显示文本
   * @param {string} id - 唯一标识符
   * @returns {Object} 进度条对象
   */
  startProgressBar(total, text = 'Processing...', id = 'default') {
    if (this.progressBars.has(id)) {
      this.stopProgressBar(id);
    }

    const progressBar = new cliProgress.SingleBar({
      format: cyan('{bar}') + ' | {percentage}% | {value}/{total} | ' + white('{text}'),
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: false,
      forceTerminal: true
    });

    progressBar.start(total, 0, { text });
    this.progressBars.set(id, progressBar);
    return progressBar;
  }

  /**
   * 更新进度条
   * @param {number} value - 当前值
   * @param {string} text - 新的显示文本
   * @param {string} id - 进度条ID
   */
  updateProgressBar(value, text, id = 'default') {
    const progressBar = this.progressBars.get(id);
    if (progressBar) {
      progressBar.update(value, { text });
    }
  }

  /**
   * 停止进度条
   * @param {string} id - 进度条ID
   */
  stopProgressBar(id = 'default') {
    const progressBar = this.progressBars.get(id);
    if (progressBar) {
      progressBar.update(progressBar.getTotal(), { text: '推送完成' });
    }
    this.progressBars.delete(id);
  }

  /**
   * 停止所有进度条
   */
  stopAllProgressBars() {
    for (const [id, progressBar] of this.progressBars) {
      progressBar.stop();
    }
    this.progressBars.clear();
  }

  /**
   * 停止所有进度显示组件
   */
  stopAll() {
    this.stopAllSpinners();
    this.stopAllProgressBars();
  }

  /**
   * 显示任务列表进度
   * @param {Array} tasks - 任务列表
   * @param {Function} taskHandler - 任务处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 处理结果
   */
  async processTasksWithProgress(tasks, taskHandler, options = {}) {
    const {
      concurrent = 1,
      showProgressBar = true,
      showSpinner = true,
      progressText = '处理中...',
      taskName = (task, index) => `任务 ${index + 1}`
    } = options;

    const results = {
      success: [],
      failed: [],
      total: tasks.length
    };

    // 启动进度条
    let progressBar;
    if (showProgressBar) {
      progressBar = this.startProgressBar(tasks.length, progressText);
    }

    // 启动加载指示器
    let spinner;
    if (showSpinner) {
      spinner = this.startSpinner('正在处理任务...');
    }

    try {
      if (concurrent === 1) {
        // 串行处理
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i];
          const name = taskName(task, i);
          
          if (spinner) {
            this.updateSpinner(`正在处理: ${name}`);
          }

          try {
            const result = await taskHandler(task, i);
            results.success.push({ task, result, name });
          } catch (error) {
            results.failed.push({ task, error, name });
            logger.error(`任务失败: ${name}`, error);
          }

          if (progressBar) {
            this.updateProgressBar(i + 1, progressText);
          }
        }
      } else {
        // 并发处理
        const chunks = [];
        for (let i = 0; i < tasks.length; i += concurrent) {
          chunks.push(tasks.slice(i, i + concurrent));
        }

        let completed = 0;
        for (const chunk of chunks) {
          const promises = chunk.map(async (task, index) => {
            const globalIndex = tasks.indexOf(task);
            const name = taskName(task, globalIndex);
            
            try {
              const result = await taskHandler(task, globalIndex);
              return { success: true, task, result, name };
            } catch (error) {
              results.failed.push({ task, error, name });
              logger.error(`任务失败: ${name}`, error);
              return { success: false, task, error, name };
            }
          });

          const chunkResults = await Promise.all(promises);
          
          // 处理结果
          chunkResults.forEach(result => {
            if (result.success) {
              results.success.push({ task: result.task, result: result.result, name: result.name });
            }
          });

          completed += chunk.length;
          if (progressBar) {
            this.updateProgressBar(completed, progressText);
          }
        }
      }
    } finally {
      // 停止进度显示
      if (progressBar) {
        this.stopProgressBar();
      }
      if (spinner) {
        this.stopSpinner();
      }
    }

    return results;
  }

  /**
   * 显示简单的进度信息
   * @param {number} current - 当前值
   * @param {number} total - 总数
   * @param {string} text - 显示文本
   */
  showSimpleProgress(current, total, text = 'Processing...') {
    const percentage = Math.round((current / total) * 100);
    const barLength = 20;
    const filledLength = Math.round((percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    console.log(
      cyan(`[${bar}]`) +
      ` ${percentage}% ` +
      `(${current}/${total}) ` +
      white(text)
    );
  }
}

module.exports = new ProgressManager();