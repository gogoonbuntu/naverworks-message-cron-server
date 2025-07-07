// 설정 API 라우터
// 애플리케이션 설정 관리를 위한 REST API

const express = require('express');
const router = express.Router();
const logger = require('../../../logger');
const ConfigService = require('../../services/config-service');

// 설정 서비스 인스턴스
const configService = new ConfigService();

/**
 * 현재 설정 조회
 */
router.get('/', (req, res) => {
    try {
        const config = configService.loadConfig();
        
        // 민감한 정보 제거
        const safeConfig = removeSensitiveInfo(config);
        
        res.json({
            success: true,
            config: safeConfig
        });
    } catch (error) {
        logger.error(`Config get error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get configuration'
        });
    }
});

/**
 * 설정 업데이트
 */
router.put('/', (req, res) => {
    try {
        const newConfig = req.body;
        
        // 설정 유효성 검사
        const validation = configService.validateConfig(newConfig);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                error: 'Configuration validation failed',
                errors: validation.errors,
                warnings: validation.warnings
            });
        }
        
        // 설정 저장
        const result = configService.saveConfig(newConfig);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Configuration updated successfully',
                validation: validation
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Config update error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration'
        });
    }
});

/**
 * 설정 유효성 검사
 */
router.post('/validate', (req, res) => {
    try {
        const config = req.body;
        const validation = configService.validateConfig(config);
        
        res.json({
            success: true,
            validation: validation
        });
    } catch (error) {
        logger.error(`Config validation error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to validate configuration'
        });
    }
});

/**
 * 특정 설정값 조회
 */
router.get('/key/:key', (req, res) => {
    try {
        const { key } = req.params;
        const value = configService.get(key);
        
        if (value !== null) {
            res.json({
                success: true,
                key: key,
                value: value
            });
        } else {
            res.status(404).json({
                success: false,
                error: 'Configuration key not found'
            });
        }
    } catch (error) {
        logger.error(`Config key get error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get configuration key'
        });
    }
});

/**
 * 특정 설정값 업데이트
 */
router.put('/key/:key', (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        
        const result = configService.set(key, value);
        
        if (result.success) {
            // 설정 저장
            configService.saveConfig();
            
            res.json({
                success: true,
                message: `Configuration key '${key}' updated successfully`
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Config key update error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to update configuration key'
        });
    }
});

/**
 * 팀 멤버 관리
 */
router.get('/team-members', (req, res) => {
    try {
        const teamMembers = configService.get('teamMembers', []);
        res.json({
            success: true,
            teamMembers: teamMembers
        });
    } catch (error) {
        logger.error(`Team members get error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to get team members'
        });
    }
});

/**
 * 팀 멤버 추가
 */
router.post('/team-members', (req, res) => {
    try {
        const newMember = req.body;
        
        // 필수 필드 검증
        if (!newMember.name || !newMember.email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });
        }
        
        const teamMembers = configService.get('teamMembers', []);
        
        // 중복 확인 (이메일 기준)
        const existingMember = teamMembers.find(member => member.email === newMember.email);
        if (existingMember) {
            return res.status(409).json({
                success: false,
                error: 'Team member with this email already exists'
            });
        }
        
        // 새 멤버 추가
        teamMembers.push({
            ...newMember,
            isActive: newMember.isActive !== false
        });
        
        configService.set('teamMembers', teamMembers);
        configService.saveConfig();
        
        res.json({
            success: true,
            message: 'Team member added successfully',
            member: newMember
        });
    } catch (error) {
        logger.error(`Team member add error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to add team member'
        });
    }
});

/**
 * 팀 멤버 업데이트
 */
router.put('/team-members/:index', (req, res) => {
    try {
        const memberIndex = parseInt(req.params.index);
        const updatedMember = req.body;
        
        const teamMembers = configService.get('teamMembers', []);
        
        if (memberIndex < 0 || memberIndex >= teamMembers.length) {
            return res.status(404).json({
                success: false,
                error: 'Team member not found'
            });
        }
        
        teamMembers[memberIndex] = { ...teamMembers[memberIndex], ...updatedMember };
        
        configService.set('teamMembers', teamMembers);
        configService.saveConfig();
        
        res.json({
            success: true,
            message: 'Team member updated successfully',
            member: teamMembers[memberIndex]
        });
    } catch (error) {
        logger.error(`Team member update error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to update team member'
        });
    }
});

/**
 * 팀 멤버 삭제
 */
router.delete('/team-members/:index', (req, res) => {
    try {
        const memberIndex = parseInt(req.params.index);
        const teamMembers = configService.get('teamMembers', []);
        
        if (memberIndex < 0 || memberIndex >= teamMembers.length) {
            return res.status(404).json({
                success: false,
                error: 'Team member not found'
            });
        }
        
        const removedMember = teamMembers.splice(memberIndex, 1)[0];
        
        configService.set('teamMembers', teamMembers);
        configService.saveConfig();
        
        res.json({
            success: true,
            message: 'Team member removed successfully',
            removedMember: removedMember
        });
    } catch (error) {
        logger.error(`Team member delete error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to remove team member'
        });
    }
});

/**
 * 기본 설정 복원
 */
router.post('/reset', (req, res) => {
    try {
        // 기존 설정 백업
        configService.backupConfig();
        
        // 기본 설정 생성
        const defaultConfig = configService.createDefaultConfig();
        
        res.json({
            success: true,
            message: 'Configuration reset to defaults',
            config: removeSensitiveInfo(defaultConfig)
        });
    } catch (error) {
        logger.error(`Config reset error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to reset configuration'
        });
    }
});

/**
 * 설정 내보내기
 */
router.post('/export', (req, res) => {
    try {
        const result = configService.exportConfig();
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Configuration exported successfully',
                exportPath: result.exportPath
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Config export error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to export configuration'
        });
    }
});

/**
 * 설정 가져오기
 */
router.post('/import', (req, res) => {
    try {
        const { importPath } = req.body;
        
        if (!importPath) {
            return res.status(400).json({
                success: false,
                error: 'Import path is required'
            });
        }
        
        const result = configService.importConfig(importPath);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Configuration imported successfully',
                validation: result.validation
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        logger.error(`Config import error: ${error.message}`);
        res.status(500).json({
            success: false,
            error: 'Failed to import configuration'
        });
    }
});

/**
 * 민감한 정보 제거 헬퍼 함수
 */
function removeSensitiveInfo(config) {
    const safeConfig = JSON.parse(JSON.stringify(config));
    
    // 네이버웍스 설정에서 민감한 정보 마스킹
    if (safeConfig.messaging?.naverworks) {
        if (safeConfig.messaging.naverworks.clientSecret) {
            safeConfig.messaging.naverworks.clientSecret = '****';
        }
    }
    
    // 슬랙 설정에서 민감한 정보 마스킹
    if (safeConfig.messaging?.slack) {
        if (safeConfig.messaging.slack.botToken) {
            safeConfig.messaging.slack.botToken = '****';
        }
    }
    
    // 이메일 설정에서 민감한 정보 마스킹
    if (safeConfig.messaging?.email?.auth) {
        if (safeConfig.messaging.email.auth.pass) {
            safeConfig.messaging.email.auth.pass = '****';
        }
    }
    
    return safeConfig;
}

module.exports = router;
