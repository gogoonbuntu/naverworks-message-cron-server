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
        const config = configService.loadConfig();
        const allMembers = config.teamMembers;
        const authorizedMembers = allMembers.filter(member => member.isAuthorized);
        
        if (authorizedMembers.length === 0) {
            return {
                success: false,
                message: '권한이 있는 팀원이 없습니다. 먼저 팀원을 추가해주세요.'
            };
        }
        
        if (allMembers.length < 2) {
            return {
                success: false,
                message: '당직 편성을 위해 최소 2명의 팀원이 필요합니다.'
            };
        }
        
        const weekKey = getWeekKey();
        logger.info(`Generating preview for week: ${weekKey}`);
        
        // 미리보기 데이터 생성
        const previewData = generateWeeklyScheduleData(authorizedMembers, weekKey);
        
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
 * 주간 스케줄 데이터 생성
 * 규칙:
 * 1. 하루에 2명씩 배정
 * 2. 그 중 최소 1명은 권한 있는 사람
 * 3. 금, 토, 일은 같은 사람으로 배정
 * 4. 평일(월화수목)에서 연일 당직 방지
 */
function generateWeeklyScheduleData(authorizedMembers, weekKey) {
    const config = configService.loadConfig();
    const allMembers = config.teamMembers;
    const weekDates = getWeekDates();
    const weeklySchedule = [];
    
    // 권한자와 일반 팀원 분리
    const authorizedOnly = allMembers.filter(m => m.isAuthorized);
    const regularMembers = allMembers.filter(m => !m.isAuthorized);
    
    logger.info(`Available members: ${authorizedOnly.length} authorized, ${regularMembers.length} regular`);
    
    if (authorizedOnly.length === 0) {
        throw new Error('권한이 있는 팀원이 없습니다.');
    }
    
    // 당직 횟수 기준으로 정렬 후 셔플 (공평하면서도 랜덤하게)
    const shuffledAuthorized = [...authorizedOnly]
        .sort((a, b) => (a.dutyCount || 0) - (b.dutyCount || 0))  // 공평하게 정렬
        .sort(() => Math.random() - 0.5);  // 같은 횟수끼리는 셔플
    
    const shuffledRegular = [...regularMembers]
        .sort((a, b) => (a.dutyCount || 0) - (b.dutyCount || 0))
        .sort(() => Math.random() - 0.5);
    
    // 금토일 연속 당직자 랜덤 선택 (권한자 중에서)
    const weekendDutyPerson = shuffledAuthorized[Math.floor(Math.random() * shuffledAuthorized.length)];
    
    // 금토일 두 번째 당직자 선택 (주말 연속 당직자와 다른 사람)
    let weekendSecondPerson = null;
    if (shuffledAuthorized.length > 1) {
        const otherAuthorized = shuffledAuthorized.filter(m => m.id !== weekendDutyPerson.id);
        weekendSecondPerson = otherAuthorized[Math.floor(Math.random() * otherAuthorized.length)];
    } else if (shuffledRegular.length > 0) {
        weekendSecondPerson = shuffledRegular[Math.floor(Math.random() * shuffledRegular.length)];
    }
    
    // 평일 당직자 풀 준비 (주말 당직자를 제외한 나머지 인원)
    const weekdayAvailableAuthorized = shuffledAuthorized.filter(m => m.id !== weekendDutyPerson.id);
    const weekdayAvailableRegular = shuffledRegular.filter(m => 
        !weekendSecondPerson || m.id !== weekendSecondPerson.id
    );
    
    // 평일 당직 배정 전략: 연일 당직 방지
    const weekdaySchedule = generateWeekdaySchedule(
        weekdayAvailableAuthorized, 
        weekdayAvailableRegular, 
        weekendDutyPerson
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
            const allAvailable = [...shuffledAuthorized, ...shuffledRegular]
                .filter(m => !assignedMembers.find(assigned => assigned.id === m.id));
            
            while (assignedMembers.length < 2 && allAvailable.length > 0) {
                const randomIndex = Math.floor(Math.random() * allAvailable.length);
                assignedMembers.push(allAvailable[randomIndex]);
                allAvailable.splice(randomIndex, 1);
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
    logger.info(`- Weekday authorized pool: ${weekdayAvailableAuthorized.length} members`);
    logger.info(`- Weekday regular pool: ${weekdayAvailableRegular.length} members`);
    logger.info(`- Weekday schedule: ${weekdaySchedule.map((day, i) => 
        `${['월', '화', '수', '목'][i]}: ${day.map(m => m.name).join(' & ')}`
    ).join(', ')}`);
    
    return weeklySchedule;
}

/**
 * 평일 당직 스케줄 생성 (연일 당직 방지)
 * @param {Array} authorizedPool - 사용 가능한 권한자 리스트
 * @param {Array} regularPool - 사용 가능한 일반 팀원 리스트
 * @param {Object} weekendDutyPerson - 주말 당직자 (평일에 사용 가능)
 * @returns {Array} 4일간(월화수목) 당직 배정 배열
 */
function generateWeekdaySchedule(authorizedPool, regularPool, weekendDutyPerson) {
    const weekdaySchedule = [];
    const maxAttempts = 50; // 무한 루프 방지
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        weekdaySchedule.length = 0; // 배열 초기화
        let success = true;
        
        // 전체 인원 풀 준비
        const allPool = [...authorizedPool, ...regularPool, weekendDutyPerson];
        
        // 4일간(월화수목) 당직 배정
        for (let dayIndex = 0; dayIndex < 4; dayIndex++) {
            const availableMembers = [];
            
            // 권한자 우선 선택
            for (const member of [...authorizedPool, weekendDutyPerson]) {
                if (canAssignMember(member, dayIndex, weekdaySchedule)) {
                    availableMembers.push(member);
                }
            }
            
            // 권한자가 없으면 시도 실패
            if (availableMembers.length === 0) {
                success = false;
                break;
            }
            
            // 권한자 중 랜덤 선택
            const firstMember = availableMembers[Math.floor(Math.random() * availableMembers.length)];
            
            // 두 번째 당직자 선택
            const secondAvailableMembers = [];
            for (const member of allPool) {
                if (member.id !== firstMember.id && canAssignMember(member, dayIndex, weekdaySchedule)) {
                    secondAvailableMembers.push(member);
                }
            }
            
            let secondMember = null;
            if (secondAvailableMembers.length > 0) {
                // 일반 팀원 우선 선택
                const regularCandidates = secondAvailableMembers.filter(m => !m.isAuthorized);
                if (regularCandidates.length > 0) {
                    secondMember = regularCandidates[Math.floor(Math.random() * regularCandidates.length)];
                } else {
                    secondMember = secondAvailableMembers[Math.floor(Math.random() * secondAvailableMembers.length)];
                }
            }
            
            // 두 번째 당직자를 찾을 수 없으면 시도 실패
            if (!secondMember) {
                success = false;
                break;
            }
            
            weekdaySchedule.push([firstMember, secondMember]);
        }
        
        if (success) {
            logger.info(`Weekday schedule generated successfully on attempt ${attempt + 1}`);
            return weekdaySchedule;
        }
    }
    
    // 최대 시도 횟수를 초과한 경우 기본 스케줄 생성
    logger.warn(`Failed to generate weekday schedule without consecutive days after ${maxAttempts} attempts. Using fallback.`);
    return generateFallbackWeekdaySchedule(authorizedPool, regularPool, weekendDutyPerson);
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
 * 연일 당직 방지 실패 시 대체 스케줄 생성
 * @param {Array} authorizedPool - 사용 가능한 권한자 리스트
 * @param {Array} regularPool - 사용 가능한 일반 팀원 리스트
 * @param {Object} weekendDutyPerson - 주말 당직자
 * @returns {Array} 4일간 당직 배정 배열
 */
function generateFallbackWeekdaySchedule(authorizedPool, regularPool, weekendDutyPerson) {
    const weekdaySchedule = [];
    const allPool = [...authorizedPool, ...regularPool, weekendDutyPerson];
    
    // 간단한 순환 방식으로 배정
    for (let dayIndex = 0; dayIndex < 4; dayIndex++) {
        const availableAuthorized = [...authorizedPool, weekendDutyPerson];
        const firstMember = availableAuthorized[dayIndex % availableAuthorized.length];
        
        // 두 번째 당직자 선택
        const otherMembers = allPool.filter(m => m.id !== firstMember.id);
        const secondMember = otherMembers[dayIndex % otherMembers.length];
        
        weekdaySchedule.push([firstMember, secondMember]);
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
    generateWeekdaySchedule,
    canAssignMember,
    generateFallbackWeekdaySchedule,
    generatePreviewMessage,
    generateConfirmationMessage,
    getWeekKey,
    generateWeeklyDutyMessage,
    sendDutyReminderMessage
};
