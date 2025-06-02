#!/usr/bin/env node
const { exec, execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// 线程池大小，控制并发删除的数量
const THREAD_POOL_SIZE = 50;

// 创建交互式命令行界面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 执行Git命令
function runGitCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    console.error(`执行Git命令失败: ${error.message}`);
    process.exit(1);
  }
}

// 异步执行Git命令
function runGitCommandAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// 检查是否是"标签不存在"的错误
function isTagNotFoundError(error) {
  const errorMessage = error.stderr || '';
  return errorMessage.includes('remote ref does not exist') || 
         errorMessage.includes('remote ref is at') || 
         errorMessage.includes('tag does not exist');
}

// 同步远程标签
async function syncRemoteTags() {
  console.log('正在同步远程标签...');
  
  try {
    // 清理本地已删除的远程标签
    await runGitCommandAsync('git fetch --prune --tags');
    console.log('远程标签同步完成\n');
  } catch (error) {
    console.error(`同步远程标签失败: ${error.stderr}`);
    process.exit(1);
  }
}

// 主函数
async function main() {
  // 先同步远程标签
  await syncRemoteTags();
  
  console.log('正在获取所有Git标签...\n');
  
  // 获取所有标签
  const tagsOutput = runGitCommand('git tag');
  const allTags = tagsOutput.split('\n').filter(tag => tag.trim() !== '');
  
  if (allTags.length === 0) {
    console.log('未找到任何标签。');
    rl.close();
    return;
  }
  
  // 筛选标签
  const tagsToDelete = [];
  const tagsToKeep = [];
  
  allTags.forEach(tag => {
    // 检查标签是否以 v35、v36、v37、v38 开头
    const startsWith = tag.startsWith('v35') || tag.startsWith('v36') || 
                       tag.startsWith('v37') || tag.startsWith('v38');
    
    if (startsWith) {
      // 检查标签是否包含非数字和非点字符（表示有后缀）
      const hasSuffix = /[^0-9.]/.test(tag.substring(3));
      
      if (hasSuffix) {
        tagsToDelete.push(tag);
      } else {
        tagsToKeep.push(tag);
      }
    } else {
      // 检查是否是版本号标签（以v开头）
      if (tag.startsWith('v')) {
        tagsToDelete.push(tag);
      } else {
        tagsToKeep.push(tag);
      }
    }
  });
  
  console.log(`\n共找到 ${allTags.length} 个标签`);
  
  // 显示详细的保留标签列表
  if (tagsToKeep.length > 0) {
    console.log(`\n将保留的 ${tagsToKeep.length} 个标签:`);
    tagsToKeep.forEach((tag, index) => {
      console.log(`${index + 1}. ${tag}`);
    });
  }
  
  // 只显示删除标签的数量，不显示具体标签列表
  if (tagsToDelete.length > 0) {
    console.log(`\n将删除 ${tagsToDelete.length} 个标签`);
  }
  
  // 确认删除
  if (tagsToDelete.length === 0) {
    console.log('\n没有标签需要删除。');
    rl.close();
    return;
  }
  
  rl.question(`\n您确定要删除上述 ${tagsToDelete.length} 个远程标签吗？(y/n): `, async (answer) => {
    if (answer.toLowerCase() !== 'y') {
      console.log('操作已取消。');
      rl.close();
      return;
    }
    
    console.log('\n开始使用线程池异步删除远程标签...\n');
    
    // 使用线程池控制并发
    const threadPool = new ThreadPool(THREAD_POOL_SIZE);
    
    // 记录结果
    const successTags = [];
    const failedTags = [];
    const deletedLocalTags = [];
    
    // 为每个标签创建删除任务
    const deleteTasks = tagsToDelete.map(tag => {
      return async () => {
        console.log(`正在删除标签: ${tag}`);
        
        try {
          await runGitCommandAsync(`git push origin --delete ${tag}`);
          successTags.push(tag);
          console.log(`✅ [${successTags.length + failedTags.length}/${tagsToDelete.length}] 远程标签删除成功: ${tag}`);
        } catch (error) {
          // 如果是"标签不存在"的错误，删除本地标签
          if (isTagNotFoundError(error)) {
            try {
              await runGitCommandAsync(`git tag -d ${tag}`);
              deletedLocalTags.push(tag);
              console.log(`⚠️ 远程标签已不存在，已删除本地标签: ${tag}`);
            } catch (localError) {
              console.log(`⚠️ 远程标签已不存在，本地标签也不存在: ${tag}`);
            }
          } else {
            failedTags.push({ tag, error });
            console.error(`❌ [${successTags.length + failedTags.length}/${tagsToDelete.length}] 标签删除失败: ${tag} - ${error.stderr}`);
          }
        }
      };
    });
    
    // 执行所有任务
    await threadPool.runAll(deleteTasks);
    
    // 输出结果
    console.log(`\n删除操作完成: 成功 ${successTags.length} 个, 失败 ${failedTags.length} 个`);
    
    if (deletedLocalTags.length > 0) {
      console.log(`\n已删除 ${deletedLocalTags.length} 个远程不存在的本地标签:`);
      deletedLocalTags.forEach((tag, index) => {
        console.log(`${index + 1}. ${tag}`);
      });
    }
    
    if (failedTags.length > 0) {
      console.log(`\n以下 ${failedTags.length} 个标签删除失败:`);
      failedTags.forEach(({ tag, error }, index) => {
        console.log(`${index + 1}. ${tag} - ${error.stderr}`);
      });
    }
    
    console.log('\n您可以通过Git命令检查删除结果: git tag -l');
    rl.close();
  });
}

// 线程池实现
class ThreadPool {
  constructor(maxThreads) {
    this.maxThreads = maxThreads;
    this.running = 0;
    this.queue = [];
    this.results = [];
  }
  
  async runAll(tasks) {
    return new Promise((resolve) => {
      // 将所有任务添加到队列
      tasks.forEach(task => this.queue.push(task));
      
      // 启动线程
      this._startThreads();
      
      // 监听队列完成
      this._onComplete = resolve;
    });
  }
  
  _startThreads() {
    // 启动新线程直到达到最大线程数或队列为空
    while (this.running < this.maxThreads && this.queue.length > 0) {
      this._startThread();
    }
  }
  
  _startThread() {
    const task = this.queue.shift();
    if (!task) return;
    
    this.running++;
    
    // 执行任务
    task()
      .then(result => {
        this.results.push(result);
      })
      .catch(error => {
        console.error('线程池任务错误:', error);
      })
      .finally(() => {
        this.running--;
        
        // 如果还有任务，继续启动线程
        if (this.queue.length > 0) {
          this._startThread();
        }
        
        // 如果所有任务都完成了，通知完成
        if (this.running === 0 && this.queue.length === 0) {
          this._onComplete(this.results);
        }
      });
  }
}

// 启动主函数
main();
