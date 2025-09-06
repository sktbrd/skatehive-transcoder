#!/usr/bin/env node
/**
 * Test script for the video transcoder logging system
 * This creates some mock log entries to test the dashboard integration
 */

import TranscodeLogger from './src/logger.js';

const logger = new TranscodeLogger();

console.log('🧪 Testing video transcoder logging system...\n');

// Test logging different scenarios
const testScenarios = [
    {
        id: 'test001',
        user: 'alice_skater',
        filename: 'kickflip_360.mov',
        fileSize: 25123456,
        clientIP: '192.168.1.100',
        scenario: 'success'
    },
    {
        id: 'test002',
        user: 'bob_tricks',
        filename: 'ollie_attempt.mp4',
        fileSize: 15678900,
        clientIP: '192.168.1.101',
        scenario: 'success'
    },
    {
        id: 'test003',
        user: 'charlie_grinds',
        filename: 'rail_grind_fail.avi',
        fileSize: 45678123,
        clientIP: '192.168.1.102',
        scenario: 'error'
    },
    {
        id: 'test004',
        user: 'diana_vert',
        filename: 'halfpipe_air.mov',
        fileSize: 78901234,
        clientIP: '192.168.1.103',
        scenario: 'success'
    },
    {
        id: 'test005',
        user: 'evan_street',
        filename: 'street_session.mov',
        fileSize: 34567890,
        clientIP: '192.168.1.104',
        scenario: 'error'
    }
];

// Simulate processing each scenario
for (const scenario of testScenarios) {
    console.log(`\n📝 Testing scenario: ${scenario.scenario} for ${scenario.user}`);

    // Log start
    logger.logTranscodeStart({
        id: scenario.id,
        user: scenario.user,
        filename: scenario.filename,
        fileSize: scenario.fileSize,
        clientIP: scenario.clientIP,
        userAgent: 'Test-Agent/1.0',
        origin: 'http://test.skatehive.app'
    });

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    if (scenario.scenario === 'success') {
        // Log successful completion
        logger.logTranscodeComplete({
            id: scenario.id,
            user: scenario.user,
            filename: scenario.filename,
            cid: `bafybei${Math.random().toString(36).substring(2, 15)}test`,
            gatewayUrl: `https://gateway.pinata.cloud/ipfs/bafy...`,
            duration: Math.floor(Math.random() * 5000) + 1000, // 1-6 seconds
            clientIP: scenario.clientIP
        });
    } else {
        // Log error
        const errors = [
            'FFmpeg encoding failed',
            'File format not supported',
            'IPFS upload timeout',
            'Insufficient disk space',
            'Invalid video codec'
        ];
        const randomError = errors[Math.floor(Math.random() * errors.length)];

        logger.logTranscodeError({
            id: scenario.id,
            user: scenario.user,
            filename: scenario.filename,
            error: randomError,
            duration: Math.floor(Math.random() * 2000) + 500, // 0.5-2.5 seconds
            clientIP: scenario.clientIP
        });
    }

    await new Promise(resolve => setTimeout(resolve, 50));
}

console.log('\n📊 Final Statistics:');
const stats = logger.getStats();
console.log(`   Total operations: ${stats.total}`);
console.log(`   Successful: ${stats.successful}`);
console.log(`   Failed: ${stats.failed}`);
console.log(`   Success rate: ${stats.successRate}%`);
console.log(`   Average duration: ${stats.avgDuration}ms`);

console.log('\n📋 Recent logs for dashboard:');
const dashboardLogs = logger.getLogsForDashboard(5);
dashboardLogs.forEach((log, i) => {
    console.log(`   ${i + 1}. ${log.user} - ${log.filename} - ${log.status} (${log.duration || 'N/A'}ms)`);
});

console.log(`\n✅ Test completed! Logs saved to: ${logger.logFilePath}`);
console.log('🎯 You can now test the dashboard by running it while the video worker is running.');
console.log('🌐 Test the logs endpoint: curl http://localhost:8080/logs');
