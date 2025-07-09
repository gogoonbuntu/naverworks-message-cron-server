// src/services/background-task-manager.js
// 백그라운드 작업 관리자 - 새로고침에도 지속되는 작업 관리

const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

const TASKS_DIR = path.join(__dirname, '../../cache/background-tasks');
const TASK_STATUS_FILE = path.join(TASKS_DIR, 'task-status.json');

class BackgroundTaskManager {
    constructor() {
        this.runningTasks = new Map();
        this.taskCallbacks = new Map();
        this.progressCallbacks = new Map();
        
        this.ensureTasksDirectory();
        this.loadTasksFromDisk();
        
        // 주기적으로 작업 상태 저장
        setInterval(() => {
            this.saveTasksToDisk();
        }, 5000); // 5초마다 저장
    }

    /**
     * 작업 디렉토리 생성
     */
    ensureTasksDirectory() {
        if (!fs.existsSync(TASKS_DIR)) {
            fs.mkdirSync(TASKS_DIR, { recursive: true });
            logger.info('Created background tasks directory');
        }
    }

    /**
     * 디스크에서 작업 상태 로드
     */
    loadTasksFromDisk() {
        try {
            if (fs.existsSync(TASK_STATUS_FILE)) {
                const tasksData = JSON.parse(fs.readFileSync(TASK_STATUS_FILE, 'utf8'));
                
                // 실행 중이던 작업들을 복원
                for (const [taskId, taskData] of Object.entries(tasksData)) {
                    if (taskData.status === 'running') {
                        // 실행 중이던 작업은 실패로 처리 (서버 재시작으로 중단됨)
                        taskData.status = 'failed';
                        taskData.error = 'Server restart interrupted the task';
                        taskData.endTime = new Date().toISOString();
                    }
                    
                    this.runningTasks.set(taskId, taskData);
                }
                
                logger.info(`Loaded ${this.runningTasks.size} tasks from disk`);
            }
        } catch (error) {
            logger.error(`Error loading tasks from disk: ${error.message}`, error);
        }
    }

    /**
     * 작업 상태를 디스크에 저장
     */
    saveTasksToDisk() {
        try {
            const tasksData = {};
            this.runningTasks.forEach((taskData, taskId) => {
                tasksData[taskId] = taskData;
            });
            
            fs.writeFileSync(TASK_STATUS_FILE, JSON.stringify(tasksData, null, 2));
        } catch (error) {
            logger.error(`Error saving tasks to disk: ${error.message}`, error);
        }
    }

    /**
     * 새로운 작업 시작
     * @param {string} taskId - 작업 ID
     * @param {string} taskType - 작업 타입
     * @param {Object} taskData - 작업 데이터
     * @param {Function} taskFunction - 실행할 작업 함수
     * @param {Function} progressCallback - 진행도 콜백
     * @returns {Promise<Object>} - 작업 결과
     */
    async startTask(taskId, taskType, taskData, taskFunction, progressCallback = null) {
        // 이미 실행 중인 작업이 있는지 확인
        if (this.runningTasks.has(taskId) && this.runningTasks.get(taskId).status === 'running') {
            throw new Error('Task is already running');
        }

        const task = {
            id: taskId,
            type: taskType,
            status: 'running',
            startTime: new Date().toISOString(),
            endTime: null,
            progress: {
                percentage: 0,
                message: '작업을 시작하고 있습니다...',
                stage: 'initializing'
            },
            data: taskData,
            result: null,
            error: null
        };

        this.runningTasks.set(taskId, task);
        
        if (progressCallback) {
            this.progressCallbacks.set(taskId, progressCallback);
        }

        logger.info(`Started background task: ${taskId} (${taskType})`);

        try {
            // 진행도 업데이트 함수 생성
            const updateProgress = (percentage, message, stage = 'processing', details = {}) => {
                const taskData = this.runningTasks.get(taskId);
                if (taskData) {
                    taskData.progress = {
                        percentage,
                        message,
                        stage,
                        timestamp: new Date().toISOString(),
                        ...details
                    };
                    this.runningTasks.set(taskId, taskData);
                    
                    // 진행도 콜백 호출
                    const callback = this.progressCallbacks.get(taskId);
                    if (callback) {
                        callback(taskData.progress);
                    }
                }
            };

            // 작업 실행
            const result = await taskFunction(updateProgress);
            
            // 작업 완료 처리
            const completedTask = this.runningTasks.get(taskId);
            if (completedTask) {
                completedTask.status = 'completed';
                completedTask.endTime = new Date().toISOString();
                completedTask.result = result;
                completedTask.progress.percentage = 100;
                completedTask.progress.message = '작업이 완료되었습니다.';
                completedTask.progress.stage = 'completed';
                
                this.runningTasks.set(taskId, completedTask);
                logger.info(`Completed background task: ${taskId}`);
            }
            
            return result;
            
        } catch (error) {
            // 작업 실패 처리
            const failedTask = this.runningTasks.get(taskId);
            if (failedTask) {
                failedTask.status = 'failed';
                failedTask.endTime = new Date().toISOString();
                failedTask.error = error.message;
                failedTask.progress.message = '작업 중 오류가 발생했습니다.';
                failedTask.progress.stage = 'error';
                
                this.runningTasks.set(taskId, failedTask);
                logger.error(`Failed background task: ${taskId} - ${error.message}`);
            }
            
            throw error;
        } finally {
            // 콜백 정리
            this.taskCallbacks.delete(taskId);
            this.progressCallbacks.delete(taskId);
            
            // 디스크에 저장
            this.saveTasksToDisk();
        }
    }

    /**
     * 작업 취소
     * @param {string} taskId - 작업 ID
     * @returns {boolean} - 취소 성공 여부
     */
    cancelTask(taskId) {
        const task = this.runningTasks.get(taskId);
        if (!task) {
            return false;
        }

        if (task.status === 'running') {
            task.status = 'cancelled';
            task.endTime = new Date().toISOString();
            task.progress.message = '작업이 취소되었습니다.';
            task.progress.stage = 'cancelled';
            
            this.runningTasks.set(taskId, task);
            this.taskCallbacks.delete(taskId);
            this.progressCallbacks.delete(taskId);
            
            logger.info(`Cancelled background task: ${taskId}`);
            this.saveTasksToDisk();
            return true;
        }

        return false;
    }

    /**
     * 작업 상태 조회
     * @param {string} taskId - 작업 ID
     * @returns {Object|null} - 작업 상태
     */
    getTaskStatus(taskId) {
        return this.runningTasks.get(taskId) || null;
    }

    /**
     * 모든 작업 상태 조회
     * @param {string} status - 필터링할 상태 (선택사항)
     * @returns {Array} - 작업 목록
     */
    getAllTasks(status = null) {
        const tasks = Array.from(this.runningTasks.values());
        
        if (status) {
            return tasks.filter(task => task.status === status);
        }
        
        return tasks;
    }

    /**
     * 실행 중인 작업 조회
     * @returns {Array} - 실행 중인 작업 목록
     */
    getRunningTasks() {
        return this.getAllTasks('running');
    }

    /**
     * 완료된 작업 조회
     * @returns {Array} - 완료된 작업 목록
     */
    getCompletedTasks() {
        return this.getAllTasks('completed');
    }

    /**
     * 실패한 작업 조회
     * @returns {Array} - 실패한 작업 목록
     */
    getFailedTasks() {
        return this.getAllTasks('failed');
    }

    /**
     * 특정 타입의 작업 조회
     * @param {string} taskType - 작업 타입
     * @returns {Array} - 해당 타입의 작업 목록
     */
    getTasksByType(taskType) {
        return Array.from(this.runningTasks.values()).filter(task => task.type === taskType);
    }

    /**
     * 오래된 작업 정리
     * @param {number} maxAgeHours - 최대 보관 시간 (시간)
     * @returns {number} - 정리된 작업 수
     */
    cleanupOldTasks(maxAgeHours = 24) {
        const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        let cleanedCount = 0;
        
        for (const [taskId, task] of this.runningTasks.entries()) {
            if (task.status !== 'running' && task.endTime) {
                const endTime = new Date(task.endTime);
                if (endTime < cutoffTime) {
                    this.runningTasks.delete(taskId);
                    cleanedCount++;
                }
            }
        }
        
        if (cleanedCount > 0) {
            logger.info(`Cleaned up ${cleanedCount} old background tasks`);
            this.saveTasksToDisk();
        }
        
        return cleanedCount;
    }

    /**
     * 모든 작업 정리
     * @returns {number} - 정리된 작업 수
     */
    clearAllTasks() {
        const taskCount = this.runningTasks.size;
        this.runningTasks.clear();
        this.taskCallbacks.clear();
        this.progressCallbacks.clear();
        
        logger.info(`Cleared all ${taskCount} background tasks`);
        this.saveTasksToDisk();
        
        return taskCount;
    }

    /**
     * 작업 통계 조회
     * @returns {Object} - 작업 통계
     */
    getTaskStats() {
        const tasks = Array.from(this.runningTasks.values());
        
        return {
            total: tasks.length,
            running: tasks.filter(t => t.status === 'running').length,
            completed: tasks.filter(t => t.status === 'completed').length,
            failed: tasks.filter(t => t.status === 'failed').length,
            cancelled: tasks.filter(t => t.status === 'cancelled').length,
            byType: tasks.reduce((acc, task) => {
                acc[task.type] = (acc[task.type] || 0) + 1;
                return acc;
            }, {})
        };
    }

    /**
     * 작업 진행도 콜백 설정
     * @param {string} taskId - 작업 ID
     * @param {Function} callback - 진행도 콜백
     */
    setProgressCallback(taskId, callback) {
        this.progressCallbacks.set(taskId, callback);
    }

    /**
     * 작업 진행도 콜백 제거
     * @param {string} taskId - 작업 ID
     */
    removeProgressCallback(taskId) {
        this.progressCallbacks.delete(taskId);
    }

    /**
     * 작업이 실행 중인지 확인
     * @param {string} taskId - 작업 ID
     * @returns {boolean} - 실행 중 여부
     */
    isTaskRunning(taskId) {
        const task = this.runningTasks.get(taskId);
        return task && task.status === 'running';
    }

    /**
     * 특정 타입의 실행 중인 작업이 있는지 확인
     * @param {string} taskType - 작업 타입
     * @returns {boolean} - 실행 중인 작업 존재 여부
     */
    hasRunningTaskOfType(taskType) {
        return this.getRunningTasks().some(task => task.type === taskType);
    }

    /**
     * 작업 ID 생성
     * @param {string} taskType - 작업 타입
     * @param {string} identifier - 식별자 (선택사항)
     * @returns {string} - 생성된 작업 ID
     */
    generateTaskId(taskType, identifier = null) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const id = identifier ? `${taskType}_${identifier}_${timestamp}_${random}` : `${taskType}_${timestamp}_${random}`;
        return id;
    }
}

module.exports = BackgroundTaskManager;