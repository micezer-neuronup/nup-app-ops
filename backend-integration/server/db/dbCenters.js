const { pool } = require('./db');
const { log } = require("../utils/logger");


// ────── Query: Upsert centres ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ─── Called by services/centersSync.js with every centre (HubSpot companies with numeric nup_center_id + Ops API IDs).
// ─── In batches of 1000 with unnest. Only writes when something changed (ON CONFLICT ... WHERE ... IS DISTINCT FROM), so
// ─── updated_at means "last change". Returns how many rows were inserted or changed.
// ─── stripe_customer_id / zoho_contact_id keep the stored value when the Ops API brings none (COALESCE).
// ─── hubspot_company_id is unique: if a company now belongs to another centre (its nup_center_id changed in HubSpot), the old
// ─── centre loses it first, in the same transaction.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function upsertCenters(centers) {
  const client = await pool.connect();
  let changed = 0;

  try {
    await client.query('BEGIN');

    // 1. Companies that moved to another centre: the old centre loses them first (all batches, before any upsert)
    for (let i = 0; i < centers.length; i += 1000) {
      const batch = centers.slice(i, i + 1000);
      await client.query(
        `UPDATE centers c SET hubspot_company_id = NULL, updated_at = NOW()
         FROM unnest($1::text[], $2::text[]) AS n(nup_center_id, hubspot_company_id)
         WHERE c.hubspot_company_id = n.hubspot_company_id AND c.nup_center_id <> n.nup_center_id`,
        [batch.map(c => c.nup_center_id), batch.map(c => c.hubspot_company_id ?? null)]
      );
    }

    // 2. Upsert
    for (let i = 0; i < centers.length; i += 1000) {
      const batch = centers.slice(i, i + 1000);
      const col = (key) => batch.map(c => c[key] ?? null);

      const result = await client.query(
        `INSERT INTO centers (nup_center_id, hubspot_company_id, name, commercial_name, segment, market, currency,
                              stripe_customer_id, zoho_contact_id, hubspot_updated_at)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
                              $8::text[], $9::text[], $10::timestamptz[])
         ON CONFLICT (nup_center_id) DO UPDATE SET
           hubspot_company_id = EXCLUDED.hubspot_company_id,
           name = EXCLUDED.name,
           commercial_name = EXCLUDED.commercial_name,
           segment = EXCLUDED.segment,
           market = EXCLUDED.market,
           currency = EXCLUDED.currency,
           stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, centers.stripe_customer_id),
           zoho_contact_id = COALESCE(EXCLUDED.zoho_contact_id, centers.zoho_contact_id),
           hubspot_updated_at = EXCLUDED.hubspot_updated_at,
           updated_at = NOW()
         WHERE (centers.hubspot_company_id, centers.name, centers.commercial_name, centers.segment, centers.market,
                centers.currency, centers.stripe_customer_id, centers.zoho_contact_id)
           IS DISTINCT FROM
               (EXCLUDED.hubspot_company_id, EXCLUDED.name, EXCLUDED.commercial_name, EXCLUDED.segment, EXCLUDED.market,
                EXCLUDED.currency, COALESCE(EXCLUDED.stripe_customer_id, centers.stripe_customer_id),
                COALESCE(EXCLUDED.zoho_contact_id, centers.zoho_contact_id))`,
        [col('nup_center_id'), col('hubspot_company_id'), col('name'), col('commercial_name'), col('segment'),
         col('market'), col('currency'), col('stripe_customer_id'), col('zoho_contact_id'), col('hubspot_updated_at')]
      );
      changed += result.rowCount;
    }

    await client.query('COMMIT');
    return changed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


// ────── Query: HubSpot company of a centre ───────────────────────────────────────────────────────────────────────────────────────────────
// ─── Used by the HubSpot sync instead of searching the company by nup_center_id on every subscription. null if unknown.
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function getCenterHubspotCompanyId(nupCenterId) {
  try {
    const { rows } = await pool.query(
      `SELECT hubspot_company_id FROM centers WHERE nup_center_id = $1`,
      [String(nupCenterId)]
    );
    return rows[0]?.hubspot_company_id || null;
  } catch (error) {
    log("ERROR", "DB", `Error getting the HubSpot company of centre ${nupCenterId}: ${error.message}`);
    return null;
  }
}

module.exports = { upsertCenters, getCenterHubspotCompanyId };
