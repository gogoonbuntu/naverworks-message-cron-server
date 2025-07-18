// src/services/duty-service.js
// 당직 관리 서비스

const logger = require('../../logger');
const configService = require('./config-service');
const messageService = require('./message-service');
const { getCurrentKSTDate, formatDateToKey, getWeekDates, DAY_NAMES } = require('../utils/date-utils');

/**
 * 주간 당직 편성표 조회 (7일간의 일일 당직자)
 * @returns {Array} - 주간 당직 스케줄 배열
 */
function getWeeklyDutySchedule() {
    try {
        const config = configService.loadConfig();
        const weekDates = getWeekDates();
        
        const weeklySchedule = [];
        
        weekDates.forEach((dateKey, index) => {
            const date = new Date(dateKey);
            let members = [];
            
            // dailyDutySchedule에서 해당 날짜의 당직자 찾기
            const dutyData = config.dailyDutySchedule?.[dateKey];
            if (dutyData && dutyData.members) {
                members = dutyData.members;
            }
            
            weeklySchedule.push({
                date: dateKey,
                dayName: DAY_NAMES[index],
                displayDate: `${date.getMonth() + 1}/${date.getDate()}`,
                members: members.map(id => {
                    const member = config.teamMembers.find(m => m.id === id);
                    if (!member) {
                        logger.warn(`Member with ID '${id}' not found in current team members for date ${dateKey}`);
                    }
                    return member ? { id: member.id, name: member.name } : { id: id, name: id };
                })
            });
        });
        
        return weeklySchedule;
    } catch (error) {
        logger.error(`Error getting weekly duty schedule: ${error.message}`, error);
        return [];
    }
}

/**
 * 당일 당직자 조회 함수
 * @returns {Object|null} - 당일 당직자 정보 또는 null
 */
function getTodayDutyMembers() {
    try {
        const config = configService.loadConfig();
        const kstDate = getCurrentKSTDate();
        const dateKey = formatDateToKey(kstDate);
        
        logger.debug(`Looking for today's duty for date: ${dateKey}`);
        
        // dailyDutySchedule에서 당일 당직자 찾기
        const todayDuty = config.dailyDutySchedule?.[dateKey];
        
        if (!todayDuty || !todayDuty.members || todayDuty.members.length === 0) {
            logger.debug(`No duty found for today: ${dateKey}`);
            return {
                date: dateKey,
                members: [],
                displayDate: kstDate.toLocaleDateString('ko-KR'),
                hasNoDuty: true
            };
        }
        
        // 당직자 정보 반환
        const dutyMembers = todayDuty.members.map(id => {
            const member = config.teamMembers.find(m => m.id === id);
            return member ? { id: member.id, name: member.name } : { id: id, name: id };
        });
        
        logger.debug(`Today's duty members: ${dutyMembers.map(m => m.name).join(', ')}`);
        
        return {
            date: dateKey,
            members: dutyMembers,
            displayDate: kstDate.toLocaleDateString('ko-KR'),
            hasNoDuty: false
        };
        
    } catch (error) {
        logger.error(`Error getting today's duty members: ${error.message}`, error);
        return {
            date: null,
            members: [],
            displayDate: new Date().toLocaleDateString('ko-KR'),
            hasNoDuty: true,
            error: true
        };
    }
}

/**
 * 일간 당직 편성 함수
 * @param {string} date - 날짜 (YYYY-MM-DD)
 * @param {Array} dutyMembers - 당직자 ID 배열
 * @returns {Object} - 결과 객체
 */
async function assignDailyDuty(date, dutyMembers) {
    try {
        const config = configService.loadConfig();
        const dateKey = date; // YYYY-MM-DD 형식
        
        logger.info(`Setting daily duty for ${dateKey}`);
        
        // 일간 당직 저장
        configService.updateDailyDutySchedule(dateKey, dutyMembers);
        
        // 각 팀원의 당직 횟수 업데이트
        dutyMembers.forEach(memberId => {
            const member = config.teamMembers.find(m => m.id === memberId);
            if (member) {
                member.dutyCount = (member.dutyCount || 0) + 1;
            }
        });
        
        configService.updateTeamMembers(config.teamMembers);
        logger.info('Daily duty schedule saved successfully');
        
        return { success: true, message: '일간 당직이 성공적으로 저장되었습니다.' };
        
    } catch (error) {
        logger.error(`Error in daily duty assignment: ${error.message}`, error);
        return { success: false, message: '일간 당직 저장 중 오류가 발생했습니다.' };
    }
}

/**
 * 주간 당직 스케줄 미리보기 생성
 * 실제로 저장하지 않고 미리보기만 생성
 */
async function previewWeeklyDutySchedule() {
    logger.info('📋 Starting weekly duty schedule preview generation...');
    
    try {
        // 오래된 당직 스케줄 정리
        const cleanedCount = cleanupOldDutySchedule();
        if (cleanedCount > 0) {
            logger.info(`Cleaned up ${cleanedCount} old duty schedule entries`);
        }
        
        const config = configService.loadConfig();
        const allMembers = config.teamMembers;
        const authorizedMembers = allMembers.filter(member => member.isAuthorized);
        
        if (allMembers.length < 2) {
            return {
                success: false,
                message: '당직 편성을 위해 최소 2명의 팀원이 필요합니다.'
            };
        }
        
        // 권한자가 없어도 진행 가능하도록 수정
        if (authorizedMembers.length === 0) {
            logger.warn('No authorized members available. Proceeding with regular members only.');
        }
        
        const weekKey = getWeekKey();
        logger.info(`Generating preview for week: ${weekKey}`);
        
        // 미리보기 데이터 생성 (전체 멤버 정보 전달)
        const previewData = generateWeeklyScheduleData(allMembers, weekKey);
        
        // 미리보기 메시지 생성
        const previewMessage = generatePreviewMessage(previewData, weekKey);
        
        logger.info(`Weekly duty preview generated successfully for week ${weekKey}`);
        
        return {
            success: true,
            message: '주간 당직 미리보기가 생성되었습니다.',
            data: previewData,
            preview: previewMessage
        };
        
    } catch (error) {
        logger.error('Error generating weekly duty preview:', error);
        return {
            success: false,
            message: `주간 당직 미리보기 생성 중 오류가 발생했습니다: ${error.message}`
        };
    }
}

/**
 * 주간 당직 스케줄 확정
 * 미리보기 데이터를 실제로 저장하고 메시지 전송
 */
async function confirmWeeklyDutySchedule(previewData) {
    logger.info('📋 Confirming weekly duty schedule...');
    
    try {
        const config = configService.loadConfig();
        const weekKey = getWeekKey();
        
        // 각 날짜별로 당직 저장
        for (const day of previewData) {
            const memberIds = day.members.map(m => m.id);
            await assignDailyDuty(day.date, memberIds);
        }
        
        // 메시지 생성 및 전송
        const message = generateConfirmationMessage(previewData, weekKey);
        await messageService.sendChannelMessage(message);
        
        logger.info(`Weekly duty schedule confirmed and saved for week: ${weekKey}`);
        logger.logConfigChange('weekly-duty', `Weekly duty schedule confirmed for ${weekKey}`, previewData);
        
        return {
            success: true,
            message: '주간 당직이 편성되어 채널에 알림이 전송되었습니다.'
        };
        
    } catch (error) {
        logger.error('Error confirming weekly duty schedule:', error);
        return {
            success: false,
            message: `주간 당직 확정 중 오류가 발생했습니다: ${error.message}`
        };
    }
}

/**
 * 주간 스케줄 데이터 생성 (수정된 버전)
 * 규칙:
 * 1. 하루에 2명씩 배정
 * 2. 그 중 최소 1명은 권한 있는 사람 (가능한 경우에만)
 * 3. 금, 토, 일은 같은 사람으로 배정
 * 4. 평일(월화수목)에서 연일 당직 방지
 * 5. 주말 당직자 선택 시 최근 당직 횟수와 이전 주말 당직 이력 고려
 */
function generateWeeklyScheduleData(allMembersParam, weekKey) {
    const config = configService.loadConfig();
    const allMembers = config.teamMembers;
    const weekDates = getWeekDates();
    const weeklySchedule = [];
    
    // 현재 활성화된 팀멤버들 확인
    logger.info(`Current active team members: ${allMembers.map(m => `${m.name}(${m.id})`).join(', ')}`);
    
    // 장영지(yjjang)가 팀멤버에 포함되어 있는지 확인
    const yjjangMember = allMembers.find(m => m.id === 'yjjang');
    if (yjjangMember) {
        logger.info(`장영지(yjjang) found in team members: ${yjjangMember.name}`);
    } else {
        logger.warn('장영지(yjjang) not found in team members!');
    }
    
    // 권한자와 일반 팀원 분리
    const authorizedOnly = allMembers.filter(m => m.isAuthorized);
    const regularMembers = allMembers.filter(m => !m.isAuthorized);
    
    logger.info(`Available members: ${authorizedOnly.length} authorized, ${regularMembers.length} regular`);
    logger.info(`Regular members: ${regularMembers.map(m => `${m.name}(${m.id})`).join(', ')}`);
    
    // 권한자가 없는 경우 경고 로그만 남기고 계속 진행
    if (authorizedOnly.length === 0) {
        logger.warn('No authorized members available. Proceeding with regular members only.');
    }
    
    // 주말 당직자 선택 로직 개선
    const weekendDutyPerson = selectWeekendDutyPerson(allMembers, authorizedOnly);
    
    // 주말 두 번째 당직자 선택 (첫 번째 당직자와 다른 사람)
    let weekendSecondPerson = selectWeekendSecondPerson(allMembers, weekendDutyPerson, authorizedOnly);
    
    // 평일 당직자 풀 준비 (주말 당직자를 제외한 나머지 인원)
    const weekdayAvailableMembers = allMembers.filter(m => 
        m.id !== weekendDutyPerson.id && 
        (!weekendSecondPerson || m.id !== weekendSecondPerson.id)
    );
    
    // 평일 당직 배정 전략: 연일 당직 방지
    const weekdaySchedule = generateWeekdaySchedule(
        weekdayAvailableMembers, 
        weekendDutyPerson,
        weekendSecondPerson
    );
    
    // 각 날짜별 당직 배정
    for (let i = 0; i < 7; i++) {
        const dateKey = weekDates[i];
        const currentDate = new Date(dateKey);
        const dayName = DAY_NAMES[i];
        const dayOfWeek = currentDate.getDay(); // 0=일요일, 1=월요일, ..., 6=토요일
        
        let assignedMembers = [];
        
        // 금요일(5), 토요일(6), 일요일(0)은 같은 사람으로 배정
        if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
            // 주말 연속 당직자 배정
            assignedMembers.push(weekendDutyPerson);
            
            // 주말 두 번째 당직자 배정
            if (weekendSecondPerson) {
                assignedMembers.push(weekendSecondPerson);
            }
        } else {
            // 평일 (월, 화, 수, 목) 당직 배정 - 미리 생성된 스케줄 사용
            const weekdayIndex = [1, 2, 3, 4].indexOf(dayOfWeek); // 월(1), 화(2), 수(3), 목(4)
            if (weekdayIndex >= 0 && weekdayIndex < weekdaySchedule.length) {
                assignedMembers = weekdaySchedule[weekdayIndex];
            }
        }
        
        // 2명이 아닌 경우 남은 사람 중에서 추가 배정
        if (assignedMembers.length < 2) {
            const allAvailable = [...allMembers]
                .filter(m => !assignedMembers.find(assigned => assigned.id === m.id))
                .sort((a, b) => (a.dutyCount || 0) - (b.dutyCount || 0)); // 당직 횟수 적은 순으로 정렬
            
            while (assignedMembers.length < 2 && allAvailable.length > 0) {
                assignedMembers.push(allAvailable.shift());
            }
        }
        
        weeklySchedule.push({
            date: dateKey,
            dayName: dayName,
            displayDate: currentDate.toLocaleDateString('ko-KR'),
            members: assignedMembers,
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
            weekKey: weekKey
        });
    }
    
    logger.info(`Weekly schedule generated:`);
    logger.info(`- Weekend duty person: ${weekendDutyPerson.name}`);
    logger.info(`- Weekend second person: ${weekendSecondPerson ? weekendSecondPerson.name : 'None'}`);
    logger.info(`- Weekday available pool: ${weekdayAvailableMembers.length} members`);
    
    return weeklySchedule;
}

/**
 * 주말 당직자 선택 함수 (개선된 버전)
 * 당직 횟수와 이전 주말 당직 이력을 고려하되, 더 다양한 조합이 나오도록 개선
 */
function selectWeekendDutyPerson(allMembers, authorizedMembers) {
    logger.info('=== 주말 당직자 선택 시작 ===');
    
    // 1. 모든 멤버를 후보로 시작 (권한자 우선이지만 일반 멤버도 포함)
    let candidates = [...allMembers];
    
    // 2. 최근 주말 당직 이력 확인 (지난 3주간의 금토일 당직 이력)
    const recentWeekendDuty = getRecentWeekendDutyHistory(3);
    logger.info(`최근 3주간 주말 당직 이력: ${recentWeekendDuty.join(', ')}`);
    
    // 3. 최근 주말 당직을 하지 않은 사람들 우선 선택
    const nonRecentWeekendDuty = candidates.filter(member => 
        !recentWeekendDuty.includes(member.id)
    );
    
    if (nonRecentWeekendDuty.length > 0) {
        candidates = nonRecentWeekendDuty;
        logger.info(`최근 주말 당직 안한 후보들: ${candidates.map(m => m.name).join(', ')}`);
    } else {
        logger.info('모든 멤버가 최근 주말 당직을 함. 전체 후보 대상으로 선택');
    }
    
    // 4. 권한자가 있는 경우 70% 확률로 권한자 우선, 30% 확률로 전체 후보
    const authorizedCandidates = candidates.filter(m => m.isAuthorized);
    const shouldPrioritizeAuthorized = Math.random() < 0.7; // 70% 확률
    
    if (authorizedCandidates.length > 0 && shouldPrioritizeAuthorized) {
        candidates = authorizedCandidates;
        logger.info('권한자 우선 선택 (70% 확률)');
    } else {
        logger.info('전체 후보 대상 선택 (30% 확률 또는 권한자 없음)');
    }
    
    // 5. 당직 횟수 기반 가중치 선택 (완전히 공평하지는 않지만 다양성 증가)
    const maxDutyCount = Math.max(...candidates.map(m => m.dutyCount || 0));
    const minDutyCount = Math.min(...candidates.map(m => m.dutyCount || 0));
    
    // 당직 횟수가 적을수록 높은 가중치
    const weightedCandidates = candidates.map(member => {
        const dutyCount = member.dutyCount || 0;
        const weight = maxDutyCount - dutyCount + 1; // 가중치 계산
        return { member, weight };
    });
    
    // 가중치 기반 랜덤 선택
    const totalWeight = weightedCandidates.reduce((sum, item) => sum + item.weight, 0);
    let randomValue = Math.random() * totalWeight;
    
    let selected = null;
    for (const item of weightedCandidates) {
        randomValue -= item.weight;
        if (randomValue <= 0) {
            selected = item.member;
            break;
        }
    }
    
    // 안전장치: 선택되지 않은 경우 첫 번째 후보 선택
    if (!selected) {
        selected = candidates[0];
    }
    
    logger.info(`주말 당직자 선택 결과:`);
    logger.info(`- 전체 후보: ${candidates.map(m => `${m.name}(${m.dutyCount || 0})`).join(', ')}`);
    logger.info(`- 당직 횟수 범위: ${minDutyCount}~${maxDutyCount}`);
    logger.info(`- 선택된 멤버: ${selected.name}(${selected.dutyCount || 0})`);
    
    return selected;
}

/**
 * 주말 두 번째 당직자 선택 함수 (개선된 버전)
 * 다양한 조합을 위해 더 유연한 선택 로직 적용
 */
function selectWeekendSecondPerson(allMembers, firstPerson, authorizedMembers) {
    logger.info('=== 주말 두 번째 당직자 선택 시작 ===');
    logger.info(`첫 번째 당직자: ${firstPerson.name}(${firstPerson.isAuthorized ? '권한자' : '일반'})`);
    
    // 첫 번째 당직자를 제외한 나머지 인원
    let candidates = allMembers.filter(m => m.id !== firstPerson.id);
    
    if (candidates.length === 0) {
        logger.warn('사용 가능한 두 번째 당직자가 없음');
        return null;
    }
    
    // 권한자 요구사항 확인 (최소 1명은 권한자여야 함)
    const needAuthorized = !firstPerson.isAuthorized; // 첫 번째가 일반이면 두 번째는 반드시 권한자
    const authorizedCandidates = candidates.filter(m => m.isAuthorized);
    
    if (needAuthorized && authorizedCandidates.length > 0) {
        // 반드시 권한자가 필요한 경우
        candidates = authorizedCandidates;
        logger.info(`권한자 필수 선택: ${candidates.map(m => m.name).join(', ')}`);
    } else if (!needAuthorized) {
        // 첫 번째가 이미 권한자인 경우, 50% 확률로 일반/권한자 선택
        const shouldSelectRegular = Math.random() < 0.5;
        const regularCandidates = candidates.filter(m => !m.isAuthorized);
        
        if (shouldSelectRegular && regularCandidates.length > 0) {
            candidates = regularCandidates;
            logger.info(`일반 멤버 선택 (50% 확률): ${candidates.map(m => m.name).join(', ')}`);
        } else {
            logger.info(`전체 후보 대상 선택: ${candidates.map(m => m.name).join(', ')}`);
        }
    } else {
        logger.info(`전체 후보 대상 선택 (권한자 없음): ${candidates.map(m => m.name).join(', ')}`);
    }
    
    // 당직 횟수 기반 가중치 선택
    const maxDutyCount = Math.max(...candidates.map(m => m.dutyCount || 0));
    const minDutyCount = Math.min(...candidates.map(m => m.dutyCount || 0));
    
    const weightedCandidates = candidates.map(member => {
        const dutyCount = member.dutyCount || 0;
        const weight = maxDutyCount - dutyCount + 1;
        return { member, weight };
    });
    
    // 가중치 기반 랜덤 선택
    const totalWeight = weightedCandidates.reduce((sum, item) => sum + item.weight, 0);
    let randomValue = Math.random() * totalWeight;
    
    let selected = null;
    for (const item of weightedCandidates) {
        randomValue -= item.weight;
        if (randomValue <= 0) {
            selected = item.member;
            break;
        }
    }
    
    if (!selected) {
        selected = candidates[0];
    }
    
    logger.info(`두 번째 당직자 선택 결과:`);  
    logger.info(`- 당직 횟수 범위: ${minDutyCount}~${maxDutyCount}`);
    logger.info(`- 선택된 멤버: ${selected.name}(${selected.dutyCount || 0})`);
    logger.info(`- 최종 주말 조합: ${firstPerson.name} & ${selected.name}`);
    
    return selected;
}

/**
 * 최근 주말 당직 이력 조회
 * @param {number} weeks - 조회할 주 수
 * @returns {Array} 최근 주말 당직자 ID 배열
 */
function getRecentWeekendDutyHistory(weeks = 2) {
    const config = configService.loadConfig();
    const dailySchedule = config.dailyDutySchedule;
    const recentWeekendDuty = [];
    
    const today = new Date();
    
    for (let i = 0; i < weeks * 7; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        
        const dayOfWeek = checkDate.getDay();
        // 금요일(5), 토요일(6), 일요일(0)만 확인
        if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
            const dateKey = formatDateToKey(checkDate);
            const dutyData = dailySchedule[dateKey];
            
            if (dutyData && dutyData.members) {
                recentWeekendDuty.push(...dutyData.members);
            }
        }
    }
    
    // 중복 제거
    return [...new Set(recentWeekendDuty)];
}

/**
 * 평일 당직 스케줄 생성 (수정된 버전)
 * @param {Array} availableMembers - 사용 가능한 팀원 리스트
 * @param {Object} weekendDutyPerson - 주말 당직자 (평일에도 사용 가능)
 * @param {Object} weekendSecondPerson - 주말 두 번째 당직자
 * @returns {Array} 4일간(월화수목) 당직 배정 배열
 */
function generateWeekdaySchedule(availableMembers, weekendDutyPerson, weekendSecondPerson) {
    const weekdaySchedule = [];
    const maxAttempts = 50; // 무한 루프 방지
    
    // 주말 당직자들도 평일에 포함시킬 수 있도록 전체 풀에 추가
    const allAvailableMembers = [...availableMembers, weekendDutyPerson];
    if (weekendSecondPerson) {
        allAvailableMembers.push(weekendSecondPerson);
    }
    
    // 당직 횟수 기준으로 정렬
    allAvailableMembers.sort((a, b) => (a.dutyCount || 0) - (b.dutyCount || 0));
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        weekdaySchedule.length = 0; // 배열 초기화
        let success = true;
        
        // 4일간(월화수목) 당직 배정
        for (let dayIndex = 0; dayIndex < 4; dayIndex++) {
            const dayMembers = selectDayMembers(allAvailableMembers, dayIndex, weekdaySchedule);
            
            if (dayMembers.length < 2) {
                success = false;
                break;
            }
            
            weekdaySchedule.push(dayMembers);
        }
        
        if (success) {
            logger.info(`Weekday schedule generated successfully on attempt ${attempt + 1}`);
            return weekdaySchedule;
        }
    }
    
    // 최대 시도 횟수를 초과한 경우 기본 스케줄 생성
    logger.warn(`Failed to generate weekday schedule after ${maxAttempts} attempts. Using fallback.`);
    return generateFallbackWeekdaySchedule(availableMembers, weekendDutyPerson, weekendSecondPerson);
}

/**
 * 특정 날짜의 당직자 선택 (개선된 버전)
 * 다양한 조합을 위해 가중치 기반 선택 적용
 * @param {Array} allMembers - 전체 사용 가능한 팀원
 * @param {number} dayIndex - 날짜 인덱스
 * @param {Array} schedule - 지금까지 생성된 스케줄
 * @returns {Array} 선택된 당직자 배열
 */
function selectDayMembers(allMembers, dayIndex, schedule) {
    const selectedMembers = [];
    const dayNames = ['월요일', '화요일', '수요일', '목요일'];
    
    logger.info(`=== ${dayNames[dayIndex]} 당직자 선택 ===`);
    
    // 권한자와 일반 팀원 분리
    const authorizedMembers = allMembers.filter(m => m.isAuthorized);
    const regularMembers = allMembers.filter(m => !m.isAuthorized);
    
    // 첫 번째 당직자 선택 (권한자 우선, 하지만 80% 확률로 제한)
    const shouldPrioritizeAuthorized = Math.random() < 0.8; // 80% 확률
    const firstCandidates = (authorizedMembers.length > 0 && shouldPrioritizeAuthorized) 
        ? authorizedMembers 
        : allMembers;
    
    const availableFirst = firstCandidates.filter(m => canAssignMember(m, dayIndex, schedule));
    
    if (availableFirst.length > 0) {
        // 가중치 기반 선택
        const selected = selectWithWeight(availableFirst, '첫 번째 당직자');
        if (selected) {
            selectedMembers.push(selected);
            logger.info(`첫 번째 당직자 선택: ${selected.name}(${selected.dutyCount || 0})`);
        }
    }
    
    // 두 번째 당직자 선택
    if (selectedMembers.length > 0) {
        const firstPerson = selectedMembers[0];
        const availableSecond = allMembers.filter(m => 
            m.id !== firstPerson.id && 
            canAssignMember(m, dayIndex, schedule)
        );
        
        if (availableSecond.length > 0) {
            // 권한자 요구사항 확인
            let secondCandidates = availableSecond;
            
            if (!firstPerson.isAuthorized) {
                // 첫 번째가 일반이면 두 번째는 반드시 권한자
                const authorizedSecond = availableSecond.filter(m => m.isAuthorized);
                if (authorizedSecond.length > 0) {
                    secondCandidates = authorizedSecond;
                    logger.info('두 번째 당직자 권한자 필수 선택');
                }
            } else {
                // 첫 번째가 권한자이면 60% 확률로 일반 멤버 우선
                const shouldSelectRegular = Math.random() < 0.6;
                const regularSecond = availableSecond.filter(m => !m.isAuthorized);
                
                if (shouldSelectRegular && regularSecond.length > 0) {
                    secondCandidates = regularSecond;
                    logger.info('두 번째 당직자 일반 멤버 우선 선택 (60% 확률)');
                } else {
                    logger.info('두 번째 당직자 전체 후보 대상 선택');
                }
            }
            
            const selected = selectWithWeight(secondCandidates, '두 번째 당직자');
            if (selected) {
                selectedMembers.push(selected);
                logger.info(`두 번째 당직자 선택: ${selected.name}(${selected.dutyCount || 0})`);
            }
        }
    }
    
    logger.info(`${dayNames[dayIndex]} 최종 당직자: ${selectedMembers.map(m => m.name).join(' & ')}`);
    return selectedMembers;
}

/**
 * 가중치 기반 멤버 선택 유틸리티 함수
 * @param {Array} candidates - 후보 리스트
 * @param {string} description - 설명 (로그용)
 * @returns {Object} 선택된 멤버
 */
function selectWithWeight(candidates, description) {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    
    const maxDutyCount = Math.max(...candidates.map(m => m.dutyCount || 0));
    const minDutyCount = Math.min(...candidates.map(m => m.dutyCount || 0));
    
    // 당직 횟수가 적을수록 높은 가중치 (2배 차이로 설정)
    const weightedCandidates = candidates.map(member => {
        const dutyCount = member.dutyCount || 0;
        const weight = (maxDutyCount - dutyCount + 1) * 2; // 2배 가중치
        return { member, weight };
    });
    
    // 가중치 기반 랜덤 선택
    const totalWeight = weightedCandidates.reduce((sum, item) => sum + item.weight, 0);
    let randomValue = Math.random() * totalWeight;
    
    for (const item of weightedCandidates) {
        randomValue -= item.weight;
        if (randomValue <= 0) {
            return item.member;
        }
    }
    
    // 안전장치
    return candidates[0];
}

/**
 * 특정 당직자를 특정 날짜에 배정할 수 있는지 확인
 * @param {Object} member - 당직자
 * @param {number} dayIndex - 날짜 인덱스 (0=월, 1=화, 2=수, 3=목)
 * @param {Array} schedule - 지금까지 생성된 스케줄
 * @returns {boolean} 배정 가능 여부
 */
function canAssignMember(member, dayIndex, schedule) {
    // 이전 날짜 확인
    if (dayIndex > 0) {
        const prevDayMembers = schedule[dayIndex - 1];
        if (prevDayMembers.some(m => m.id === member.id)) {
            return false; // 연일 당직 방지
        }
    }
    
    // 다음 날짜 확인 (이미 배정된 경우)
    if (dayIndex < schedule.length - 1) {
        const nextDayMembers = schedule[dayIndex + 1];
        if (nextDayMembers.some(m => m.id === member.id)) {
            return false; // 연일 당직 방지
        }
    }
    
    return true;
}

/**
 * 연일 당직 방지 실패 시 대체 스케줄 생성 (수정된 버전)
 * @param {Array} availableMembers - 사용 가능한 팀원 리스트
 * @param {Object} weekendDutyPerson - 주말 당직자
 * @param {Object} weekendSecondPerson - 주말 두 번째 당직자
 * @returns {Array} 4일간 당직 배정 배열
 */
function generateFallbackWeekdaySchedule(availableMembers, weekendDutyPerson, weekendSecondPerson) {
    const weekdaySchedule = [];
    
    // 전체 풀에 주말 당직자들도 포함
    const allPool = [...availableMembers, weekendDutyPerson];
    if (weekendSecondPerson) {
        allPool.push(weekendSecondPerson);
    }
    
    // 당직 횟수 기준으로 정렬
    allPool.sort((a, b) => (a.dutyCount || 0) - (b.dutyCount || 0));
    
    // 간단한 순환 방식으로 배정
    for (let dayIndex = 0; dayIndex < 4; dayIndex++) {
        const firstMember = allPool[dayIndex % allPool.length];
        const secondMember = allPool[(dayIndex + Math.floor(allPool.length / 2)) % allPool.length];
        
        // 같은 사람이 선택되지 않도록 조정
        if (firstMember.id === secondMember.id && allPool.length > 1) {
            const altSecond = allPool[(dayIndex + 1) % allPool.length];
            weekdaySchedule.push([firstMember, altSecond]);
        } else {
            weekdaySchedule.push([firstMember, secondMember]);
        }
    }
    
    return weekdaySchedule;
}

/**
 * 미리보기 메시지 생성
 */
function generatePreviewMessage(previewData, weekKey) {
    let message = `📋 주간 당직 편성 미리보기 - ${weekKey}\n\n`;
    
    // 금토일 연속 당직자 찾기
    const fridayData = previewData.find(day => day.dayName === '금요일');
    if (fridayData && fridayData.members.length > 0) {
        const weekendDutyPerson = fridayData.members[0];
        message += `🎆 주말 연속 당직자: ${weekendDutyPerson.name}(${weekendDutyPerson.id})\n\n`;
    }
    
    previewData.forEach(day => {
        const membersText = day.members.length > 0 
            ? day.members.map(m => `${m.name}(${m.id})`).join(' & ')
            : '미배정';
        
        const emoji = day.isWeekend ? '🌴' : '🏢';
        const specialNote = (day.dayName === '금요일' || day.dayName === '토요일' || day.dayName === '일요일') ? ' ✨' : '';
        
        message += `${emoji} ${day.dayName} (${day.displayDate}): ${membersText}${specialNote}\n`;
    });
    
    message += '\n📝 당직 규칙:';
    message += '\n• 하루에 2명씩 배정';
    message += '\n• 최소 1명은 권한 있는 팀원';
    message += '\n• 금요일~일요일 연속 당직자 동일 (✨)';
    message += '\n• 평일(월화수목) 연일 당직 방지 🚫';
    message += '\n\n※ 이것은 미리보기입니다. 확정하시면 채널에 알림이 전송됩니다.';
    
    return message;
}

/**
 * 확정 메시지 생성
 */
function generateConfirmationMessage(scheduleData, weekKey) {
    let message = `🚨 주간 당직 편성 완료 - ${weekKey}\n\n`;
    message += '📅 이번 주 당직 스케줄이 확정되었습니다!\n\n';
    
    // 금토일 연속 당직자 찾기
    const fridayData = scheduleData.find(day => day.dayName === '금요일');
    if (fridayData && fridayData.members.length > 0) {
        const weekendDutyPerson = fridayData.members[0];
        message += `🎆 주말 연속 당직자: ${weekendDutyPerson.name}(${weekendDutyPerson.id}) 고생합니다!\n\n`;
    }
    
    scheduleData.forEach(day => {
        const membersText = day.members.length > 0 
            ? day.members.map(m => `${m.name}(${m.id})`).join(' & ')
            : '미배정';
        
        const emoji = day.isWeekend ? '🌴' : '🏢';
        const todayIndicator = day.date === new Date().toISOString().split('T')[0] ? ' ← 오늘' : '';
        const specialNote = (day.dayName === '금요일' || day.dayName === '토요일' || day.dayName === '일요일') ? ' ✨' : '';
        
        message += `${emoji} ${day.dayName} (${day.displayDate}): ${membersText}${specialNote}${todayIndicator}\n`;
    });
    
    message += '\n📝 당직 안내:';
    message += '\n• 하루에 2명씩 배정, 최소 1명은 권한자';
    message += '\n• 금요일~일요일 연속 당직자 동일 (✨)';
    message += '\n• 평일(월화수목) 연일 당직 방지 🚫';
    message += '\n\n💡 당직자분들은 매일 오후 2시, 4시에 당직 체크 알림을 받게 됩니다.';
    message += '\n📱 노트북 지참 알림은 매일 오전 9시에 당일 당직자에게 개별 전송됩니다.';
    
    return message;
}

/**
 * 현재 주차 키 생성
 */
function getWeekKey() {
    const now = new Date();
    const weekDates = getWeekDates();
    const startDate = new Date(weekDates[0]);
    const endDate = new Date(weekDates[6]);
    
    return `${startDate.getMonth() + 1}/${startDate.getDate()}~${endDate.getMonth() + 1}/${endDate.getDate()}`;
}

/**
 * 주간 당직표 자동 편성 함수 (기존 호환성 유지)
 * @returns {Object} - 결과 객체
 */
async function assignWeeklyDutySchedule() {
    // 미리보기 생성
    const previewResult = await previewWeeklyDutySchedule();
    
    if (!previewResult.success) {
        return previewResult;
    }
    
    // 바로 확정 (기존 동작 유지)
    return await confirmWeeklyDutySchedule(previewResult.data);
}

/**
 * 주간 당직표 메시지 생성
 * @param {Array} assignments - 당직 배정 배열
 * @param {Object} config - 설정 객체
 * @returns {string} - 생성된 메시지
 */
function generateWeeklyDutyMessage(assignments, config) {
    let message = "📅 이번 주 당직 편성표 📅\n\n";
    
    assignments.forEach((assignment, index) => {
        const members = assignment.members.map(id => {
            const member = config.teamMembers.find(m => m.id === id);
            return member ? `${member.name}(${id})` : id;
        }).join(' & ');
        
        const date = new Date(assignment.date);
        const displayDate = `${date.getMonth() + 1}/${date.getDate()}`;
        
        message += `${DAY_NAMES[index]} (${displayDate}): ${members}\n`;
    });
    
    message += "\n💡 당직 안내:\n";
    message += "- 당직 시간: 매일 오후 2시, 4시 알림\n";
    message += "- 당직 업무: 사무실 보안 및 시설 점검\n";
    message += "- 긴급상황 발생시 즉시 보고\n\n";
    message += "수고하세요! 💪";
    
    return message;
}

/**
 * 오래된 당직 스케줄 정리 (현재 팀멤버에 없는 ID 제거)
 */
function cleanupOldDutySchedule() {
    try {
        const config = configService.loadConfig();
        const currentMemberIds = config.teamMembers.map(m => m.id);
        const dailySchedule = config.dailyDutySchedule;
        
        let cleanedCount = 0;
        
        // 각 날짜의 당직자 명단을 현재 팀멤버로 필터링
        Object.keys(dailySchedule).forEach(dateKey => {
            const dutyData = dailySchedule[dateKey];
            if (dutyData && dutyData.members) {
                const originalMembers = dutyData.members;
                const filteredMembers = originalMembers.filter(id => currentMemberIds.includes(id));
                
                if (originalMembers.length !== filteredMembers.length) {
                    const removedMembers = originalMembers.filter(id => !currentMemberIds.includes(id));
                    logger.info(`Cleaning up duty schedule for ${dateKey}: removed ${removedMembers.join(', ')}`);
                    
                    dutyData.members = filteredMembers;
                    cleanedCount++;
                    
                    // 비어있는 날짜는 삭제
                    if (filteredMembers.length === 0) {
                        delete dailySchedule[dateKey];
                        logger.info(`Removed empty duty schedule for ${dateKey}`);
                    }
                }
            }
        });
        
        if (cleanedCount > 0) {
            configService.saveConfig(config);
            logger.info(`Cleaned up ${cleanedCount} duty schedule entries`);
        }
        
        return cleanedCount;
    } catch (error) {
        logger.error(`Error cleaning up old duty schedule: ${error.message}`, error);
        return 0;
    }
}

/**
 * 당직자 알림 (매일 오후 2시, 4시) - 채널로 전송
 */
async function sendDutyReminderMessage() {
    try {
        const config = configService.loadConfig();
        const kstDate = getCurrentKSTDate();
        const dateKey = formatDateToKey(kstDate);
        const currentHour = kstDate.getHours();

        // 오늘의 당직자 찾기
        const todayDuty = config.dailyDutySchedule[dateKey];
        if (!todayDuty || !todayDuty.members || todayDuty.members.length === 0) {
            logger.warn(`No duty assignment found for ${dateKey}`);
            return;
        }

        const timeSlot = currentHour === 14 ? '오후 2시' : '오후 4시';
        const dutyMembers = todayDuty.members;
        const memberNames = dutyMembers.map(id => {
            const member = config.teamMembers.find(m => m.id === id);
            return member ? `${member.name}(${id})` : id;
        }).join(' & ');

        const displayDate = kstDate.toLocaleDateString('ko-KR');
        const message = `🔔 당직 알림 (${timeSlot}) 🔔\n\n` +
                       `오늘(${displayDate}) 당직자: ${memberNames}\n\n` +
                       `당직 체크사항:\n` +
                       `- 사무실 보안 상태 확인\n` +
                       `- 시설 이상 유무 점검\n` +
                       `- 긴급상황 대응 준비\n\n` +
                       `수고하세요! 💪`;

        // 채널로 알림 발송
        await messageService.sendChannelMessage(message);
        logger.info(`Duty reminder sent to channel for ${memberNames} at ${timeSlot}`);

    } catch (error) {
        logger.error(`Error in duty reminder: ${error.message}`, error);
    }
}

module.exports = {
    getWeeklyDutySchedule,
    getTodayDutyMembers,
    assignDailyDuty,
    assignWeeklyDutySchedule,
    previewWeeklyDutySchedule,
    confirmWeeklyDutySchedule,
    generateWeeklyScheduleData,
    selectWeekendDutyPerson,
    selectWeekendSecondPerson,
    getRecentWeekendDutyHistory,
    generateWeekdaySchedule,
    selectDayMembers,
    selectWithWeight,
    canAssignMember,
    generateFallbackWeekdaySchedule,
    generatePreviewMessage,
    generateConfirmationMessage,
    getWeekKey,
    generateWeeklyDutyMessage,
    sendDutyReminderMessage,
    cleanupOldDutySchedule
};
