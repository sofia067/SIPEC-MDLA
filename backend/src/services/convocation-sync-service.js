import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { AppError } from '../errors/app-error.js';

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function valueFrom(item, names) {
  for (const name of names) {
    if (item?.[name] !== undefined && item[name] !== null && String(item[name]).trim()) {
      return String(item[name]).trim();
    }
  }
  return '';
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.convocatorias)) return payload.convocatorias;
  throw new AppError(502, 'CONVOCATIONS_INVALID_RESPONSE', 'La API de convocatorias no devolvió una lista reconocible.');
}

function extractHtmlItems(html) {
  const items = [];
  const linkPattern = /href="([^"]*\/institucion\/munilosaquijes\/noticias\/\d+-[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html))) {
    const path = match[1];
    const text = match[2].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    const normalized = normalize(text);
    if (!/(convocatoria|concurso|cas|puesto|convocatoria|seleccion)/.test(normalized)) continue;
    const sourceId = path.match(/\/noticias\/([^/?#]+)/)?.[1];
    if (!sourceId || items.some((item) => item.id === sourceId)) continue;
    items.push({
      id: sourceId,
      title: text,
      puesto: text,
      url: path.startsWith('http') ? path : `https://www.gob.pe${path}`,
    });
  }
  return items;
}

export function matchProfile(title, profiles) {
  const titleTokens = new Set(normalize(title).split(' ').filter((token) => token.length >= 3));
  let best = null;

  for (const profile of profiles) {
    const text = normalize(`${profile.title} ${profile.description || ''}`);
    const profileTokens = new Set(text.split(' ').filter((token) => token.length >= 3));
    const common = [...titleTokens].filter((token) => profileTokens.has(token)).length;
    const union = new Set([...titleTokens, ...profileTokens]).size;
    const score = union ? common / union : 0;
    const includes = text.includes(normalize(profile.title)) || normalize(profile.title).includes(normalize(title));
    const adjustedScore = includes ? Math.max(score, 0.75) : score;
    if (!best || adjustedScore > best.score) {
      best = { profile, score: adjustedScore };
    }
  }

  return best?.score >= 0.18 ? best : null;
}

async function upsertExternalConvo(client, item, profileMatch) {
  const sourceCode = valueFrom(item, ['codigo', 'code', 'codigoConvocatoria', 'id', 'uuid'])
    || createHash('sha256').update(JSON.stringify(item)).digest('hex');
  const title = valueFrom(item, ['puesto', 'cargo', 'title', 'nombre', 'denominacion', 'name']);
  if (!title) return { skipped: true, sourceCode };

  const sourceUrl = valueFrom(item, ['url', 'enlace', 'link', 'pagina']);
  const publishedRaw = valueFrom(item, ['fechaPublicacion', 'publishedAt', 'fecha_publicacion', 'fecha']);
  const closesRaw = valueFrom(item, ['fechaCierre', 'closesAt', 'fecha_cierre', 'fechaFin']);
  const publishedAt = publishedRaw ? new Date(publishedRaw) : null;
  const closesAt = closesRaw ? new Date(closesRaw) : null;
  const status = profileMatch ? 'matched' : 'unmatched';

  await client.query(
    `INSERT INTO external_convocations
       (source_code, title, source_url, published_at, closes_at, profile_id, match_score, status, raw_payload, last_synced_at)
     VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8, $9::jsonb, now())
     ON CONFLICT (source_code) DO UPDATE SET
       title = EXCLUDED.title,
       source_url = EXCLUDED.source_url,
       published_at = EXCLUDED.published_at,
       closes_at = EXCLUDED.closes_at,
       profile_id = EXCLUDED.profile_id,
       match_score = EXCLUDED.match_score,
       status = EXCLUDED.status,
       raw_payload = EXCLUDED.raw_payload,
       last_synced_at = now()`,
    [
      sourceCode,
      title,
      sourceUrl,
      Number.isNaN(publishedAt?.getTime()) ? null : publishedAt,
      Number.isNaN(closesAt?.getTime()) ? null : closesAt,
      profileMatch?.profile.id ?? null,
      profileMatch?.score ?? null,
      status,
      JSON.stringify(item),
    ],
  );
  return { skipped: false, sourceCode, title, profileId: profileMatch?.profile.id ?? null };
}

export const convocationSyncService = {
  async sync() {
    if (!env.CONVOCATORIAS_API_URL) {
      throw new AppError(503, 'CONVOCATIONS_API_NOT_CONFIGURED', 'Configura CONVOCATORIAS_API_URL antes de sincronizar.');
    }

    const headers = { Accept: 'application/json' };
    if (env.CONVOCATORIAS_API_TOKEN) headers.Authorization = `Bearer ${env.CONVOCATORIAS_API_TOKEN}`;
    const response = await fetch(env.CONVOCATORIAS_API_URL, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new AppError(502, 'CONVOCATIONS_API_ERROR', `La API de convocatorias respondió HTTP ${response.status}.`);
    }

    const contentType = response.headers.get('content-type') || '';
    let items;
    if (contentType.includes('json')) {
      items = extractItems(await response.json());
    } else {
      items = extractHtmlItems(await response.text());
      for (const item of items.slice(0, 20)) {
        try {
          const detailResponse = await fetch(item.url, {
            headers: { Accept: 'text/html' },
            signal: AbortSignal.timeout(15_000),
          });
          if (detailResponse.ok) {
            const detailHtml = await detailResponse.text();
            item.description = detailHtml
              .replace(/<script[\s\S]*?<\/script>/gi, ' ')
              .replace(/<style[\s\S]*?<\/style>/gi, ' ')
              .replace(/<[^>]+>/g, ' ')
              .replace(/&nbsp;/gi, ' ')
              .replace(/\s+/g, ' ')
              .slice(0, 20000);
          }
        } catch {
          item.description = '';
        }
      }
    }
    const profilesResult = await pool.query(
      `SELECT p.id, p.title, p.description, d.name AS department
       FROM position_profiles p
       JOIN departments d ON d.id = p.department_id
       WHERE p.status = 'active'
       ORDER BY p.title`,
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const actorResult = await client.query(
        `SELECT id FROM users
         WHERE is_active = true AND role IN ('admin', 'hr_specialist')
         ORDER BY role = 'admin' DESC, created_at
         LIMIT 1`,
      );
      let matched = 0;
      let unmatched = 0;
      for (const item of items) {
        const title = valueFrom(item, ['puesto', 'cargo', 'title', 'nombre', 'denominacion', 'name']);
        const searchableText = `${title} ${valueFrom(item, ['description', 'descripcion', 'detalle'])}`;
        const profileMatch = matchProfile(searchableText, profilesResult.rows);
        const result = await upsertExternalConvo(client, item, profileMatch);
        if (result.skipped) continue;
        if (!profileMatch) {
          unmatched += 1;
          continue;
        }

        matched += 1;
        if (!actorResult.rows[0]) continue;
        const existing = await client.query(
          `SELECT id FROM coverage_requests
           WHERE external_source = $1 AND external_source_code = $2`,
          [env.CONVOCATORIAS_API_URL, result.sourceCode],
        );
        if (!existing.rowCount) {
          const departmentResult = await client.query(
            `INSERT INTO departments (name) VALUES ($1)
             ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
             RETURNING id`,
            [profileMatch.profile.department],
          );
          const sequenceResult = await client.query("SELECT nextval('coverage_request_code_seq') AS value");
          const code = `SC-${String(sequenceResult.rows[0].value).padStart(5, '0')}`;
          await client.query(
            `INSERT INTO coverage_requests
               (code, department_id, position_id, reason, required_by, status, requested_by,
                external_source, external_source_code)
             VALUES ($1, $2, $3, $4, NULL, 'approved', $5, $6, $7)`,
            [
              code,
              departmentResult.rows[0].id,
              profileMatch.profile.id,
              `Convocatoria municipal sincronizada automáticamente: ${title}.`,
              actorResult.rows[0].id,
              env.CONVOCATORIAS_API_URL,
              result.sourceCode,
            ],
          );
        }
      }
      await client.query('COMMIT');
      return { received: items.length, matched, unmatched };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async list({ status = null } = {}) {
    const result = await pool.query(
      `SELECT e.id, e.source_code AS sourceCode, e.title, e.source_url AS sourceUrl,
              e.published_at AS publishedAt, e.closes_at AS closesAt,
              e.profile_id AS profileId, p.title AS profileTitle, e.match_score AS matchScore,
              e.status, e.last_synced_at AS lastSyncedAt
       FROM external_convocations e
       LEFT JOIN position_profiles p ON p.id = e.profile_id
       WHERE ($1::text IS NULL OR e.status = $1)
       ORDER BY e.last_synced_at DESC, e.title`,
      [status],
    );
    return result.rows;
  },
};
