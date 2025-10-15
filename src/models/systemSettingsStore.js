const pg = require('./postgres')

async function get(key) {
  const { rows } = await pg.query('select value from system_settings where key=$1', [key])
  if (!rows || rows.length === 0) {
    return null
  }
  return rows[0].value || null
}

async function set(key, value) {
  await pg.query(
    `insert into system_settings(key, value, updated_at) values ($1,$2, now())
     on conflict(key) do update set value = excluded.value, updated_at = now()`,
    [key, value || {}]
  )
}

module.exports = { get, set }
