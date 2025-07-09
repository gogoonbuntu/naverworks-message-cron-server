// 스케줄 관리 함수들
const scheduleTypeSelect = document.getElementById('scheduleTypeSelect');
const messageGroup = document.getElementById('messageGroup');
const messageInput = document.getElementById('messageInput');
const cronScheduleInput = document.getElementById('cronScheduleInput');
const recipientsGroup = document.getElementById('recipientsGroup');
const recipientsInput = document.getElementById('recipientsInput');
const saveScheduleButton = document.getElementById('saveScheduleButton');
const scheduleStatusMessageDiv = document.getElementById('scheduleStatusMessage');
const scheduledListDiv = document.getElementById('scheduledList');

// 스케줄 타입 변경 시 UI 업데이트
scheduleTypeSelect.addEventListener('change', () => {
    const selectedType = scheduleTypeSelect.value;
    if (selectedType === 'message') {
        messageGroup.style.display = 'block';
        recipientsGroup.style.display = 'block';
    } else {
        messageGroup.style.display = 'none';
        recipientsGroup.style.display = 'none';
    }
});

function renderScheduledList() {
    scheduledListDiv.innerHTML = '';
    if (currentConfig.schedules.length === 0) {
        scheduledListDiv.innerHTML = '<p>등록된 사용자 정의 스케줄이 없습니다. 새로 추가해주세요.</p><p><small>* 기본 스케줄(주간당직, 당직알림, 코드리뷰)은 자동으로 활성화됩니다.</small></p>';
        return;
    }

    currentConfig.schedules.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `schedule-item type-${item.type}`;
        
        let messageDisplay = item.message;
        let recipientsDisplay = item.recipients;

        switch(item.type) {
            case 'message':
                messageDisplay = item.message;
                recipientsDisplay = item.recipients;
                break;
            case 'laptop_duty':
                messageDisplay = '노트북 지참 알림 (자동 생성)';
                recipientsDisplay = '전체 팀원';
                break;
            case 'code_review':
                messageDisplay = '코드 리뷰 짝꿍 알림 (자동 생성)';
                recipientsDisplay = '전체 팀원';
                break;
        }

        itemDiv.innerHTML = `
            <p><strong>타입:</strong> ${item.type === 'message' ? '일반 메시지' : item.type === 'laptop_duty' ? '노트북 지참 알림' : '코드 리뷰 짝꿍 알림'}</p>
            <p><strong>메시지:</strong> ${messageDisplay}</p>
            <p><strong>스케줄:</strong> <code>${item.cronSchedule}</code></p>
            <p><strong>수신자:</strong> ${recipientsDisplay}</p>
            <div class="actions">
                <button class="execute-btn" data-id="${item.id}">즉시 실행</button>
                <button class="edit-btn" data-id="${item.id}">편집</button>
                <button class="delete-btn" data-id="${item.id}">삭제</button>
            </div>
        `;
        scheduledListDiv.appendChild(itemDiv);
    });

    document.querySelectorAll('.schedule-item .execute-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const scheduleId = event.target.dataset.id;
            const schedule = currentConfig.schedules.find(item => item.id === scheduleId);
            if (schedule && confirm(`"${schedule.type}" 스케줄을 지금 실행하시겠습니까?`)) {
                await executeSchedule(scheduleId);
            }
        });
    });

    document.querySelectorAll('.schedule-item .edit-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const idToEdit = event.target.dataset.id;
            const itemToEdit = currentConfig.schedules.find(item => item.id === idToEdit);
            if (itemToEdit) {
                scheduleTypeSelect.value = itemToEdit.type;
                scheduleTypeSelect.dispatchEvent(new Event('change')); 

                messageInput.value = itemToEdit.message;
                cronScheduleInput.value = itemToEdit.cronSchedule;
                recipientsInput.value = itemToEdit.recipients;
                saveScheduleButton.dataset.editId = itemToEdit.id;
                saveScheduleButton.textContent = '스케줄 업데이트';
                
                // 스케줄 관리 탭으로 이동
                document.querySelector('[data-tab="schedule"]').click();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });

    document.querySelectorAll('.schedule-item .delete-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const idToDelete = event.target.dataset.id;
            if (confirm('정말로 이 스케줄을 삭제하시겠습니까?')) {
                currentConfig.schedules = currentConfig.schedules.filter(item => item.id !== idToDelete);
                await sendSchedulesToServer(currentConfig.schedules);
            }
        });
    });
}

saveScheduleButton.addEventListener('click', async () => {
    const type = scheduleTypeSelect.value;
    const newMessage = messageInput.value.trim();
    const newCronSchedule = cronScheduleInput.value.trim();
    const newRecipients = recipientsInput.value.trim();
    const editId = saveScheduleButton.dataset.editId;

    let itemToSave = {
        id: editId || Date.now().toString(),
        type: type,
        cronSchedule: newCronSchedule
    };

    if (type === 'message') {
        if (!newMessage || !newRecipients || !newCronSchedule) {
            showStatus(scheduleStatusMessageDiv, '메시지, 스케줄, 수신자 필드를 모두 채워주세요.', 'error');
            return;
        }
        itemToSave.message = newMessage;
        itemToSave.recipients = newRecipients;
    } else {
        if (!newCronSchedule) {
            showStatus(scheduleStatusMessageDiv, '스케줄 필드를 채워주세요.', 'error');
            return;
        }
        itemToSave.message = ''; 
        itemToSave.recipients = ''; 
    }

    if (editId) {
        currentConfig.schedules = currentConfig.schedules.map(item =>
            item.id === editId ? itemToSave : item
        );
    } else {
        currentConfig.schedules.push(itemToSave);
    }
    
    await sendSchedulesToServer(currentConfig.schedules);
    messageInput.value = '';
    cronScheduleInput.value = '';
    recipientsInput.value = '';
    scheduleTypeSelect.value = 'message';
    scheduleTypeSelect.dispatchEvent(new Event('change'));
    delete saveScheduleButton.dataset.editId;
    saveScheduleButton.textContent = '스케줄 저장';
});

async function sendSchedulesToServer(schedulesToSend) {
    try {
        const response = await fetch('/update-schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(schedulesToSend)
        });
        if (response.ok) {
            const data = await response.json();
            showStatus(scheduleStatusMessageDiv, data.message, 'success');
            currentConfig.schedules = data.config;
            renderScheduledList();
            updateStatusTab();
        } else {
            const errorData = await response.json();
            showStatus(scheduleStatusMessageDiv, '스케줄 저장 실패: ' + (errorData.message || '알 수 없는 오류'), 'error');
        }
    } catch (error) {
        showStatus(scheduleStatusMessageDiv, '네트워크 오류로 스케줄을 저장할 수 없습니다.', 'error');
        console.error('Schedule save error:', error);
    }
}

async function executeSchedule(scheduleId) {
    try {
        showStatus(scheduleStatusMessageDiv, '스케줄 실행 중...', 'info');
        
        const response = await fetch('/execute-schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ scheduleId: scheduleId })
        });
        
        if (response.ok) {
            const data = await response.json();
            showStatus(scheduleStatusMessageDiv, data.message, 'success');
        } else {
            const errorData = await response.json();
            showStatus(scheduleStatusMessageDiv, '스케줄 실행 실패: ' + (errorData.message || '알 수 없는 오류'), 'error');
        }
    } catch (error) {
        showStatus(scheduleStatusMessageDiv, '네트워크 오류로 스케줄을 실행할 수 없습니다.', 'error');
        console.error('Schedule execution error:', error);
    }
}
