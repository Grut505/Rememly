import type { Env } from '../types'

export type LogCategory = 'pdf' | 'famileo'
export type LogLevel = 'INFO' | 'WARN' | 'ERROR'

export async function logEvent(
  env: Env,
  category: LogCategory,
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  try {
    await env.DB.prepare(
      `insert into app_logs (id, category, level, message, context_json, created_at)
       values (?1, ?2, ?3, ?4, ?5, ?6)`
    )
      .bind(
        crypto.randomUUID(),
        category,
        level,
        message,
        context ? JSON.stringify(context) : null,
        new Date().toISOString()
      )
      .run()
  } catch {
    // Logging must never break the actual request.
  }
}
