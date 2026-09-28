import './env.mjs';

let poolPromise;

export function databaseUrl() {
  return process.env.DATABASE_URL
    || 'postgresql://toonlab:toonlab@127.0.0.1:55432/toonlab';
}

export async function getPool() {
  poolPromise ??= import('pg').then(({ Pool }) => new Pool({
    connectionString: databaseUrl(),
    max: 10,
  }));
  return poolPromise;
}

export async function withTransaction(work) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  if (!poolPromise) return;
  const pool = await poolPromise;
  poolPromise = undefined;
  await pool.end();
}
