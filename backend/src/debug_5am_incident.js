
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from .env.docker in root
dotenv.config({ path: path.join(__dirname, '../../../.env.docker') });

const client = new Client({
    user: process.env.POSTGRES_USER || 'diagrama',
    password: process.env.POSTGRES_PASSWORD || 'DiagramaServers2025',
    host: 'localhost',
    database: process.env.POSTGRES_DB || 'diagrama_servers',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
});

async function run() {
    try {
        await client.connect();
        console.log('Connected to DB');

        // 1. Find Host ID
        const hostRes = await client.query("SELECT * FROM hosts WHERE ip >>= '192.168.0.114'");
        if (hostRes.rows.length === 0) {
            console.log('Host 192.168.0.114 not found');
            return;
        }
        const host = hostRes.rows[0];
        console.log(`Found Host: ${host.name} (ID: ${host.id})`);

        // 2. Query Check Runs around 5am today (2026-01-20)
        // Local time 5am is UTC 10am if offset is -5. 
        // Wait, DB usually stores in UTC or local depending on configuration.
        // I will query a range in UTC assuming the server might store timestamps in UTC.
        // User says 5am local.
        // If local is 5am, and timezone is -5, then UTC is 10am? No, 5am local = 10am UTC.
        // BUT usually timestamps in DB are stored as 'timestamp with time zone' which normalizes to UTC.
        // OR 'timestamp without time zone'.
        // Let's checking the table definition would help, but I'll just query by string and let PG handle it or query a wide range.

        console.log('--- Check Runs (Local Time 04:50 - 05:10) ---');
        // I will attempt to query using local time string and casting to timestamp keys if needed
        // or just assume the server time is sync with local.

        const start = '2026-01-20 04:40:00'; // Reading a bit earlier
        const end = '2026-01-20 05:20:00';   // And later

        // Note: If stored as UTC, 5am local is 10am UTC. If stored as Local, it is 5am.
        // I will query for BOTH ranges to be safe.

        const queryRange = async (label, s, e) => {
            console.log(`\nQuerying ${label}: ${s} to ${e}`);
            const res = await client.query(`
          SELECT time, status, latency_ms, error 
          FROM check_runs 
          WHERE host_id = $1 
          AND time >= $2 AND time <= $3
          ORDER BY time ASC
        `, [host.id, s, e]);

            if (res.rows.length === 0) console.log('No runs found in this range.');
            res.rows.forEach(r => {
                console.log(`[${new Date(r.time).toLocaleString()}] Status: ${r.status}, Latency: ${r.latency_ms}ms, Error: ${r.error}`);
            });
        }

        // Attempt 1: Assuming DB matches local time (unlikely but possible if no timezone)
        await queryRange('Assuming Local Time in DB', start, end);

        // Attempt 2: Assuming DB is UTC and 5am local is 10am UTC (+5h)
        // 04:50 + 5h = 09:50
        const startUtc = '2026-01-20 09:40:00';
        const endUtc = '2026-01-20 10:20:00';
        await queryRange('Assuming UTC (Local+5h)', startUtc, endUtc);

        // Attempt 3: Maybe it is stored as UTC but the server machine is in UTC, so 5am local = 5am UTC?
        // Let's just output the server timezone
        const tzRes = await client.query('SHOW timezone');
        console.log(`\nDB Timezone: ${tzRes.rows[0].TimeZone}`);

        // 3. Check Incidents
        console.log('\n--- Incidents Today ---');
        const incRes = await client.query(`
        SELECT * FROM incidents 
        WHERE host_id = $1 
        AND opened_at >= '2026-01-20 00:00:00'
    `, [host.id]);

        incRes.rows.forEach(i => {
            console.log(`Incident ${i.id}: ${i.severity} - ${i.summary} (Open: ${i.opened_at}, Closed: ${i.closed_at})`);
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.end();
    }
}

run();
