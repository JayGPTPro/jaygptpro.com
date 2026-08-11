// Minimal in-memory stand-in for the parts of supabase-js this webhook actually uses.
// Tables are plain arrays. Filters are applied at execution time, exactly like PostgREST.
export type Row = Record<string, any>;
export const DB: Record<string, Row[]> = { allowed_emails: [], stripe_customers: [], rounds: [], bina_registrations: [] };
export const LOG: string[] = [];

const norm = (v: any) => (typeof v === 'string' ? v.toLowerCase() : v);

class Query {
  table: string; op: string; payload: any; conflict: string | null;
  filters: Array<(r: Row) => boolean> = [];
  constructor(table: string, op: string, payload?: any, conflict: string | null = null) {
    this.table = table; this.op = op; this.payload = payload; this.conflict = conflict;
  }
  select(_c?: string) { return this; }
  limit(_n: number) { return this; }
  eq(col: string, val: any) { this.filters.push(r => r[col] === val); return this; }
  ilike(col: string, val: string) { this.filters.push(r => norm(r[col]) === norm(val)); return this; }
  is(col: string, val: any) { this.filters.push(r => (r[col] ?? null) === val); return this; }
  not(col: string, _op: string, val: any) { this.filters.push(r => (r[col] ?? null) !== val); return this; }
  or(expr: string) {
    // supports "round.is.null,round.eq.unknown"
    const parts = expr.split(',').map(p => p.trim());
    this.filters.push(r => parts.some(p => {
      const [col, op, val] = p.split('.');
      if (op === 'is') return (r[col] ?? null) === (val === 'null' ? null : val);
      if (op === 'eq') return r[col] === val;
      return false;
    }));
    return this;
  }
  private rows() { return DB[this.table].filter(r => this.filters.every(f => f(r))); }
  private exec() {
    const t = DB[this.table] ||= [];
    if (this.op === 'insert') {
      const row = this.payload;
      const key = norm(row.email);
      if (this.table === 'allowed_emails' && t.some(r => norm(r.email) === key)) {
        LOG.push(`insert ${this.table} DUPLICATE ${key}`);
        return { data: null, error: { message: 'duplicate key value violates unique constraint "allowed_emails_email_key"' } };
      }
      t.push({ ...row }); LOG.push(`insert ${this.table} ${key}`);
      return { data: [row], error: null };
    }
    if (this.op === 'upsert') {
      const row = this.payload; const ck = this.conflict || 'id';
      const i = t.findIndex(r => r[ck] === row[ck]);
      if (i >= 0) { t[i] = { ...t[i], ...row }; LOG.push(`upsert ${this.table} update ${row[ck]}`); }
      else { t.push({ ...row }); LOG.push(`upsert ${this.table} insert ${row[ck]}`); }
      return { data: [row], error: null };
    }
    if (this.op === 'update') {
      const hit = this.rows();
      hit.forEach(r => Object.assign(r, this.payload));
      LOG.push(`update ${this.table} n=${hit.length} ${JSON.stringify(this.payload)}`);
      return { data: hit, error: null };
    }
    const hit = this.rows();
    return { data: hit, error: null };
  }
  maybeSingle() { const r = this.exec(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: r.error }); }
  then(res: any, rej?: any) { return Promise.resolve(this.exec()).then(res, rej); }
}

export function createClient(_u: string, _k: string) {
  return {
    from(table: string) {
      return {
        select: (c?: string) => new Query(table, 'select').select(c),
        insert: (p: any) => new Query(table, 'insert', p),
        update: (p: any) => new Query(table, 'update', p),
        upsert: (p: any, o?: any) => new Query(table, 'upsert', p, o?.onConflict || 'id'),
      };
    },
  } as any;
}
export type SupabaseClient = any;
