// 문자열 관련 유틸리티 함수들

/**
 * 문자열 템플릿 처리
 */
function processTemplate(template, data) {
    if (!template || typeof template !== 'string') {
        return template;
    }
    
    let result = template;
    
    // {{key}} 형태의 변수 치환
    Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        result = result.replace(regex, value);
    });
    
    return result;
}

/**
 * 텍스트 길이 제한
 */
function truncateText(text, maxLength, suffix = '...') {
    if (!text || text.length <= maxLength) {
        return text;
    }
    
    return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 텍스트 마스킹 (민감한 정보 보호)
 */
function maskText(text, visibleStart = 2, visibleEnd = 2, maskChar = '*') {
    if (!text || text.length <= visibleStart + visibleEnd) {
        return maskChar.repeat(text ? text.length : 4);
    }
    
    const start = text.substring(0, visibleStart);
    const end = text.substring(text.length - visibleEnd);
    const masked = maskChar.repeat(text.length - visibleStart - visibleEnd);
    
    return start + masked + end;
}

/**
 * 카멜케이스를 스네이크케이스로 변환
 */
function camelToSnake(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * 스네이크케이스를 카멜케이스로 변환
 */
function snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

/**
 * 문자열을 title case로 변환
 */
function toTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
}

/**
 * 한글 이름 줄임 (예: 홍길동 -> 홍*동)
 */
function abbreviateKoreanName(name) {
    if (!name || name.length < 2) return name;
    
    if (name.length === 2) {
        return name[0] + '*';
    } else if (name.length === 3) {
        return name[0] + '*' + name[2];
    } else {
        return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
    }
}

/**
 * 이메일 주소 마스킹
 */
function maskEmail(email) {
    if (!email || !email.includes('@')) return email;
    
    const [local, domain] = email.split('@');
    const maskedLocal = local.length > 2 ? 
        local.substring(0, 2) + '*'.repeat(local.length - 2) : 
        local;
    
    return maskedLocal + '@' + domain;
}

/**
 * 전화번호 마스킹
 */
function maskPhoneNumber(phone) {
    if (!phone) return phone;
    
    // 숫자만 추출
    const numbers = phone.replace(/\D/g, '');
    
    if (numbers.length === 11) {
        // 휴대폰 번호: 010-****-1234
        return numbers.substring(0, 3) + '-****-' + numbers.substring(7);
    } else if (numbers.length === 10) {
        // 지역번호: 02-***-1234
        return numbers.substring(0, 2) + '-***-' + numbers.substring(6);
    }
    
    return phone;
}

/**
 * URL에서 도메인 추출
 */
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (error) {
        return url;
    }
}

/**
 * 숫자 포맷팅 (1000 -> 1,000)
 */
function formatNumber(num) {
    if (typeof num !== 'number') return num;
    return num.toLocaleString();
}

/**
 * 숫자를 한글로 변환 (1 -> 첫 번째, 2 -> 두 번째)
 */
function numberToKoreanOrdinal(num) {
    const koreanNumbers = ['', '첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
    
    if (num < 1 || num > 10) {
        return `${num}번째`;
    }
    
    return koreanNumbers[num] + ' 번째';
}

/**
 * 바이트 크기를 읽기 쉬운 형태로 변환
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 문자열에서 HTML 태그 제거
 */
function stripHtmlTags(html) {
    return html.replace(/<[^>]*>/g, '');
}

/**
 * 문자열에서 특수 문자 이스케이프
 */
function escapeSpecialChars(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * 랜덤 문자열 생성
 */
function generateRandomString(length = 8, includeNumbers = true, includeSymbols = false) {
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    
    if (includeNumbers) {
        chars += '0123456789';
    }
    
    if (includeSymbols) {
        chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    }
    
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
}

/**
 * 문자열이 URL인지 검증
 */
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * 문자열이 이메일인지 검증
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * 한글 문자열인지 확인
 */
function isKorean(str) {
    const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
    return koreanRegex.test(str);
}

/**
 * 색상 코드 생성 (해시 기반)
 */
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const color = Math.floor(Math.abs((Math.sin(hash) * 16777215) % 1) * 16777215).toString(16);
    return '#' + Array(6 - color.length + 1).join('0') + color;
}

/**
 * 문자열 유사도 계산 (Levenshtein distance)
 */
function calculateSimilarity(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    const maxLength = Math.max(str1.length, str2.length);
    return (maxLength - matrix[str2.length][str1.length]) / maxLength;
}

module.exports = {
    processTemplate,
    truncateText,
    maskText,
    camelToSnake,
    snakeToCamel,
    toTitleCase,
    abbreviateKoreanName,
    maskEmail,
    maskPhoneNumber,
    extractDomain,
    formatNumber,
    numberToKoreanOrdinal,
    formatBytes,
    stripHtmlTags,
    escapeSpecialChars,
    generateRandomString,
    isValidUrl,
    isValidEmail,
    isKorean,
    stringToColor,
    calculateSimilarity
};
