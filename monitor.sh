#!/bin/bash

# Video Transcoder Live Monitoring Script
# This script provides real-time monitoring of the video transcoder

echo "🎬 SKATEHIVE VIDEO TRANSCODER LIVE MONITOR"
echo "=========================================="
echo "📅 Started: $(date)"
echo "🌐 Monitoring: http://localhost:8081"
echo "📊 Dashboard: http://localhost:8081/logs"
echo ""

# Function to show current status
show_status() {
    echo "📊 Current Status:"
    docker ps | grep video-worker || echo "❌ Video worker container not running"
    echo ""
    
    echo "🔗 API Health Check:"
    curl -s http://localhost:8081/healthz | jq . 2>/dev/null || echo "❌ API not responding"
    echo ""
    
    echo "📈 Current Stats:"
    curl -s http://localhost:8081/stats | jq . 2>/dev/null || echo "❌ Stats not available"
    echo ""
}

# Function to monitor logs in real-time
monitor_logs() {
    echo "📋 Live Container Logs (press Ctrl+C to stop):"
    echo "=============================================="
    docker logs -f video-worker 2>&1 | while IFS= read -r line; do
        timestamp=$(date '+%H:%M:%S')
        echo "[$timestamp] $line"
    done
}

# Function to monitor API calls
monitor_api() {
    echo "🌐 Monitoring API Calls (press Ctrl+C to stop):"
    echo "============================================="
    
    while true; do
        echo ""
        echo "⏰ $(date '+%H:%M:%S') - Checking for new operations..."
        
        # Get latest logs
        latest_logs=$(curl -s http://localhost:8081/logs?limit=3 2>/dev/null)
        
        if [ $? -eq 0 ] && [ "$latest_logs" != "" ]; then
            echo "$latest_logs" | jq -r '.logs[] | "🎬 [\(.timestamp)] \(.user) - \(.filename) - \(.status) (\(.duration // "N/A")ms)"' 2>/dev/null || echo "📋 Raw: $latest_logs"
        else
            echo "❌ API not responding"
        fi
        
        sleep 5
    done
}

# Function to watch log file
watch_logfile() {
    echo "📁 Watching Log File (press Ctrl+C to stop):"
    echo "==========================================="
    
    if [ -f "logs/transcode.log" ]; then
        tail -f logs/transcode.log | while IFS= read -r line; do
            timestamp=$(date '+%H:%M:%S')
            echo "[$timestamp] $(echo "$line" | jq -r '"\(.status) - \(.user) - \(.filename)"' 2>/dev/null || echo "$line")"
        done
    else
        echo "❌ Log file not found: logs/transcode.log"
    fi
}

# Function to show network monitoring
monitor_network() {
    echo "🌐 Network Monitoring (press Ctrl+C to stop):"
    echo "============================================"
    
    while true; do
        echo ""
        echo "⏰ $(date '+%H:%M:%S') - Network Activity:"
        
        # Show active connections to port 8081
        netstat -an | grep :8081 || echo "No connections to port 8081"
        
        # Show recent HTTP requests from logs
        docker logs video-worker 2>&1 | tail -10 | grep -E "(POST|GET)" || echo "No recent HTTP requests"
        
        sleep 10
    done
}

# Main menu
case "${1:-menu}" in
    "status")
        show_status
        ;;
    "logs")
        monitor_logs
        ;;
    "api")
        monitor_api
        ;;
    "file")
        watch_logfile
        ;;
    "network")
        monitor_network
        ;;
    "all")
        echo "🔄 Starting comprehensive monitoring..."
        echo "Opening multiple monitoring sessions..."
        
        # Show initial status
        show_status
        
        echo "📋 Press Enter to start live log monitoring..."
        read
        
        monitor_logs
        ;;
    *)
        echo "📋 Available monitoring options:"
        echo ""
        echo "1. ./monitor.sh status   - Show current status"
        echo "2. ./monitor.sh logs     - Live container logs"
        echo "3. ./monitor.sh api      - Monitor API calls"
        echo "4. ./monitor.sh file     - Watch log file"
        echo "5. ./monitor.sh network  - Network monitoring"
        echo "6. ./monitor.sh all      - Comprehensive monitoring"
        echo ""
        echo "💡 Quick commands:"
        echo "   curl http://localhost:8081/logs    - Get recent logs"
        echo "   curl http://localhost:8081/stats   - Get statistics"
        echo "   docker logs video-worker           - Container logs"
        echo ""
        echo "🎯 When testing from MacBook, use:"
        echo "   ./monitor.sh logs    (recommended for live monitoring)"
        echo "   ./monitor.sh api     (for API call tracking)"
        ;;
esac
