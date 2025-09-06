#!/usr/bin/env node
/**
 * Enhanced Test Script for Rich Video Transcoder Logging
 * This demonstrates the new rich logging capabilities with user context
 */

import TranscodeLogger from './src/logger.js';

const logger = new TranscodeLogger();

console.log('🧪 Testing enhanced video transcoder logging with rich user data...\n');

// Enhanced test scenarios with rich user context
const testScenarios = [
    {
        id: 'rich001',
        user: 'alice_mobile_skater',
        filename: 'kickflip_iphone.mov',
        fileSize: 45123456,
        clientIP: '192.168.1.100',
        platform: 'mobile',
        deviceInfo: 'mobile/ios/safari',
        browserInfo: 'Safari 15.0',
        sessionId: 'session_alice_1725581234',
        userHP: 150,
        scenario: 'success'
    },
    {
        id: 'rich002',
        user: 'bob_desktop_tricks',
        filename: 'ollie_4k.mp4',
        fileSize: 125678900,
        clientIP: '192.168.1.101',
        platform: 'desktop',
        deviceInfo: 'desktop/windows/chrome',
        browserInfo: 'Chrome 118.0',
        sessionId: 'session_bob_1725581235',
        userHP: 75,
        scenario: 'success'
    },
    {
        id: 'rich003',
        user: 'charlie_tablet_grinds',
        filename: 'rail_grind_slow_mo.avi',
        fileSize: 78901234,
        clientIP: '192.168.1.102',
        platform: 'tablet',
        deviceInfo: 'tablet/android/chrome',
        browserInfo: 'Chrome Mobile 118.0',
        sessionId: 'session_charlie_1725581236',
        userHP: 25,
        scenario: 'error'
    },
    {
        id: 'rich004',
        user: 'diana_vert_ramp',
        filename: 'halfpipe_360_hd.mov',
        fileSize: 198765432,
        clientIP: '192.168.1.103',
        platform: 'desktop',
        deviceInfo: 'desktop/macos/safari',
        browserInfo: 'Safari 16.0',
        sessionId: 'session_diana_1725581237',
        userHP: 300,
        scenario: 'success'
    },
    {
        id: 'rich005',
        user: 'evan_street_explorer',
        filename: 'street_session_4k.mov',
        fileSize: 567890123,
        clientIP: '192.168.1.104',
        platform: 'mobile',
        deviceInfo: 'mobile/android/firefox',
        browserInfo: 'Firefox Mobile 118.0',
        sessionId: 'session_evan_1725581238',
        userHP: 50,
        scenario: 'error'
    }
];

// Simulate processing each scenario with rich logging
for (const scenario of testScenarios) {
    console.log(`\n📝 Testing ${scenario.platform} scenario: ${scenario.scenario} for ${scenario.user}`);
    console.log(`   📱 Device: ${scenario.deviceInfo}`);
    console.log(`   🔥 HP: ${scenario.userHP}`);
    console.log(`   🆔 Session: ${scenario.sessionId}`);

    // Log start with rich information
    logger.logTranscodeStart({
        id: scenario.id,
        user: scenario.user,
        filename: scenario.filename,
        fileSize: scenario.fileSize,
        clientIP: scenario.clientIP,
        userAgent: scenario.browserInfo,
        origin: 'https://skatehive.app',
        platform: scenario.platform,
        deviceInfo: scenario.deviceInfo,
        browserInfo: scenario.browserInfo,
        sessionId: scenario.sessionId,
        userHP: scenario.userHP
    });

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    if (scenario.scenario === 'success') {
        // Log successful completion
        logger.logTranscodeComplete({
            id: scenario.id,
            user: scenario.user,
            filename: scenario.filename,
            cid: `bafybei${Math.random().toString(36).substring(2, 15)}enhanced`,
            gatewayUrl: `https://gateway.pinata.cloud/ipfs/bafy...`,
            duration: Math.floor(Math.random() * 8000) + 2000, // 2-10 seconds
            clientIP: scenario.clientIP
        });
    } else {
        // Log error with context
        const errors = [
            'FFmpeg encoding failed - unsupported codec',
            'File too large for mobile upload',
            'IPFS upload timeout - slow connection',
            'Insufficient server resources',
            'Invalid video format for platform'
        ];
        const randomError = errors[Math.floor(Math.random() * errors.length)];

        logger.logTranscodeError({
            id: scenario.id,
            user: scenario.user,
            filename: scenario.filename,
            error: `${randomError} (${scenario.platform})`,
            duration: Math.floor(Math.random() * 3000) + 500, // 0.5-3.5 seconds
            clientIP: scenario.clientIP
        });
    }

    await new Promise(resolve => setTimeout(resolve, 50));
}

console.log('\n📊 Enhanced Statistics:');
const stats = logger.getStats();
console.log(`   Total operations: ${stats.total}`);
console.log(`   Successful: ${stats.successful}`);
console.log(`   Failed: ${stats.failed}`);
console.log(`   Success rate: ${stats.successRate}%`);
console.log(`   Average duration: ${stats.avgDuration}ms`);

console.log('\n📋 Rich logs for dashboard (showing platform/device data):');
const dashboardLogs = logger.getLogsForDashboard(5);
dashboardLogs.forEach((log, i) => {
    const deviceEmoji = log.platform === 'mobile' ? '📱' : log.platform === 'tablet' ? '📟' : '💻';
    const hpEmoji = log.userHP > 200 ? '🔥' : log.userHP > 100 ? '⚡' : '💫';
    console.log(`   ${i + 1}. ${deviceEmoji} ${log.user} (${hpEmoji}${log.userHP}HP) - ${log.filename}`);
    console.log(`      📍 ${log.platform}/${log.deviceInfo} - ${log.status} (${log.duration || 'N/A'}ms)`);
    console.log(`      🔗 Session: ${log.sessionId || 'N/A'}`);
});

console.log(`\n✅ Enhanced test completed! Logs saved to: ${logger.logFilePath}`);
console.log('🎯 Rich data includes: user HP, device type, platform, session tracking');
console.log('🌐 Test the enhanced logs endpoint: curl http://localhost:8081/logs');
console.log('📱 Dashboard now shows: device types, user power levels, platform analytics');

// Display sample analytics insights
console.log('\n📈 Sample Analytics Insights:');
const mobileLogs = dashboardLogs.filter(log => log.platform === 'mobile');
const desktopLogs = dashboardLogs.filter(log => log.platform === 'desktop');
const highHPUsers = dashboardLogs.filter(log => log.userHP > 100);

console.log(`   📱 Mobile uploads: ${mobileLogs.length}/${dashboardLogs.length}`);
console.log(`   💻 Desktop uploads: ${desktopLogs.length}/${dashboardLogs.length}`);
console.log(`   🔥 High HP users (>100): ${highHPUsers.length}/${dashboardLogs.length}`);

if (mobileLogs.length > 0) {
    const avgMobileDuration = mobileLogs.reduce((sum, log) => sum + (log.duration || 0), 0) / mobileLogs.length;
    console.log(`   ⏱️ Average mobile processing: ${Math.round(avgMobileDuration)}ms`);
}

console.log('\n🚀 Ready for integration with Skatehive3.0 frontend!');
