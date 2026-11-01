import {sqliteTable,text,real,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';
export const usageEvents=sqliteTable('usage_events',{
 ownerId:text('owner_id').notNull(),environment:text('environment').notNull(),eventKey:text('event_key').notNull(),
 model:text('model').notNull(),inputTokens:integer('input_tokens').notNull(),outputTokens:integer('output_tokens').notNull(),
 inputPrice:real('input_price').notNull(),outputPrice:real('output_price').notNull(),costUsd:real('cost_usd').notNull(),createdAt:text('created_at').notNull(),
},t=>[primaryKey({columns:[t.ownerId,t.environment,t.eventKey]}),index('usage_owner_time').on(t.ownerId,t.environment,t.createdAt)]);
export const apiKeys=sqliteTable('api_keys',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),label:text('label').notNull(),prefix:text('prefix').notNull(),
 keyHash:text('key_hash').notNull().unique(),environment:text('environment').notNull(),scope:text('scope').notNull(),
 createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),revokedAt:integer('revoked_at'),
},t=>[index('keys_owner').on(t.ownerId)]);
