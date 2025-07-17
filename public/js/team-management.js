// 팀원 관리 함수들
const teamMemberIdInput = document.getElementById('teamMemberIdInput');
const teamMemberNameInput = document.getElementById('teamMemberNameInput');
const isAuthorizedCheckbox = document.getElementById('isAuthorizedCheckbox');
const addTeamMemberButton = document.getElementById('addTeamMemberButton');
const teamMemberStatusMessageDiv = document.getElementById('teamMemberStatusMessage');
const teamMemberListDiv = document.getElementById('teamMemberList');

let editingTeamMemberId = null;

function renderTeamMemberList() {
    teamMemberListDiv.innerHTML = '';
    if (currentConfig.teamMembers.length === 0) {
        teamMemberListDiv.innerHTML = '<p>등록된 팀원이 없습니다. 추가해주세요.</p>';
        return;
    }

    currentConfig.teamMembers.forEach(member => {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'team-member-item';
        memberDiv.innerHTML = `
            <p><strong>ID:</strong> ${member.id}</p>
            <p><strong>이름:</strong> ${member.name}</p>
            <p><strong>권한:</strong> ${member.isAuthorized ? '예' : '아니오'}</p>
            <p><strong>당직 횟수:</strong> ${member.dutyCount || 0}회</p>
            <p><strong>코드리뷰 횟수:</strong> ${member.codeReviewCount || 0}회</p>
            <div class="actions">
                <button class="edit-btn" data-id="${member.id}">편집</button>
                <button class="delete-btn" data-id="${member.id}">삭제</button>
            </div>
        `;
        teamMemberListDiv.appendChild(memberDiv);
    });

    document.querySelectorAll('.team-member-item .edit-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const idToEdit = event.target.dataset.id;
            const memberToEdit = currentConfig.teamMembers.find(m => m.id === idToEdit);
            if (memberToEdit) {
                teamMemberIdInput.value = memberToEdit.id;
                teamMemberNameInput.value = memberToEdit.name;
                isAuthorizedCheckbox.checked = memberToEdit.isAuthorized;
                editingTeamMemberId = memberToEdit.id;
                addTeamMemberButton.textContent = '팀원 업데이트';
                teamMemberIdInput.disabled = true;
                
                // 팀원 관리 탭으로 이동
                document.querySelector('[data-tab="team"]').click();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });

    document.querySelectorAll('.team-member-item .delete-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const idToDelete = event.target.dataset.id;
            if (confirm(`정말로 팀원 ID: ${idToDelete}를 삭제하시겠습니까?`)) {
                currentConfig.teamMembers = currentConfig.teamMembers.filter(m => m.id !== idToDelete);
                await sendTeamMembersToServer(currentConfig.teamMembers);
            }
        });
    });
}

addTeamMemberButton.addEventListener('click', async () => {
    const id = teamMemberIdInput.value.trim();
    const name = teamMemberNameInput.value.trim();
    const isAuthorized = isAuthorizedCheckbox.checked;

    if (!id || !name) {
        showStatus(teamMemberStatusMessageDiv, '팀원 ID와 이름을 모두 입력해주세요.', 'error');
        return;
    }

    let updatedTeamMembers;
    if (editingTeamMemberId) {
        updatedTeamMembers = currentConfig.teamMembers.map(member =>
            member.id === editingTeamMemberId ? { ...member, name, isAuthorized } : member
        );
        editingTeamMemberId = null;
        teamMemberIdInput.disabled = false;
        addTeamMemberButton.textContent = '팀원 추가';
    } else {
        if (currentConfig.teamMembers.some(member => member.id === id)) {
            showStatus(teamMemberStatusMessageDiv, '이미 존재하는 팀원 ID입니다.', 'error');
            return;
        }
        const newMember = {
            id,
            name,
            isAuthorized,
            dutyCount: 0,
            codeReviewCount: 0
        };
        updatedTeamMembers = [...currentConfig.teamMembers, newMember];
    }

    await sendTeamMembersToServer(updatedTeamMembers);
    teamMemberIdInput.value = '';
    teamMemberNameInput.value = '';
    isAuthorizedCheckbox.checked = false;
});

async function sendTeamMembersToServer(teamMembersToSend) {
    try {
        const response = await fetch('/update-team-members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify(teamMembersToSend)
        });
        if (response.ok) {
            const data = await response.json();
            showStatus(teamMemberStatusMessageDiv, data.message, 'success');
            currentConfig.teamMembers = data.teamMembers;
            renderTeamMemberList();
            updateStatusTab();
        } else {
            const errorData = await response.json();
            showStatus(teamMemberStatusMessageDiv, '팀원 정보 저장 실패: ' + (errorData.message || '알 수 없는 오류'), 'error');
        }
    } catch (error) {
        showStatus(teamMemberStatusMessageDiv, '네트워크 오류로 팀원 정보를 저장할 수 없습니다.', 'error');
        console.error('Team member save error:', error);
    }
}
