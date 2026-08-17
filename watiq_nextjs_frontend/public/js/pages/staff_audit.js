/* staff_audit.html — behaviour lifted from frontend/auditor_security_dashboard.html.
 * Inline <script> is blocked by script-src 'self', so it lives here
 * and is loaded with defer from the page's scripts block.
 */
const logContainer = document.getElementById('access-log');
    const logs = [
        { type: 'SUCCESS', msg: 'DB_HEALTH_CHECK: ALL NODES SYNCED [GREEN]' },
        { type: 'WARN', msg: 'LATENCY_SPIKE: REGION_SOUSSE_NODE_4 (142ms)' },
        { type: 'INFO', msg: 'RLS_POLICY_REFRESH: GLOBAL_IDENT_V2 APPLIED' },
        { type: 'ERROR', msg: 'ACCESS_DENIED: UNAUTHORIZED_S3_GET USER_ID=***001' },
        { type: 'INFO', msg: 'HEARTBEAT: ALL SECURITY MODULES OPERATIONAL' }
    ];

    function addLog() {
        const log = logs[Math.floor(Math.random() * logs.length)];
        const p = document.createElement('p');
        const time = new Date().toLocaleTimeString('en-GB');
        
        if(log.type === 'SUCCESS') p.className = 'text-green-400/90';
        else if(log.type === 'WARN') p.className = 'text-secondary/80';
        else if(log.type === 'ERROR') p.className = 'text-error font-bold bg-error/10 border-l-2 border-error pl-3 py-1';
        else p.className = 'text-white/40';
        
        p.textContent = `[${time}] ${log.type}: ${log.msg}`;
        logContainer.appendChild(p);
        
        if (logContainer.childNodes.length > 25) {
            logContainer.removeChild(logContainer.firstChild);
        }
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    setInterval(addLog, 4000);
